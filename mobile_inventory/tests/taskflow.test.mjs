// Unit tests for the shared task engine: scanning, refusals and the documents behind each job.
// Run with `npm test` (Node strips the TypeScript types natively).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	addFlowLine,
	applyFlowScan,
	buildFlowDoc,
	clearFlow,
	createFlowTask,
	flowProgress,
	flowQueueOp,
	pickLinesFromSalesOrder,
	pickLinesFromWorkOrder,
	removeFlowLine,
	setFlowQty,
	toggleFlowBlind,
	validateFlow,
} from "../src/lib/taskflow.ts";

const header = {
	title: "Stores - DEMO",
	subtitle: "Count a rack",
	reference: "Stores - DEMO",
	company: "Demo Co",
	postingDate: "2026-11-03",
	postingTime: "08:45:00",
	toWarehouse: "Stores - DEMO",
};

const line = (overrides = {}) => ({
	key: "FG-1001",
	itemCode: "FG-1001",
	itemName: "Arabica Beans 1kg",
	uom: "Kg",
	conversionFactor: 1,
	qty: 0,
	toWarehouse: "Stores - DEMO",
	...overrides,
});

describe("counting a rack", () => {
	it("starts empty, blind, and grows as items are scanned", () => {
		let task = createFlowTask("t1", "count-rack", header);
		assert.equal(task.blind, true, "a count you can see the answer to is not a count");
		assert.equal(task.lines.length, 0);

		assert.equal(applyFlowScan(task, "FG-1001").outcome, "new-item");
		task = addFlowLine(task, line({ qty: 1, systemQty: 42 }));
		assert.equal(task.lines[0].qty, 1);

		task = applyFlowScan(task, "FG-1001").task;
		assert.equal(task.lines[0].qty, 2, "the second scan is the second unit");
	});

	it("has no ceiling: a count may beat the system", () => {
		let task = createFlowTask("t1", "count-rack", header);
		task = addFlowLine(task, line({ qty: 42, systemQty: 42 }));
		const after = applyFlowScan(task, "FG-1001");
		assert.equal(after.outcome, "matched");
		assert.equal(after.task.lines[0].qty, 43, "finding more than the system knows is the point");
	});

	it("posts one reconciliation for the whole rack, zero counts included", () => {
		let task = createFlowTask("t1", "count-rack", header);
		task = addFlowLine(task, line({ qty: 40, systemQty: 42, valuationRate: 12.5 }));
		task = addFlowLine(task, line({ key: "ACC-3001", itemCode: "ACC-3001", uom: "Nos", qty: 0, systemQty: 3 }));

		const doc = buildFlowDoc(task);
		assert.equal(doc.doctype, "Stock Reconciliation");
		assert.equal(doc.set_posting_time, 1);
		assert.equal(doc.posting_time, "08:45:00");
		assert.match(doc.remarks, /\[MOBILE-INV:t1\]/);
		assert.equal(doc.items.length, 2, "a zero count is a real answer");
		assert.equal(doc.items[0].qty, 40);
		assert.equal(doc.items[0].valuation_rate, 12.5);
		assert.equal(doc.items[1].qty, 0);
		assert.equal(doc.items[1].warehouse, "Stores - DEMO");
	});

	it("can post a shelf that turned out to be empty", () => {
		let task = createFlowTask("t1", "count-rack", header);
		task = addFlowLine(task, line({ qty: 0, systemQty: 5 }));
		const progress = flowProgress(task);
		assert.equal(progress.linesTouched, 1, "a scanned line is a captured line, even at zero");
		assert.equal(progress.units, 0);
		assert.deepEqual(validateFlow(task), [], "counting zero against a system five is the answer");
		assert.equal(buildFlowDoc(task).items[0].qty, 0);
	});

	it("still refuses a batch item without a batch number", () => {
		let task = createFlowTask("t1", "count-rack", header);
		task = addFlowLine(task, line({ qty: 4, hasBatchNo: true }));
		assert.match(validateFlow(task)[0], /enter the batch number/);
		task = { ...task, lines: [{ ...task.lines[0], batchNo: "LOT-9" }] };
		assert.deepEqual(validateFlow(task), []);
	});

	it("hiding the system quantity never changes the payload", () => {
		let task = createFlowTask("t1", "count-rack", header);
		task = addFlowLine(task, line({ qty: 7, systemQty: 5 }));
		const before = buildFlowDoc(task);
		assert.deepEqual(buildFlowDoc(toggleFlowBlind(task)), before);
	});

	it("removing a line removes it from the document too", () => {
		let task = createFlowTask("t1", "count-rack", header);
		task = addFlowLine(task, line({ qty: 2 }));
		task = addFlowLine(task, line({ key: "ACC-3001", itemCode: "ACC-3001", qty: 1 }));
		task = removeFlowLine(task, "ACC-3001");
		assert.equal(buildFlowDoc(task).items.length, 1);
	});
});

