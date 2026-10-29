// Drains the offline queue against a client.
//
// Ordering matters: stock moves are posted oldest-first, one at a time, so a receipt always
// lands before the issue that depends on it.
//
// Idempotency: every queued document carries `[MOBILE-INV:<id>]` in `remarks`. Before posting,
// the drain looks for a Stock Entry with that marker, so a retry after a lost response cannot
// double-post stock.
import { ApiError } from "./errors";
import { mobileRef } from "./payloads";
import { MAX_ATTEMPTS, isRetryable, saveOp, sortQueue } from "./queue";
import type { InventoryClient, QueueOp } from "./types";

export interface DrainOutcome {
	synced: number;
	failed: number;
	ops: QueueOp[];
	/** Set when the drain gave up early (all later ops would fail the same way). */
	stopped?: "auth" | "network";
}

export interface DrainOptions {
	onUpdate?: (op: QueueOp) => void;
	maxOps?: number;
	now?: () => Date;
}

export async function drainQueue(
	client: InventoryClient,
	incoming: QueueOp[],
	options: DrainOptions = {}
): Promise<DrainOutcome> {
	const now = options.now ?? (() => new Date());
	const limit = options.maxOps ?? 10;
	let synced = 0;
	let failed = 0;
	let stopped: DrainOutcome["stopped"];
	let processed = 0;

	const queue = sortQueue(incoming).map((op) => ({ ...op }));

	for (const op of queue) {
		if (processed >= limit) break;
		if (op.status === "done" || op.status === "syncing") continue;
		if (op.attempts >= MAX_ATTEMPTS) {
			failed += 1;
			continue;
		}

		processed += 1;
		op.status = "syncing";
		op.attempts += 1;
		op.lastAttemptAt = now().toISOString();
		options.onUpdate?.({ ...op });
		await saveOp(op);

		try {
			const existing = await client.findByReference(mobileRef(op.id));
			if (existing) {
				op.status = "done";
				op.serverName = existing;
				op.error = undefined;
				synced += 1;
			} else {
				const created = await client.createDoc(op.doc);
				const submitted = await client.submitDoc({ ...op.doc, name: created.name });
				op.status = "done";
				op.serverName = submitted.name || created.name;
				op.error = undefined;
				synced += 1;
			}
		} catch (error) {
			const apiError =
				error instanceof ApiError
					? error
					: new ApiError(error instanceof Error ? error.message : String(error), "server");

			op.status = "error";
			op.error = apiError.message;
			failed += 1;

			// Credentials or connectivity are ambient failures: stop instead of burning attempts.
			if (apiError.kind === "auth" || isRetryable(apiError)) {
				stopped = apiError.kind === "auth" ? "auth" : "network";
				await saveOp(op);
				options.onUpdate?.({ ...op });
				break;
			}
		}

		await saveOp(op);
		options.onUpdate?.({ ...op });
	}

	return { synced, failed, ops: queue, stopped };
}
