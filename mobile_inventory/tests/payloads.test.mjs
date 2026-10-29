// Unit tests for the pure logic: document payloads, validation, scan parsing, queue maths.
// Run with `npm test` (Node strips the TypeScript types natively).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildReconciliationDoc,
	buildStockEntryDoc,
	mobileRef,
	parseScanResponse,
	parseSerials,
	remarksFor,
	validateCount,
	validateMove,
	validateQty,
} from "../src/lib/payloads.ts";
import { pruneQueue, retryDelayMs, sortQueue } from "../src/lib/queue.ts";
import { serverMessage, stripHtml, toApiError } from "../src/lib/errors.ts";

const ctx = { company: "Demo Co", postingDate: "2026-10-30" };

const baseMove = (overrides = {}) => ({
	id: "op-1",
	kind: "receipt",
	itemCode: "FG-1001",
	qty: 5,
	uom: "Kg",
	toWarehouse: "Stores - DC",
	rate: 12.5,
	...overrides,
});

describe("stock entry payloads", () => {
	it("builds a Material Receipt with cost and device marker", () => {
		const doc = buildStockEntryDoc(baseMove(), ctx);
		assert.equal(doc.doctype, "Stock Entry");
		assert.equal(doc.stock_entry_type, "Material Receipt");
		assert.equal(doc.company, "Demo Co");
		assert.equal(doc.posting_date, "2026-10-30");
		assert.ok(String(doc.remarks).includes(mobileRef("op-1")));
		const row = doc.items[0];
		assert.deepEqual(
			{ item_code: row.item_code, qty: row.qty, uom: row.uom, t_warehouse: row.t_warehouse },
			{ item_code: "FG-1001", qty: 5, uom: "Kg", t_warehouse: "Stores - DC" }
		);
		assert.equal(row.basic_rate, 12.5);
		assert.equal(row.s_warehouse, undefined);
	});

	it("marks zero-value receipts instead of sending a rate", () => {
		const doc = buildStockEntryDoc(baseMove({ rate: null, zeroValuation: true }), ctx);
		assert.equal(doc.items[0].allow_zero_valuation_rate, 1);
		assert.equal(doc.items[0].basic_rate, undefined);
	});

	it("builds a Material Issue from the source warehouse", () => {
		const doc = buildStockEntryDoc(
			baseMove({ kind: "issue", toWarehouse: undefined, fromWarehouse: "Stores - DC" }),
			ctx
		);
		assert.equal(doc.stock_entry_type, "Material Issue");
		assert.equal(doc.items[0].s_warehouse, "Stores - DC");
		assert.equal(doc.items[0].t_warehouse, undefined);
		assert.equal(doc.items[0].basic_rate, undefined);
	});

	it("builds a Material Transfer with both warehouses on the doc and the row", () => {
		const doc = buildStockEntryDoc(
			baseMove({ kind: "transfer", fromWarehouse: "A", toWarehouse: "B", rate: null }),
			ctx
		);
		assert.equal(doc.stock_entry_type, "Material Transfer");
		assert.equal(doc.from_warehouse, "A");
		assert.equal(doc.to_warehouse, "B");
		assert.equal(doc.items[0].s_warehouse, "A");
		assert.equal(doc.items[0].t_warehouse, "B");
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
		const remarks = remarksFor("op-2", "Material Issue", "  damaged  ");
		assert.ok(remarks.startsWith("Mobile Inventory · Material Issue"));
		assert.ok(remarks.endsWith("· damaged"));
		assert.ok(remarks.includes("[MOBILE-INV:op-2]"));
	});
});

describe("move validation", () => {
	it("accepts a complete receipt", () => {
		assert.deepEqual(validateMove(baseMove()), []);
	});

	it("rejects zero, negative and non-numeric quantities", () => {
		assert.ok(validateMove(baseMove({ qty: 0 })).some((error) => error.includes("greater than zero")));
		assert.ok(validateMove(baseMove({ qty: -2 })).length > 0);
		assert.ok(validateMove(baseMove({ qty: Number.NaN })).length > 0);
		assert.equal(validateQty(3), null);
	});

	it("requires a rate unless the receipt is explicitly zero value", () => {
		const errors = validateMove(baseMove({ rate: null }));
		assert.ok(errors.some((error) => error.includes("unit cost")));
		assert.deepEqual(validateMove(baseMove({ rate: null, zeroValuation: true })), []);
	});

	it("requires distinct warehouses for a transfer", () => {
		const errors = validateMove(
			baseMove({ kind: "transfer", fromWarehouse: "A", toWarehouse: "A", rate: null })
		);
		assert.ok(errors.some((error) => error.includes("must differ")));
	});

	it("requires batch for batch items and a matching serial count", () => {
		const batchErrors = validateMove(baseMove(), { has_batch_no: 1 });
		assert.ok(batchErrors.some((error) => error.includes("batch")));

		const serialErrors = validateMove(baseMove({ serialNo: "SN1", qty: 2 }), { has_serial_no: 1 });
		assert.ok(serialErrors.some((error) => error.includes("Serial count")));

		assert.deepEqual(validateMove(baseMove({ serialNo: "SN1 SN2", qty: 2 }), { has_serial_no: 1 }), []);
	});

	it("parses serial lists separated by spaces, commas or newlines", () => {
		assert.deepEqual(parseSerials("A B\nC,D;E"), ["A", "B", "C", "D", "E"]);
		assert.deepEqual(parseSerials("   "), []);
		assert.deepEqual(parseSerials(undefined), []);
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
