// The task engine behind every job that is not receiving.
//
// A floor job is a set of lines you work through with a scanner, and a document that is the
// by-product. Counting a rack, putting a delivery away, picking for a work order and picking for a
// delivery differ only in where the lines come from and which document they become — so the
// counting, the refusals and the scan behaviour live here once.
//
// Pure functions only: no DOM, no network. `taskflow.test` drives everything below.

import type {
	FlowLine,
	FlowTask,
	OpSummary,
	QueueOp,
	SalesOrderLine,
	TaskKind,
	WorkOrder,
	WorkOrderLine,
} from "./types";

function mobileRef(id: string): string {
	return `[MOBILE-INV:${id}]`;
}

export function round3(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export function toNumber(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSerials(raw?: string): string[] {
	if (!raw) return [];
	return raw
		.split(/[\s,;]+/)
		.map((value) => value.trim())
		.filter(Boolean);
}

const LABEL: Record<TaskKind, string> = {
	"count-rack": "Rack count",
	putaway: "Put away",
	"pick-wo": "Pick for work order",
	"pick-dn": "Pick for delivery",
};

export function taskLabel(kind: TaskKind): string {
	return LABEL[kind];
}

/** Scanned flows start empty and grow as stock is scanned; document flows start with their lines. */
export function scansAddItems(kind: TaskKind): boolean {
	return kind === "count-rack" || kind === "putaway";
}

export interface FlowHeader {
	title: string;
	subtitle?: string;
	reference: string;
	customer?: string;
	company: string;
	postingDate: string;
	postingTime: string;
	fromWarehouse?: string;
	toWarehouse?: string;
}

export function createFlowTask(id: string, kind: TaskKind, header: FlowHeader, lines: FlowLine[] = []): FlowTask {
	return {
		id,
		kind,
		title: header.title,
		subtitle: header.subtitle,
		reference: header.reference,
		customer: header.customer,
		company: header.company,
		postingDate: header.postingDate,
		postingTime: header.postingTime,
		// Counting is blind by default; a count you can see the answer to is not a count.
		blind: kind === "count-rack",
		fromWarehouse: header.fromWarehouse,
		toWarehouse: header.toWarehouse,
		lines,
	};
}

export function requiredOnLine(line: FlowLine): number {
	return Math.max(0, round3(toNumber(line.requiredQty) - 0));
}

function sameItem(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function addFlowLine(task: FlowTask, line: FlowLine): FlowTask {
	if (task.lines.some((row) => row.key === line.key)) {
		return patchFlowLine(task, line.key, {});
	}
	return { ...task, lines: [...task.lines, line] };
}

export function patchFlowLine(task: FlowTask, key: string, patch: Partial<FlowLine>): FlowTask {
	return {
		...task,
		lines: task.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
	};
}

export function setFlowQty(task: FlowTask, key: string, qty: number): FlowTask {
	return patchFlowLine(task, key, { qty: Math.max(0, round3(toNumber(qty))) });
}

export function removeFlowLine(task: FlowTask, key: string): FlowTask {
	return { ...task, lines: task.lines.filter((line) => line.key !== key) };
}

export function clearFlow(task: FlowTask): FlowTask {
	return { ...task, lines: task.lines.map((line) => ({ ...line, qty: 0 })) };
}

export function toggleFlowBlind(task: FlowTask): FlowTask {
	return { ...task, blind: !task.blind };
}

export type FlowScanOutcome = "matched" | "new-item" | "unknown-item" | "line-complete";

/** One scan is one unit — scanning the same pallet twice is how a person counts two. */
export function applyFlowScan(
	task: FlowTask,
	rawCode: string
): { task: FlowTask; line: FlowLine | null; outcome: FlowScanOutcome } {
	const code = rawCode.trim();
	if (!code) return { task, line: null, outcome: "unknown-item" };

	const index = task.lines.findIndex((line) => {
		if (!sameItem(line.itemCode, code)) return false;
		// A count has no ceiling to scan past; a pick stops at what the document still needs.
		if (task.kind === "count-rack" || line.requiredQty === undefined) return true;
		return line.qty < requiredOnLine(line);
	});
	if (index >= 0) {
		const lines = task.lines.slice();
		lines[index] = { ...lines[index], qty: round3(lines[index].qty + 1) };
		return { task: { ...task, lines }, line: lines[index], outcome: "matched" };
	}

	const known = task.lines.find((line) => sameItem(line.itemCode, code));
	if (known) return { task, line: known, outcome: "line-complete" };
	if (scansAddItems(task.kind)) return { task, line: null, outcome: "new-item" };
	return { task, line: null, outcome: "unknown-item" };
}

export function flowProgress(task: FlowTask): {
	linesTouched: number;
	linesTotal: number;
	units: number;
	expected: number;
} {
	// A count line only exists because someone scanned it — and a count of zero is a captured line,
	// which is exactly the case where the shelf was empty.
	const touched = task.kind === "count-rack" ? task.lines : task.lines.filter((line) => line.qty > 0);
	return {
		linesTouched: touched.length,
		linesTotal: task.lines.length,
		units: round3(task.lines.reduce((sum, line) => sum + line.qty, 0)),
		expected: round3(task.lines.reduce((sum, line) => sum + requiredOnLine(line), 0)),
	};
}

/** Everything the server would refuse, refused here first. */
export function validateFlow(task: FlowTask): string[] {
	const errors: string[] = [];
	const touched = task.lines.filter((line) => line.qty > 0);

	if (!task.lines.length) {
		return ["Nothing scanned yet — start with the first item"];
	}

	if (task.kind === "count-rack") {
		for (const line of task.lines) {
			if (!line.toWarehouse) errors.push(`${line.itemCode}: no warehouse to count into`);
			if (line.hasBatchNo && !line.batchNo?.trim()) errors.push(`${line.itemCode}: enter the batch number`);
		}
		return errors;
	}

	if (!touched.length) {
		return ["Nothing captured yet — scan or enter at least one line"];
	}

	if (task.kind === "putaway") {
		if (!task.fromWarehouse) errors.push("Choose the warehouse the stock is in now");
		if (!task.toWarehouse) errors.push("Choose the warehouse it is going to");
		if (task.fromWarehouse && task.fromWarehouse === task.toWarehouse) {
			errors.push("From and to are the same warehouse");
		}
	}

	for (const line of touched) {
		const from = line.fromWarehouse ?? task.fromWarehouse;
		const to = line.toWarehouse ?? task.toWarehouse;
		if (!from) errors.push(`${line.itemCode}: no warehouse to pick from`);
		// A delivery note takes stock out of one warehouse; there is no "to" to check.
		if (task.kind !== "pick-dn") {
			if (!to) errors.push(`${line.itemCode}: no target warehouse`);
			if (from && to && from === to) errors.push(`${line.itemCode}: source and target are the same`);
		}
		if (line.requiredQty !== undefined && line.qty > requiredOnLine(line)) {
			errors.push(`${line.itemCode}: only ${requiredOnLine(line)} ${line.uom} still open on this task`);
		}
		if (line.hasBatchNo && !line.batchNo?.trim()) errors.push(`${line.itemCode}: enter the batch number`);
		const serials = parseSerials(line.serialNo);
		if (serials.length && serials.length !== line.qty) {
			errors.push(`${line.itemCode}: ${serials.length} serial numbers for ${line.qty} units`);
		}
	}

	return errors;
}

function stockRow(line: FlowLine, from?: string, to?: string): Record<string, unknown> {
	const row: Record<string, unknown> = {
		item_code: line.itemCode,
		qty: line.qty,
		uom: line.uom,
		conversion_factor: line.conversionFactor,
		stock_qty: round3(line.qty * line.conversionFactor),
		...(from ? { s_warehouse: from } : {}),
		...(to ? { t_warehouse: to } : {}),
	};
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
}

export function buildFlowDoc(task: FlowTask): Record<string, unknown> {
	const posting = {
		company: task.company,
		set_posting_time: 1,
		posting_date: task.postingDate,
		posting_time: task.postingTime,
		remarks: `Mobile Inventory · ${LABEL[task.kind]} ${task.reference} · ${mobileRef(task.id)}`,
	};

	if (task.kind === "count-rack") {
		// A zero count is a real answer, so every scanned line goes on the document.
		return {
			doctype: "Stock Reconciliation",
			...posting,
			items: task.lines.map((line) => ({
				item_code: line.itemCode,
				warehouse: line.toWarehouse ?? task.reference,
				qty: line.qty,
				...(line.valuationRate ? { valuation_rate: line.valuationRate } : {}),
				...(line.batchNo?.trim() ? { batch_no: line.batchNo.trim() } : {}),
			})),
		};
	}

	const rows = task.lines.filter((line) => line.qty > 0);

	if (task.kind === "pick-dn") {
		return {
			doctype: "Delivery Note",
			...posting,
			...(task.customer ? { customer: task.customer } : {}),
			items: rows.map((line) => ({
				item_code: line.itemCode,
				qty: line.qty,
				uom: line.uom,
				conversion_factor: line.conversionFactor,
				stock_qty: round3(line.qty * line.conversionFactor),
				warehouse: line.fromWarehouse ?? task.fromWarehouse,
				against_sales_order: task.reference,
				...(line.sourceRow ? { so_detail: line.sourceRow } : {}),
				...(line.batchNo?.trim()
					? { batch_no: line.batchNo.trim(), use_serial_batch_fields: 1 }
					: {}),
			})),
		};
	}

	return {
		doctype: "Stock Entry",
		...posting,
		stock_entry_type: task.kind === "pick-wo" ? "Material Transfer for Manufacture" : "Material Transfer",
		...(task.kind === "pick-wo" ? { work_order: task.reference } : {}),
		items: rows.map((line) =>
			stockRow(line, line.fromWarehouse ?? task.fromWarehouse, line.toWarehouse ?? task.toWarehouse)
		),
	};
}

export function flowSummary(task: FlowTask): OpSummary {
	const progress = flowProgress(task);
	const where =
		task.kind === "count-rack"
			? task.toWarehouse ?? task.reference
			: task.kind === "putaway"
				? `${task.fromWarehouse ?? "—"} → ${task.toWarehouse ?? "—"}`
				: task.reference;
	return {
		kind: task.kind,
		itemCode: task.reference,
		qty: progress.units,
		uom: task.lines.length === 1 ? task.lines[0].uom : "units",
		label: `${LABEL[task.kind]} · ${where} · ${progress.linesTouched} line${
			progress.linesTouched === 1 ? "" : "s"
		}`,
	};
}

export function flowQueueOp(task: FlowTask, now = new Date().toISOString()): QueueOp {
	return {
		id: task.id,
		kind: task.kind,
		createdAt: now,
		status: "pending",
		attempts: 0,
		doc: buildFlowDoc(task),
		summary: flowSummary(task),
		// A pick hands the goods to dispatch; the delivery note is submitted there, not here.
		submit: task.kind !== "pick-dn",
	};
}

/** Work order rows become pick lines: what is still to be issued from the stores. */
export function pickLinesFromWorkOrder(workOrder: WorkOrder, rows: WorkOrderLine[]): FlowLine[] {
	return rows
		.map((row) => ({
			key: row.name,
			itemCode: row.item_code,
			itemName: row.item_name,
			uom: row.stock_uom || "Nos",
			conversionFactor: 1,
			qty: 0,
			requiredQty: Math.max(0, round3(toNumber(row.required_qty) - toNumber(row.transferred_qty))),
			fromWarehouse: row.source_warehouse || workOrder.source_warehouse,
			toWarehouse: workOrder.wip_warehouse,
			sourceRow: row.name,
		}))
		.filter((line) => line.requiredQty > 0);
}

/** Sales order rows become pick lines: what is still to be delivered. */
export function pickLinesFromSalesOrder(rows: SalesOrderLine[], fallbackWarehouse?: string): FlowLine[] {
	return rows
		.map((row) => ({
			key: row.name,
			itemCode: row.item_code,
			itemName: row.item_name,
			uom: row.uom || row.stock_uom || "Nos",
			conversionFactor: toNumber(row.conversion_factor) > 0 ? toNumber(row.conversion_factor) : 1,
			qty: 0,
			requiredQty: Math.max(0, round3(toNumber(row.qty) - toNumber(row.delivered_qty))),
			fromWarehouse: row.warehouse || fallbackWarehouse,
			sourceRow: row.name,
		}))
		.filter((line) => line.requiredQty > 0);
}