describe("putting a delivery away", () => {
	const putaway = () =>
		createFlowTask("t2", "putaway", {
			...header,
			title: "Receiving - DEMO → Stores - DEMO",
			reference: "Receiving - DEMO",
			fromWarehouse: "Receiving - DEMO",
			toWarehouse: "Stores - DEMO",
		}, [line({ qty: 3, fromWarehouse: "Receiving - DEMO", toWarehouse: "Stores - DEMO" })]);

	it("posts one Material Transfer with both warehouses on the row", () => {
		const doc = buildFlowDoc(putaway());
		assert.equal(doc.doctype, "Stock Entry");
		assert.equal(doc.stock_entry_type, "Material Transfer");
		assert.equal(doc.work_order, undefined);
		assert.equal(doc.items[0].s_warehouse, "Receiving - DEMO");
		assert.equal(doc.items[0].t_warehouse, "Stores - DEMO");
		assert.equal(doc.items[0].qty, 3);
	});

	it("refuses a move that goes nowhere", () => {
		const task = putaway();
		assert.match(validateFlow({ ...task, toWarehouse: "Receiving - DEMO" }).join(" "), /same warehouse/);
		assert.match(
			validateFlow({ ...task, fromWarehouse: undefined, lines: [line({ qty: 1 })] }).join(" "),
			/no warehouse to pick from/
		);
	});

	it("counts scans and can be cleared back to zero", () => {
		let task = putaway();
		task = setFlowQty(task, "FG-1001", 0);
		task = applyFlowScan(task, "FG-1001").task;
		assert.equal(task.lines[0].qty, 1);
		assert.equal(flowProgress(task).units, 1);
		assert.equal(clearFlow(task).lines[0].qty, 0);
	});
});

describe("picking for a work order", () => {
	const order = {
		name: "WO-0001",
		production_item: "FG-1002",
		company: "Demo Co",
		source_warehouse: "Stores - DEMO",
		wip_warehouse: "WIP - DEMO",
	};

	it("turns the material lines into pick quantities, dropping what is already issued", () => {
		const lines = pickLinesFromWorkOrder(order, [
			{ name: "r1", item_code: "RM-2001", required_qty: 4, transferred_qty: 1, stock_uom: "Bag" },
			{ name: "r2", item_code: "RM-2002", required_qty: 6, transferred_qty: 6, stock_uom: "Can" },
		]);
		assert.equal(lines.length, 1, "a fully issued line is not a job any more");
		assert.equal(lines[0].requiredQty, 3);
		assert.equal(lines[0].fromWarehouse, "Stores - DEMO");
		assert.equal(lines[0].toWarehouse, "WIP - DEMO");
	});

	it("stops scanning at what the work order needs, and refuses an over-pick", () => {
		let task = createFlowTask(
			"t3",
			"pick-wo",
			{ ...header, reference: "WO-0001", fromWarehouse: "Stores - DEMO", toWarehouse: "WIP - DEMO" },
			pickLinesFromWorkOrder(order, [
				{ name: "r1", item_code: "RM-2001", required_qty: 2, transferred_qty: 0, stock_uom: "Bag" },
			])
		);
		task = applyFlowScan(task, "RM-2001").task;
		task = applyFlowScan(task, "RM-2001").task;
		assert.equal(task.lines[0].qty, 2);
		assert.equal(applyFlowScan(task, "RM-2001").outcome, "line-complete");

		const over = setFlowQty(task, "r1", 5);
		assert.match(validateFlow(over)[0], /only 2 Bag still open/);
	});

	it("allows a short pick: what you could not find is still information", () => {
		const task = createFlowTask(
			"t3",
			"pick-wo",
			{ ...header, reference: "WO-0001", fromWarehouse: "Stores - DEMO", toWarehouse: "WIP - DEMO" },
			pickLinesFromWorkOrder(order, [
				{ name: "r1", item_code: "RM-2001", required_qty: 6, transferred_qty: 0, stock_uom: "Bag" },
			])
		);
		const short = setFlowQty(task, "r1", 4);
		assert.deepEqual(validateFlow(short), []);
		assert.equal(buildFlowDoc(short).items[0].qty, 4);
	});

	it("posts a Material Transfer for Manufacture linked to the work order", () => {
		const task = createFlowTask(
			"t3",
			"pick-wo",
			{ ...header, reference: "WO-0001", fromWarehouse: "Stores - DEMO", toWarehouse: "WIP - DEMO" },
			pickLinesFromWorkOrder(order, [
				{ name: "r1", item_code: "RM-2001", required_qty: 6, transferred_qty: 0, stock_uom: "Bag" },
			])
		);
		const doc = buildFlowDoc(setFlowQty(task, "r1", 2));
		assert.equal(doc.stock_entry_type, "Material Transfer for Manufacture");
		assert.equal(doc.work_order, "WO-0001");
		assert.equal(doc.items[0].t_warehouse, "WIP - DEMO");
	});
});

