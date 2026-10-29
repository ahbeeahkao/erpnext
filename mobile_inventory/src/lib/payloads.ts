// Pure payload builders and validators. No DOM, no network — unit tested in tests/payloads.test.mjs.
//
// These build the exact documents ERPNext expects:
//   Stock Entry           -> erpnext/stock/doctype/stock_entry
//   Stock Reconciliation  -> erpnext/stock/doctype/stock_reconciliation
//
// Notes verified against the ERPNext source:
// * `use_serial_batch_fields` is honoured on Stock Entry Detail and Stock Reconciliation Item,
//   so the app can post plain `batch_no` / `serial_no` values (Stock Settings
//   "Use Serial / Batch Fields" should be enabled for smooth batch posting).
// * Stock Reconciliation fills `expense_account` / `cost_center` from the Company when omitted,
//   and drops rows with no quantity change, which makes counts re-sendable.
import type { CountInput, ItemInfo, MoveInput, MoveKind, ScanMatch } from "./types";

export const MOBILE_REF_PREFIX = "MOBILE-INV";
export const MAX_QTY = 1_000_000;

const STOCK_ENTRY_TYPE: Record<MoveKind, string> = {
	receipt: "Material Receipt",
	issue: "Material Issue",
	transfer: "Material Transfer",
};

export const MOVE_LABEL: Record<MoveKind, string> = {
	receipt: "Receive",
	issue: "Issue",
	transfer: "Transfer",
};

/** Idempotency marker embedded in `remarks`, so a retried op is never posted twice. */
export function mobileRef(id: string): string {
	return `[${MOBILE_REF_PREFIX}:${id}]`;
}

export function remarksFor(id: string, what: string, note?: string): string {
	const base = `Mobile Inventory · ${what} · ${mobileRef(id)}`;
	const trimmed = note?.trim();
	return trimmed ? `${base} · ${trimmed.slice(0, 200)}` : base;
}

export function parseSerials(raw?: string): string[] {
	if (!raw) return [];
	return raw
		.split(/[\s,;]+/)
		.map((value) => value.trim())
		.filter(Boolean);
}

