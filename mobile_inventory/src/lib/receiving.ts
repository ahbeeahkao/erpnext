// Receiving against a purchase order.
//
// The Desk makes you build a Purchase Receipt line by line, from a form, at a desk. On the floor the
// job is the reverse: a lorry arrives, you count what comes off it, and the document is the
// by-product. So this module holds the open PO lines, a scan adds one unit to the line it matches,
// and one Purchase Receipt is built at the end — with `purchase_order` and `purchase_order_item`
// intact, so the three-way match and the PO's received quantity still work.
//
// Pure functions only: no DOM, no network. `receipt.test` drives everything below.

import type { OpSummary, PurchaseOrderLine, QueueOp, ReceiptLine, ReceiptTask } from "./types";

// Kept local so this module has no runtime imports: Node runs the tests straight off the .ts
// source, and a relative runtime import there needs an explicit extension. Same behaviour as
// `mobileRef` / `parseSerials` in payloads.ts — one marker format for every mobile document.
function mobileRef(id: string): string {
	return `[MOBILE-INV:${id}]`;
}

export function parseSerials(raw?: string): string[] {
	if (!raw) return [];
	return raw
		.split(/[\s,;]+/)
		.map((value) => value.trim())
		.filter(Boolean);
}

/** ERPNext blocks over-receipt unless Buying Settings allows a percentage. Default: none. */
export const DEFAULT_TOLERANCE = 0;

