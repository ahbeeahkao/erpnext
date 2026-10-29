// Offline queue persistence + pure queue helpers.

import type { ApiError } from "./errors";
import { clearStore, deleteRecord, putRecord, readAll } from "./storage.ts";
import type { QueueOp } from "./types";

export const MAX_ATTEMPTS = 6;
const KEEP_DONE = 25;

export async function loadQueue(): Promise<QueueOp[]> {
	return pruneQueue(sortQueue(await readAll<QueueOp>("queue")));
}

export function sortQueue(ops: QueueOp[]): QueueOp[] {
	return [...ops].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Keeps every unfinished op, plus the most recent finished ones for context. */
export function pruneQueue(ops: QueueOp[], keepDone = KEEP_DONE): QueueOp[] {
	const unfinished = ops.filter((op) => op.status !== "done");
	const done = ops
		.filter((op) => op.status === "done")
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, keepDone);
	return [...unfinished, ...done].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveOp(op: QueueOp): Promise<void> {
	await putRecord("queue", op as unknown as { id: string });
}

export async function removeOp(id: string): Promise<void> {
	await deleteRecord("queue", id);
}

export async function clearQueue(): Promise<void> {
	await clearStore("queue");
}

export function pendingCount(ops: QueueOp[]): number {
	return ops.filter((op) => op.status === "pending" || op.status === "syncing" || op.status === "error")
		.length;
}

/** 2s, 6s, 18s, 54s … capped at 5 minutes, with ±20% jitter. */
export function retryDelayMs(attempts: number, random: () => number = Math.random): number {
	const base = Math.min(300_000, 2_000 * Math.pow(3, Math.max(0, attempts - 1)));
	return Math.round(base * (0.8 + random() * 0.4));
}

/** Network/server faults are worth retrying; validation and permission errors are not. */
export function isRetryable(error: ApiError): boolean {
	return error.kind === "network" || error.kind === "server";
}
