// Unit tests for the pure logic: document payloads, validation, scan parsing, queue maths.
// Run with `npm test` (Node strips the TypeScript types natively).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildReconciliationDoc,
	buildStockEntryDoc,
	MOVE_ENTRY_TYPE,
	OP_LABELS,
	mobileRef,
	parseScanResponse,
	parseSerials,
	remarksFor,
	validateCount,
	validateMove,
	validateQty,
} from "../src/lib/payloads.ts";
import {
	applyScan,
	buildPurchaseReceiptDoc,
	clearReceipt,
	createReceiptTask,
	receiptProgress,
	receiptQueueOp,
	remainingToReceive,
	setLineQty,
	setLineRejected,
	toggleBlind,
	validateReceipt,
} from "../src/lib/receiving.ts";
import { pruneQueue, retryDelayMs, sortQueue } from "../src/lib/queue.ts";
import { describeOp } from "../src/lib/payloads.ts";
import { serverMessage, stripHtml, toApiError } from "../src/lib/errors.ts";

const ctx = { company: "Demo Co", postingDate: "2026-10-30" };

const baseMove = (overrides = {}) => ({
	id: "op-1",
	itemCode: "FG-1001",
	qty: 5,
	uom: "Kg",
	fromWarehouse: "Stores - DC",
	toWarehouse: "Packing - DC",
	...overrides,
});

describe("the transfer payload", () => {
	it("builds a Material Transfer with both warehouses and the device marker", () => {
		const doc = buildStockEntryDoc(baseMove(), ctx);
		assert.equal(doc.doctype, "Stock Entry");
		assert.equal(doc.stock_entry_type, MOVE_ENTRY_TYPE);
		assert.equal(doc.company, "Demo Co");
		assert.equal(doc.posting_date, "2026-10-30");
		assert.ok(String(doc.remarks).includes(mobileRef("op-1")));
		assert.equal(doc.from_warehouse, "Stores - DC");
		assert.equal(doc.to_warehouse, "Packing - DC");
		const row = doc.items[0];
		assert.deepEqual(
			{ item: row.item_code, qty: row.qty, uom: row.uom, s: row.s_warehouse, t: row.t_warehouse },
			{ item: "FG-1001", qty: 5, uom: "Kg", s: "Stores - DC", t: "Packing - DC" }
		);
		assert.equal(row.basic_rate, undefined, "a transfer does not revalue stock");
		assert.equal(row.allow_zero_valuation_rate, undefined);
	});

	it("sends batch and serial values with use_serial_batch_fields", () => {
		const doc = buildStockEntryDoc(
			baseMove({ batchNo: "B-9", serialNo: "SN1\nSN2", qty: 2, uom: "Nos" }),
			ctx
		);
		assert.equal(doc.items[0].batch_no, "B-9");
		assert.equal(doc.items[0].serial_no, "SN1\nSN2");
		assert.equal(doc.items[0].use_serial_batch_fields, 1);
	});

	it("keeps the note in remarks but trims it", () => {
		const doc = buildStockEntryDoc(baseMove({ note: "  for the packing line  " }), ctx);
		assert.match(String(doc.remarks), /· for the packing line$/);
		assert.ok(String(doc.remarks).startsWith("Mobile Inventory · Material Transfer"));
		const remarks = remarksFor("op-2", "Material Transfer", "  damaged  ");
		assert.ok(remarks.endsWith("· damaged"));
		assert.ok(remarks.includes("[MOBILE-INV:op-2]"));
	});

	it("splits serial numbers the way a scanner delivers them", () => {
		assert.deepEqual(parseSerials("SN1 SN2,SN3;SN4"), ["SN1", "SN2", "SN3", "SN4"]);
		assert.deepEqual(parseSerials("   "), []);
	});

	it("still describes a queue entry captured by an older build", () => {
		const legacy = { kind: "receipt", summary: { itemCode: "FG-1001", qty: 2, uom: "Kg" } };
		assert.equal(describeOp(legacy), "Receipt · FG-1001 · 2 Kg");
		assert.equal(OP_LABELS.receipt, "Receipt");
		assert.equal(OP_LABELS.transfer, "Transfer");
	});
});