export function round3(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export function toNumber(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function remainingToReceive(line: ReceiptLine): number {
	return Math.max(0, round3(toNumber(line.orderedQty) - toNumber(line.alreadyReceived)));
}

function allowance(line: ReceiptLine, tolerancePercent: number): number {
	if (!tolerancePercent) return 0;
	return round3((remainingToReceive(line) * tolerancePercent) / 100);
}

function sameItem(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface ReceiptHeader {
	order: string;
	supplier?: string;
	company: string;
	/** Captured when the task is opened, not when it syncs. */
	postingDate: string;
	postingTime: string;
}

/** Opens a task: every PO line starts at zero, so a blind count is the default experience. */
export function createReceiptTask(
	taskId: string,
	header: ReceiptHeader,
	lines: PurchaseOrderLine[]
): ReceiptTask {
	return {
		id: taskId,
		order: header.order,
		supplier: header.supplier,
		company: header.company,
		postingDate: header.postingDate,
		postingTime: header.postingTime,
		blind: false,
		lines: lines.map((line) => ({
			key: line.name,
			itemCode: line.item_code,
			itemName: line.item_name,
			uom: line.uom || line.stock_uom || "Nos",
			stockUom: line.stock_uom,
			conversionFactor: toNumber(line.conversion_factor) > 0 ? toNumber(line.conversion_factor) : 1,
			warehouse: line.warehouse ?? "",
			orderedQty: toNumber(line.qty),
			alreadyReceived: toNumber(line.received_qty),
			receivedNow: 0,
			rate: toNumber(line.rate),
		})),
	};
}

export type ScanOutcome = "matched" | "unknown-item" | "line-complete";

/**
 * Adds one unit to the first line that matches the scanned code and still needs stock.
 * Scanning the same carton twice is how a counter counts; typing is the fallback, not the default.
 */
export function applyScan(
	task: ReceiptTask,
	code: string,
	{ tolerancePercent = DEFAULT_TOLERANCE }: { tolerancePercent?: number } = {}
): { task: ReceiptTask; line: ReceiptLine | null; outcome: ScanOutcome } {
	const known = task.lines.some((line) => sameItem(line.itemCode, code));
	if (!known) {
		return { task, line: null, outcome: "unknown-item" };
	}

	const index = task.lines.findIndex(
		(line) =>
			sameItem(line.itemCode, code) &&
			line.receivedNow < remainingToReceive(line) + allowance(line, tolerancePercent)
	);
	if (index < 0) {
		return { task, line: null, outcome: "line-complete" };
	}

	const lines = task.lines.slice();
	lines[index] = { ...lines[index], receivedNow: round3(lines[index].receivedNow + 1) };
	return { task: { ...task, lines }, line: lines[index], outcome: "matched" };
}

export function setLineQty(task: ReceiptTask, key: string, qty: number): ReceiptTask {
	const next = Math.max(0, round3(toNumber(qty)));
	return {
		...task,
		lines: task.lines.map((line) => (line.key === key ? { ...line, receivedNow: next } : line)),
	};
}

export function setLineRejected(task: ReceiptTask, key: string, qty: number): ReceiptTask {
	const next = Math.max(0, round3(toNumber(qty)));
	return {
		...task,
		lines: task.lines.map((line) =>
			line.key === key
				? { ...line, rejectedNow: Math.min(next, line.receivedNow) }
				: line
		),
	};
}

export function patchLine(task: ReceiptTask, key: string, patch: Partial<ReceiptLine>): ReceiptTask {
	return {
		...task,
		lines: task.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
	};
}

export function clearReceipt(task: ReceiptTask): ReceiptTask {
	return { ...task, lines: task.lines.map((line) => ({ ...line, receivedNow: 0, rejectedNow: 0 })) };
}

export function toggleBlind(task: ReceiptTask): ReceiptTask {
	return { ...task, blind: !task.blind };
}

export function receiptProgress(task: ReceiptTask): {
	linesTouched: number;
	linesTotal: number;
	units: number;
	ordered: number;
} {
	const touched = task.lines.filter((line) => line.receivedNow > 0);
	return {
		linesTouched: touched.length,
		linesTotal: task.lines.length,
		units: round3(touched.reduce((sum, line) => sum + line.receivedNow, 0)),
		ordered: round3(task.lines.reduce((sum, line) => sum + remainingToReceive(line), 0)),
	};
}

/**
 * Validation the server would otherwise reject hours later. Everything here is checkable on the
 * device: the operator should never learn about a short line from the queue screen.
 */
export function validateReceipt(task: ReceiptTask, { tolerancePercent = DEFAULT_TOLERANCE } = {}): string[] {
	const errors: string[] = [];
	const touched = task.lines.filter((line) => line.receivedNow > 0);

	if (!touched.length) {
		errors.push("Nothing received yet — scan or enter at least one line");
	}

	for (const line of touched) {
		if (line.receivedNow > remainingToReceive(line) + allowance(line, tolerancePercent)) {
			errors.push(`${line.itemCode}: only ${remainingToReceive(line)} ${line.uom} left on this order`);
		}
		if (!line.warehouse) {
			errors.push(`${line.itemCode}: the order line has no warehouse`);
		}
		if ((line.rejectedNow ?? 0) > line.receivedNow) {
			errors.push(`${line.itemCode}: you cannot reject more than arrived`);
		}
		if ((line.rejectedNow ?? 0) > 0 && !line.rejectedWarehouse) {
			errors.push(`${line.itemCode}: choose where the rejected quantity goes`);
		}
		if (line.hasBatchNo && !line.batchNo?.trim()) {
			errors.push(`${line.itemCode}: enter the batch number`);
		}
		if (line.serialNo?.trim()) {
			const serials = parseSerials(line.serialNo);
			if (serials.length !== line.receivedNow) {
				errors.push(
					`${line.itemCode}: ${serials.length} serial numbers for ${line.receivedNow} units`
				);
			}
		}
	}

	return errors;
}

/** Only touched lines go on the document, so a 40-line PO produces a receipt for what arrived. */
export function buildPurchaseReceiptDoc(task: ReceiptTask): Record<string, unknown> {
	const items = task.lines
		.filter((line) => line.receivedNow > 0)
		.map((line) => {
			const row: Record<string, unknown> = {
				item_code: line.itemCode,
				qty: line.receivedNow,
				uom: line.uom,
				conversion_factor: line.conversionFactor,
				stock_qty: round3(line.receivedNow * line.conversionFactor),
				warehouse: line.warehouse,
				purchase_order: task.order,
				purchase_order_item: line.key,
			};
			if ((line.rejectedNow ?? 0) > 0) {
				row.rejected_qty = line.rejectedNow;
				row.rejected_warehouse = line.rejectedWarehouse;
			}
			if (line.batchNo?.trim()) {
				row.batch_no = line.batchNo.trim();
				row.use_serial_batch_fields = 1;
			}
			const serials = parseSerials(line.serialNo);
			if (serials.length) {
				row.serial_no = serials.join("\n");
				row.use_serial_batch_fields = 1;
			}
			return row;
		});

	return {
		doctype: "Purchase Receipt",
		company: task.company,
		...(task.supplier ? { supplier: task.supplier } : {}),
		set_posting_time: 1,
		posting_date: task.postingDate,
		posting_time: task.postingTime,
		remarks: `Mobile Inventory · Receiving ${task.order} · ${mobileRef(task.id)}`,
		items,
	};
}

export function receiptSummary(task: ReceiptTask): OpSummary {
	const touched = task.lines.filter((line) => line.receivedNow > 0);
	return {
		kind: "po-receipt",
		itemCode: task.order,
		qty: round3(touched.reduce((sum, line) => sum + line.receivedNow, 0)),
		uom: touched.length === 1 ? touched[0].uom : "units",
		label: `Receipt · PO ${task.order} · ${touched.length} line${touched.length === 1 ? "" : "s"}`,
	};
}

/** The queue operation for a finished receipt. Same shape as a move, so nothing downstream changes. */
export function receiptQueueOp(task: ReceiptTask, now = new Date().toISOString()): QueueOp {
	return {
		id: task.id,
		kind: "po-receipt",
		createdAt: now,
		status: "pending",
		attempts: 0,
		doc: buildPurchaseReceiptDoc(task),
		summary: receiptSummary(task),
	};
}
