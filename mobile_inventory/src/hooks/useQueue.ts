import { useCallback, useEffect, useRef, useState } from "react";
import { loadQueue, pendingCount, removeOp, retryDelayMs, saveOp } from "../lib/queue";
import { drainQueue } from "../lib/sync";
import type { InventoryClient, QueueOp } from "../lib/types";
import type { Notify } from "./useToasts";

function mergeOp(list: QueueOp[], op: QueueOp): QueueOp[] {
	const found = list.some((row) => row.id === op.id);
	const next = found ? list.map((row) => (row.id === op.id ? op : row)) : [op, ...list];
	return [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function useQueue(client: InventoryClient | null, online: boolean, enabled: boolean, notify: Notify) {
	const [ops, setOps] = useState<QueueOp[]>([]);
	const [syncing, setSyncing] = useState(false);
	const clientRef = useRef(client);
	const notifyRef = useRef(notify);
	const runningRef = useRef(false);
	const mountedRef = useRef(true);
	const retryTimerRef = useRef<number | null>(null);
	const syncRef = useRef<() => Promise<void>>(async () => {});

	clientRef.current = client;
	notifyRef.current = notify;

	const clearRetry = useCallback(() => {
		if (retryTimerRef.current !== null) {
			window.clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
		};
	}, []);

	const refresh = useCallback(async () => {
		const next = await loadQueue();
		if (mountedRef.current) setOps(next);
	}, []);

	const enqueue = useCallback(
		async (op: QueueOp) => {
			await saveOp(op);
			await refresh();
		},
		[refresh]
	);

	const remove = useCallback(
		async (id: string) => {
			await removeOp(id);
			await refresh();
		},
		[refresh]
	);

	const syncNow = useCallback(async () => {
		clearRetry();
		if (runningRef.current) return;
		const current = clientRef.current;
		if (!current) return;

		const stored = await loadQueue();
		const workable = stored.filter((op) => op.status !== "done");
		if (!workable.length) {
			await refresh();
			return;
		}

		runningRef.current = true;
		if (mountedRef.current) setSyncing(true);
		try {
			const outcome = await drainQueue(current, stored, {
				onUpdate: (op) => {
					if (mountedRef.current) setOps((list) => mergeOp(list, op));
				},
			});
			if (outcome.synced) {
				notifyRef.current(
					`Synced ${outcome.synced} transaction${outcome.synced === 1 ? "" : "s"}`,
					"success"
				);
			}
			if (outcome.stopped === "auth") notifyRef.current("Sign in again to sync", "error");
			else if (outcome.stopped === "network") {
				// The server was unreachable: back off and try again without user involvement.
				const attempts = Math.max(
					1,
					...outcome.ops.filter((op) => op.status === "error").map((op) => op.attempts)
				);
				notifyRef.current("Connection problem — will retry automatically", "info");
				retryTimerRef.current = window.setTimeout(() => {
					retryTimerRef.current = null;
					void syncRef.current();
				}, retryDelayMs(attempts));
			} else if (outcome.failed) {
				notifyRef.current(
					`${outcome.failed} transaction${outcome.failed === 1 ? "" : "s"} need attention`,
					"error"
				);
			}
		} finally {
			runningRef.current = false;
			if (mountedRef.current) setSyncing(false);
			await refresh();
		}
	}, [clearRetry, refresh]);

	syncRef.current = syncNow;

	const retry = useCallback(
		async (op: QueueOp) => {
			await saveOp({ ...op, status: "pending", attempts: 0, error: undefined });
			await refresh();
			await syncNow();
		},
		[refresh, syncNow]
	);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (enabled && online) void syncNow();
	}, [enabled, online, syncNow]);

	return { ops, pending: pendingCount(ops), syncing, enqueue, remove, retry, syncNow, refresh };
}