describe("transfer validation", () => {
	it("accepts a complete transfer", () => {
		assert.deepEqual(validateMove(baseMove()), []);
	});

	it("rejects zero, negative and non-numeric quantities", () => {
		assert.ok(validateMove(baseMove({ qty: 0 })).some((error) => error.includes("greater than zero")));
		assert.ok(validateMove(baseMove({ qty: -2 })).length > 0);
		assert.ok(validateMove(baseMove({ qty: Number.NaN })).length > 0);
		assert.equal(validateQty(3), null);
	});

	it("needs two warehouses, and they must differ", () => {
		assert.ok(validateMove(baseMove({ fromWarehouse: "" })).includes("Choose the source warehouse"));
		assert.ok(validateMove(baseMove({ toWarehouse: "" })).includes("Choose the destination warehouse"));
		assert.ok(
			validateMove(baseMove({ toWarehouse: "Stores - DC" })).includes(
				"Source and destination warehouses must differ"
			)
		);
	});

	it("asks for a batch or serials when the item is tracked", () => {
		assert.ok(
			validateMove(baseMove(), { has_batch_no: 1, has_serial_no: 0 }).some((error) =>
				error.includes("batch number")
			)
		);
		assert.deepEqual(validateMove(baseMove({ batchNo: "B-1" }), { has_batch_no: 1, has_serial_no: 0 }), []);
		assert.ok(
			validateMove(baseMove(), { has_batch_no: 0, has_serial_no: 1 }).some((error) =>
				error.includes("serial numbers")
			)
		);
		assert.ok(
			validateMove(baseMove({ serialNo: "SN1", qty: 2 }), { has_batch_no: 0, has_serial_no: 1 }).some(
				(error) => error.includes("must equal the quantity")
			)
		);
	});
});

describe("stock reconciliation payloads", () => {
	const count = {
		id: "count-1",
		itemCode: "FG-1002",
		qty: 0,
		uom: "Nos",
		warehouse: "Stores - DC",
	};

	it("builds a reconciliation row and keeps zero counts", () => {
		const doc = buildReconciliationDoc(count, ctx);
		assert.equal(doc.doctype, "Stock Reconciliation");
		assert.equal(doc.purpose, "Stock Reconciliation");
		assert.equal(doc.items[0].qty, 0);
		assert.equal(doc.items[0].warehouse, "Stores - DC");
		assert.equal(doc.items[0].stock_uom, "Nos");
		assert.ok(String(doc.remarks).includes("[MOBILE-INV:count-1]"));
	});

	it("adds valuation rate and batch when given", () => {
		const doc = buildReconciliationDoc({ ...count, qty: 4, valuationRate: 9.5, batchNo: "B-1" }, ctx);
		assert.equal(doc.items[0].valuation_rate, 9.5);
		assert.equal(doc.items[0].batch_no, "B-1");
		assert.equal(doc.items[0].use_serial_batch_fields, 1);
	});

	it("rejects negative counts and missing warehouse", () => {
		assert.ok(validateCount({ ...count, qty: -1 }).length > 0);
		assert.ok(validateCount({ ...count, warehouse: "" }).length > 0);
		assert.deepEqual(validateCount({ ...count, qty: 0 }), []);
	});
});