export function isPositiveQty(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

export function validateQty(value: number, max = MAX_QTY): string | null {
	if (!Number.isFinite(value)) return "Enter a quantity";
	if (value <= 0) return "Quantity must be greater than zero";
	if (value > max) return `Quantity looks too large (max ${max.toLocaleString()})`;
	return null;
}

export function validateMove(
	input: MoveInput,
	item?: Pick<ItemInfo, "has_batch_no" | "has_serial_no">
): string[] {
	const errors: string[] = [];

	if (!input.itemCode) errors.push("Pick an item first");

	const qtyError = validateQty(input.qty);
	if (qtyError) errors.push(qtyError);

	if (!input.uom) errors.push("Unit of measure is required");

	if (input.kind === "receipt" && !input.toWarehouse)
		errors.push("Choose the warehouse receiving the stock");
	if (input.kind === "issue" && !input.fromWarehouse) errors.push("Choose the warehouse the stock leaves");
	if (input.kind === "transfer") {
		if (!input.fromWarehouse) errors.push("Choose the source warehouse");
		if (!input.toWarehouse) errors.push("Choose the destination warehouse");
		if (input.fromWarehouse && input.fromWarehouse === input.toWarehouse) {
			errors.push("Source and destination warehouses must differ");
		}
	}

	if (input.kind === "receipt") {
		const rate = input.rate ?? 0;
		if (!input.zeroValuation && !(Number.isFinite(rate) && rate > 0)) {
			errors.push("Enter a unit cost, or tick “Zero value receipt”");
		}
	}

	if (item?.has_batch_no && !input.batchNo?.trim()) {
		errors.push("This item is batch-tracked — scan or type a batch number");
	}

	if (item?.has_serial_no) {
		const serials = parseSerials(input.serialNo);
		if (!serials.length) {
			errors.push("This item is serialised — scan or type serial numbers");
		} else if (serials.length !== Math.round(input.qty)) {
			errors.push(`Serial count (${serials.length}) must equal the quantity (${input.qty})`);
		}
	}

	return errors;
}

export interface DocContext {
	company: string;
	postingDate: string;
}

export function buildStockEntryDoc(input: MoveInput, ctx: DocContext): Record<string, unknown> {
	const serials = parseSerials(input.serialNo);
	const row: Record<string, unknown> = {
		item_code: input.itemCode,
		qty: input.qty,
		uom: input.uom,
	};

	if (input.kind === "issue" || input.kind === "transfer") row.s_warehouse = input.fromWarehouse;
	if (input.kind === "receipt" || input.kind === "transfer") row.t_warehouse = input.toWarehouse;

	if (input.batchNo?.trim()) {
		row.batch_no = input.batchNo.trim();
		row.use_serial_batch_fields = 1;
	}
	if (serials.length) {
		row.serial_no = serials.join("\n");
		row.use_serial_batch_fields = 1;
	}

	if (input.kind === "receipt") {
		if (input.zeroValuation) row.allow_zero_valuation_rate = 1;
		else if (input.rate && input.rate > 0) row.basic_rate = input.rate;
	}

	const doc: Record<string, unknown> = {
		doctype: "Stock Entry",
		stock_entry_type: STOCK_ENTRY_TYPE[input.kind],
		company: ctx.company,
		posting_date: ctx.postingDate,
		remarks: remarksFor(input.id, STOCK_ENTRY_TYPE[input.kind], input.note),
		items: [row],
	};

	if (input.kind === "transfer") {
		doc.from_warehouse = input.fromWarehouse;
		doc.to_warehouse = input.toWarehouse;
	}

	return doc;
}

export function validateCount(input: CountInput, item?: Pick<ItemInfo, "has_batch_no">): string[] {
	const errors: string[] = [];
	if (!input.itemCode) errors.push("Pick an item first");
	if (!input.warehouse) errors.push("Choose the warehouse being counted");
	if (!Number.isFinite(input.qty) || input.qty < 0) errors.push("Counted quantity must be zero or more");
	if (item?.has_batch_no && !input.batchNo?.trim())
		errors.push("This item is batch-tracked — pick the batch counted");
	return errors;
}

export function buildReconciliationDoc(input: CountInput, ctx: DocContext): Record<string, unknown> {
	const row: Record<string, unknown> = {
		item_code: input.itemCode,
		warehouse: input.warehouse,
		qty: input.qty,
		stock_uom: input.uom,
	};
	if (input.valuationRate && input.valuationRate > 0) row.valuation_rate = input.valuationRate;
	if (input.batchNo?.trim()) {
		row.batch_no = input.batchNo.trim();
		row.use_serial_batch_fields = 1;
	}

	return {
		doctype: "Stock Reconciliation",
		purpose: "Stock Reconciliation",
		company: ctx.company,
		posting_date: ctx.postingDate,
		remarks: remarksFor(input.id, "Stock Reconciliation", input.note),
		items: [row],
	};
}

/**
 * Normalises `erpnext.stock.utils.scan_barcode` output.
 * Shapes produced by the server:
 *   {item_code, barcode, uom, record_type: "Item Barcode", has_batch_no, has_serial_no}
 *   {item_code, serial_no, serial_no_id, batch_no, record_type: "Serial No", ...}
 *   {item_code, batch_no, batch_id, record_type: "Batch", ...}
 *   {candidates: [...]} | {warehouse: "..."} | {}
 */
export function parseScanResponse(raw: unknown, scanned?: string): ScanMatch {
	const data = (raw ?? {}) as Record<string, any>;

	const candidates = Array.isArray(data.candidates) ? data.candidates : null;
	if (candidates?.length) {
		return {
			kind: "candidates",
			raw: scanned,
			candidates: candidates.map((row: Record<string, any>) => ({
				item_code: row.item_code,
				barcode: row.barcode,
				uom: row.uom,
				batch_no: row.batch_no,
				serial_no: row.serial_no,
			})),
		};
	}

	if (!data.item_code && data.warehouse) {
		return { kind: "warehouse", warehouse: data.warehouse, raw: scanned };
	}

	if (!data.item_code) return { kind: "none", raw: scanned };

	return {
		kind: "item",
		item_code: data.item_code,
		uom: data.uom,
		batch_no: data.batch_no,
		serial_no: data.serial_no ?? data.serial_no_id,
		has_batch_no: data.has_batch_no,
		has_serial_no: data.has_serial_no,
		raw: scanned,
	};
}

/** Newest-first, then pending-first, so the queue list reads naturally. */
export function describeOp(op: {
	kind: string;
	summary: { itemCode: string; qty: number; uom: string };
}): string {
	const label = op.kind === "count" ? "Count" : MOVE_LABEL[op.kind as MoveKind] ?? op.kind;
	return `${label} · ${op.summary.itemCode} · ${op.summary.qty} ${op.summary.uom}`;
}