describe("picking for a delivery", () => {
	const rows = [
		{ name: "so1", item_code: "FG-1002", qty: 24, delivered_qty: 0, uom: "Nos", warehouse: "Stores - DEMO" },
		{ name: "so2", item_code: "ACC-3001", qty: 100, delivered_qty: 100, uom: "Nos", warehouse: "Stores - DEMO" },
	];

	it("keeps only what is still to go out", () => {
		const lines = pickLinesFromSalesOrder(rows);
		assert.equal(lines.length, 1);
		assert.equal(lines[0].requiredQty, 24);
		assert.equal(lines[0].sourceRow, "so1");
	});

	it("creates a draft delivery note against the sales order", () => {
		const task = createFlowTask(
			"t4",
			"pick-dn",
			{ ...header, reference: "SO-0001", customer: "Kedai Kopi", subtitle: "Kedai Kopi" },
			pickLinesFromSalesOrder(rows)
		);
		const doc = buildFlowDoc(setFlowQty(task, "so1", 12));
		assert.equal(doc.doctype, "Delivery Note");
		assert.equal(doc.customer, "Kedai Kopi");
		assert.equal(doc.items[0].against_sales_order, "SO-0001");
		assert.equal(doc.items[0].so_detail, "so1");
		assert.equal(doc.items[0].warehouse, "Stores - DEMO");
		assert.equal(doc.items[0].qty, 12);
		assert.equal(doc.items[0].s_warehouse, undefined, "a delivery note has no source warehouse");
	});

	it("passes validation without a target warehouse", () => {
		const task = createFlowTask(
			"t4",
			"pick-dn",
			{ ...header, reference: "SO-0001", customer: "Kedai Kopi" },
			pickLinesFromSalesOrder(rows)
		);
		assert.deepEqual(validateFlow(setFlowQty(task, "so1", 3)), []);
	});

	it("queues as a draft: dispatch submits, not the picker", () => {
		const task = createFlowTask(
			"t4",
			"pick-dn",
			{ ...header, reference: "SO-0001", customer: "Kedai Kopi" },
			pickLinesFromSalesOrder(rows)
		);
		const picked = setFlowQty(task, "so1", 24);
		const op = flowQueueOp(picked, "2026-11-03T01:00:00.000Z");
		assert.equal(op.submit, false);
		assert.equal(op.kind, "pick-dn");
		assert.match(op.summary.label, /Pick for delivery · SO-0001 · 1 line/);

		const wo = createFlowTask("t5", "putaway", { ...header, fromWarehouse: "A", toWarehouse: "B" }, [line({ qty: 1 })]);
		assert.equal(flowQueueOp(wo).submit, true, "everything else posts immediately");
	});
});