describe("scan response parsing", () => {
	it("parses an item barcode hit", () => {
		const match = parseScanResponse(
			{
				barcode: "8901234567890",
				item_code: "FG-1001",
				uom: "Kg",
				record_type: "Item Barcode",
				has_batch_no: 1,
				has_serial_no: 0,
			},
			"8901234567890"
		);
		assert.equal(match.kind, "item");
		assert.equal(match.item_code, "FG-1001");
		assert.equal(match.has_batch_no, 1);
		assert.equal(match.raw, "8901234567890");
	});

	it("parses batch and serial scans", () => {
		const batch = parseScanResponse({
			batch_no: "B-1",
			batch_id: "B-1",
			item_code: "FG-1001",
			record_type: "Batch",
		});
		assert.equal(batch.batch_no, "B-1");

		const serial = parseScanResponse({
			serial_no: "SN1",
			serial_no_id: "SN1",
			item_code: "EQ-1",
			record_type: "Serial No",
		});
		assert.equal(serial.serial_no, "SN1");
	});

	it("parses candidate lists, warehouse hits and misses", () => {
		const candidates = parseScanResponse({
			candidates: [
				{ item_code: "A", barcode: "111" },
				{ item_code: "B", barcode: "111" },
			],
		});
		assert.equal(candidates.kind, "candidates");
		assert.equal(candidates.candidates.length, 2);

		assert.equal(parseScanResponse({ warehouse: "Stores - DC" }).kind, "warehouse");
		assert.equal(parseScanResponse({}).kind, "none");
		assert.equal(parseScanResponse(null).kind, "none");
	});
});

describe("queue helpers", () => {
	const op = (id, overrides = {}) => ({
		id,
		kind: "receipt",
		createdAt: `2026-10-30T10:00:0${id}Z`,
		status: "pending",
		attempts: 0,
		doc: {},
		summary: { kind: "receipt", itemCode: "X", qty: 1, uom: "Nos" },
		...overrides,
	});

	it("keeps failed work and trims old completed rows", () => {
		const ops = [
			op("1", { status: "done" }),
			op("2", { status: "error" }),
			op("3", { status: "done" }),
			op("4", { status: "pending" }),
		];
		const pruned = pruneQueue(ops, 1);
		const ids = pruned.map((row) => row.id).sort();
		assert.deepEqual(ids, ["2", "3", "4"]);
	});

	it("orders oldest first for posting", () => {
		const sorted = sortQueue([op("2"), op("1"), op("3")]);
		assert.deepEqual(
			sorted.map((row) => row.id),
			["1", "2", "3"]
		);
	});

	it("backs off exponentially but never beyond five minutes", () => {
		assert.equal(
			retryDelayMs(1, () => 0.5),
			2000
		);
		assert.ok(retryDelayMs(3, () => 0.5) > retryDelayMs(2, () => 0.5));
		assert.ok(retryDelayMs(20, () => 1) <= 360_000);
	});
});

describe("frappe error handling", () => {
	it("prefers the server message list and strips HTML", () => {
		const body = {
			_server_messages: JSON.stringify([
				JSON.stringify({ message: "<p>Item <b>FG-1001</b> is not in stock</p>" }),
			]),
		};
		assert.equal(serverMessage(body), "Item FG-1001 is not in stock");
	});

	it("falls back to the exception tail and classifies the status", () => {
		const error = toApiError(417, {
			exception: "frappe.exceptions.ValidationError: Quantity must be > 0",
		});
		assert.equal(error.kind, "validation");
		assert.equal(error.message, "Quantity must be > 0");
		assert.equal(toApiError(403, {}).kind, "permission");
		assert.equal(toApiError(401, {}).kind, "auth");
		assert.equal(toApiError(500, {}).kind, "server");
		assert.equal(stripHtml("a<br>b &amp; c"), "a b & c");
	});
});

describe("posting time is captured, not guessed", () => {
	it("flags the document so ERPNext keeps our date instead of stamping server-now", () => {
		const doc = buildStockEntryDoc(baseMove(), {
			company: "Demo Co",
			postingDate: "2026-11-02",
			postingTime: "09:15:00",
		});
		assert.equal(doc.set_posting_time, 1);
		assert.equal(doc.posting_date, "2026-11-02");
		assert.equal(doc.posting_time, "09:15:00");
	});

	it("does the same for a count", () => {
		const doc = buildReconciliationDoc(
			{ id: "op-count", itemCode: "FG-1001", qty: 3, uom: "Kg", warehouse: "Stores - DC" },
			{ company: "Demo Co", postingDate: "2026-11-02", postingTime: "09:15:00" }
		);
		assert.equal(doc.set_posting_time, 1);
		assert.equal(doc.posting_time, "09:15:00");
	});
});

describe("receiving against a purchase order", () => {
	const header = {
		order: "PO-0001",
		supplier: "Kedai Kopi Supplies",
		company: "Demo Co",
		postingDate: "2026-11-02",
		postingTime: "09:15:00",
	};
	const lines = () => [
		{
			name: "row-1",
			item_code: "FG-1001",
			item_name: "Arabica Beans 1kg",
			qty: 40,
			received_qty: 5,
			uom: "Box",
			stock_uom: "Kg",
			conversion_factor: 12,
			warehouse: "Stores - DC",
			rate: 32,
		},
		{
			name: "row-2",
			item_code: "ACC-3001",
			item_name: "Paper Cup 12oz",
			qty: 10,
			received_qty: 0,
			uom: "Nos",
			stock_uom: "Nos",
			warehouse: "Stores - DC",
		},
	];

	it("opens with every line at zero and the remaining quantity worked out", () => {
		const task = createReceiptTask("task-1", header, lines());
		assert.equal(task.lines.length, 2);
		assert.equal(task.lines[0].receivedNow, 0);
		assert.equal(task.lines[0].conversionFactor, 12);
		assert.equal(task.lines[1].conversionFactor, 1, "missing factor falls back to 1");
		assert.equal(remainingToReceive(task.lines[0]), 35, "40 ordered minus 5 already in");
		assert.equal(task.blind, false);
	});

	it("counts by scanning: the same code twice is two units", () => {
		let task = createReceiptTask("task-1", header, lines());
		task = applyScan(task, "ACC-3001").task;
		const second = applyScan(task, " acc-3001 ");
		assert.equal(second.outcome, "matched");
		assert.equal(second.task.lines[1].receivedNow, 2);
		assert.equal(second.line.itemCode, "ACC-3001");
	});

	it("says why a scan was ignored instead of silently dropping it", () => {
		const task = createReceiptTask("task-1", header, lines());
		assert.equal(applyScan(task, "RM-9999").outcome, "unknown-item");
		assert.equal(applyScan(task, "RM-9999").task, task, "a rejected scan never changes the task");

		let full = task;
		for (let i = 0; i < 10; i += 1) full = applyScan(full, "ACC-3001").task;
		assert.equal(full.lines[1].receivedNow, 10);
		assert.equal(applyScan(full, "ACC-3001").outcome, "line-complete", "no over-receipt by scanning");
	});

	it("keeps the purchase order link and converts to stock units", () => {
		let task = createReceiptTask("task-1", header, lines());
		task = applyScan(task, "FG-1001").task;
		task = applyScan(task, "FG-1001").task;
		const doc = buildPurchaseReceiptDoc(task);

		assert.equal(doc.doctype, "Purchase Receipt");
		assert.equal(doc.purchase_order, undefined, "the order link lives on the rows");
		assert.equal(doc.set_posting_time, 1);
		assert.equal(doc.posting_date, "2026-11-02");
		assert.equal(doc.posting_time, "09:15:00");
		assert.match(doc.remarks, /\[MOBILE-INV:task-1\]/);

		assert.equal(doc.items.length, 1, "only the touched line is posted");
		const row = doc.items[0];
		assert.equal(row.item_code, "FG-1001");
		assert.equal(row.qty, 2);
		assert.equal(row.uom, "Box");
		assert.equal(row.conversion_factor, 12);
		assert.equal(row.stock_qty, 24, "2 Box of 12 is 24 Kg of stock");
		assert.equal(row.purchase_order, "PO-0001");
		assert.equal(row.purchase_order_item, "row-1");
		assert.equal(row.warehouse, "Stores - DC");
	});

	it("refuses the mistakes the server would refuse hours later", () => {
		let task = createReceiptTask("task-1", header, lines());
		assert.deepEqual(validateReceipt(task), ["Nothing received yet — scan or enter at least one line"]);

		task = setLineQty(task, "row-1", 36);
		assert.match(validateReceipt(task)[0], /only 35 Box left/);

		task = setLineQty(task, "row-1", 2);
		assert.deepEqual(validateReceipt(task), [], "a clean line passes");

		task = {
			...task,
			lines: task.lines.map((l) => (l.key === "row-1" ? { ...l, hasBatchNo: true } : l)),
		};
		assert.match(validateReceipt(task)[0], /enter the batch number/);

		task = {
			...task,
			lines: task.lines.map((l) =>
				l.key === "row-1" ? { ...l, batchNo: "LOT-1", hasSerialNo: true, serialNo: "SN-1" } : l
			),
		};
		assert.match(validateReceipt(task)[0], /1 serial numbers for 2 units/);
	});

	it("sends rejects to their own warehouse instead of into stock", () => {
		let task = createReceiptTask("task-1", header, lines());
		task = applyScan(task, "ACC-3001").task;
		task = applyScan(task, "ACC-3001").task;
		task = applyScan(task, "ACC-3001").task;

		assert.equal(buildPurchaseReceiptDoc(task).items[0].rejected_qty, undefined, "no rejection, no field");

		const rejected = setLineRejected(task, "row-2", 2);
		assert.equal(rejected.lines[1].rejectedNow, 2);
		assert.match(validateReceipt(rejected).join(" "), /choose where the rejected quantity goes/);

		const placed = {
			...rejected,
			lines: rejected.lines.map((l) => (l.key === "row-2" ? { ...l, rejectedWarehouse: "Quarantine - DC" } : l)),
		};
		assert.deepEqual(validateReceipt(placed), []);
		const doc = buildPurchaseReceiptDoc(placed);
		assert.equal(doc.items[0].qty, 3);
		assert.equal(doc.items[0].rejected_qty, 2);
		assert.equal(doc.items[0].rejected_warehouse, "Quarantine - DC");
	});

	it("never lets a rejection exceed what arrived", () => {
		let task = createReceiptTask("task-1", header, lines());
		task = applyScan(task, "ACC-3001").task;
		assert.equal(setLineRejected(task, "row-2", 5).lines[1].rejectedNow, 1, "clamped to what arrived");
	});

	it("blind mode only hides the expectation, it never changes what is posted", () => {
		let task = createReceiptTask("task-1", header, lines());
		task = applyScan(task, "ACC-3001").task;
		const before = buildPurchaseReceiptDoc(task);
		const blind = toggleBlind(task);
		assert.equal(blind.blind, true);
		assert.deepEqual(buildPurchaseReceiptDoc(blind), before);
	});

	it("reports progress the way the header shows it", () => {
		let task = createReceiptTask("task-1", header, lines());
		task = applyScan(task, "ACC-3001").task;
		task = applyScan(task, "ACC-3001").task;
		const progress = receiptProgress(task);
		assert.equal(progress.linesTouched, 1);
		assert.equal(progress.linesTotal, 2);
		assert.equal(progress.units, 2);
		assert.equal(clearReceipt(task).lines[1].receivedNow, 0);
	});

	it("queues as one operation with a readable summary", () => {
		let task = createReceiptTask("task-1", header, lines());
		task = applyScan(task, "ACC-3001").task;
		const op = receiptQueueOp(task, "2026-11-02T01:15:00.000Z");
		assert.equal(op.kind, "po-receipt");
		assert.equal(op.status, "pending");
		assert.equal(op.doc.doctype, "Purchase Receipt");
		assert.match(describeOp(op), /Receipt · PO PO-0001 · 1 line/);
	});
});
