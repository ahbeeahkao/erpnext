// Unit tests for the shared task engine: scanning, refusals and the documents behind each job.
// Run with `npm test` (Node strips the TypeScript types natively).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	addFlowLine,
	applyFlowScan,
	applyCreatedBatch,
	batchText,
	buildFlowDoc,
	describeBatch,
	flowWarnings,
	isShort,
	lineLocation,
	clearFlow,
	createFlowTask,
	flowProgress,
	flowQueueOp,
	flowVariance,
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

describe("locations from an Inventory Dimension", () => {
	const withDimension = (overrides = {}) =>
		createFlowTask(
			"t6",
			"putaway",
			{
				...header,
				title: "Receiving - DEMO → Stores - DEMO",
				reference: "Receiving - DEMO",
				fromWarehouse: "Receiving - DEMO",
				toWarehouse: "Stores - DEMO",
				dimensionField: "location",
				dimensionName: "Location",
				location: "A1-03",
				...overrides,
			},
			[line({ qty: 4, fromWarehouse: "Receiving - DEMO", toWarehouse: "Stores - DEMO" })]
		);

	it("puts the shelf on every row, not just on the task", () => {
		const doc = buildFlowDoc(withDimension());
		assert.equal(doc.items[0].location, "A1-03");
		assert.equal(doc.doctype, "Stock Entry");
	});

	it("lets a line go somewhere else", () => {
		const task = withDimension();
		const moved = { ...task, lines: [{ ...task.lines[0], location: "B2-11" }] };
		assert.deepEqual(validateFlow(moved), []);
		assert.equal(buildFlowDoc(moved).items[0].location, "B2-11");
		assert.equal(lineLocation(moved, moved.lines[0]), "B2-11");
	});

	it("refuses a put away that does not say where", () => {
		const task = { ...withDimension({ location: undefined }), location: undefined };
		assert.match(validateFlow(task).join(" "), /scan or type the Location/);
	});

	it("counts a shelf, not just a warehouse", () => {
		const task = createFlowTask(
			"t7",
			"count-rack",
			{
				...header,
				title: "Stores - DEMO",
				reference: "Stores - DEMO",
				dimensionField: "location",
				dimensionName: "Location",
				location: "A1-03",
			},
			[line({ qty: 3 })]
		);
		const doc = buildFlowDoc(task);
		assert.equal(doc.doctype, "Stock Reconciliation");
		assert.equal(doc.items[0].location, "A1-03");
	});

	it("changes nothing on a site with no dimension configured", () => {
		const task = createFlowTask(
			"t8",
			"putaway",
			{ ...header, reference: "A", fromWarehouse: "A", toWarehouse: "B" },
			[line({ qty: 1, fromWarehouse: "A", toWarehouse: "B" })]
		);
		const doc = buildFlowDoc(task);
		assert.equal("location" in doc.items[0], false);
		assert.deepEqual(validateFlow(task), [], "no dimension, no location to demand");
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

	it("allows a short pick once it is explained", () => {
		const task = createFlowTask(
			"t3",
			"pick-wo",
			{ ...header, reference: "WO-0001", fromWarehouse: "Stores - DEMO", toWarehouse: "WIP - DEMO" },
			pickLinesFromWorkOrder(order, [
				{ name: "r1", item_code: "RM-2001", required_qty: 6, transferred_qty: 0, stock_uom: "Bag" },
			])
		);
		const short = setFlowQty(task, "r1", 4);
		assert.match(validateFlow(short).join(" "), /say why it is short/);
		const explained = { ...short, lines: [{ ...short.lines[0], shortReason: "Damaged" }] };
		assert.deepEqual(validateFlow(explained), []);
		assert.equal(buildFlowDoc(explained).items[0].qty, 4);
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
		const short = setFlowQty(task, "so1", 3);
		const explained = { ...short, lines: [{ ...short.lines[0], shortReason: "Damaged" }] };
		assert.deepEqual(validateFlow(explained), []);
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

describe("batches a picker should take", () => {
	it("reads a batch the way the chip shows it", () => {
		assert.equal(
			describeBatch({ batch_no: "LOT-A", qty: 12, expiry_date: "2027-01-31" }, "Kg"),
			"LOT-A · 12 Kg · exp 2027-01-31"
		);
		assert.equal(
			describeBatch({ batch_no: "MP-1", qty: 3.5, expiry_date: null }, "Bag"),
			"MP-1 · 3.5 Bag · no expiry"
		);
	});
});

describe("short picks", () => {
	const pick = (qty, overrides = {}) =>
		createFlowTask(
			"t9",
			"pick-wo",
			{
				...header,
				reference: "WO-0001",
				fromWarehouse: "Stores - DEMO",
				toWarehouse: "WIP - DEMO",
			},
			[
				line({
					key: "r1",
					itemCode: "RM-2001",
					uom: "Bag",
					qty,
					requiredQty: 3,
					fromWarehouse: "Stores - DEMO",
					toWarehouse: "WIP - DEMO",
					...overrides,
				}),
			]
		);

	it("knows a short line from a complete one", () => {
		assert.equal(isShort(pick(1), pick(1).lines[0]), true);
		assert.equal(isShort(pick(3), pick(3).lines[0]), false);
		assert.equal(isShort(pick(0), pick(0).lines[0]), false, "nothing picked is not a short pick");
	});

	it("refuses a short pick with no reason, and accepts one with a reason", () => {
		assert.match(validateFlow(pick(1)).join(" "), /say why it is short/);
		const explained = pick(1);
		explained.lines[0] = { ...explained.lines[0], shortReason: "Damaged" };
		assert.deepEqual(validateFlow(explained), []);
	});

	it("writes the reason onto the document, where dispatch will read it", () => {
		const task = pick(1);
		task.lines[0] = { ...task.lines[0], shortReason: "Not on the shelf" };
		const doc = buildFlowDoc(task);
		assert.match(doc.remarks, /Short pick: RM-2001 1\/3 \(Not on the shelf\)/);
		assert.match(doc.remarks, /\[MOBILE-INV:t9\]/, "the idempotency marker is still there");

		const complete = buildFlowDoc(pick(3));
		assert.doesNotMatch(complete.remarks, /Short pick/);
	});
});

describe("creating a batch on the spot", () => {
	it("posts the document name and shows the lot number", () => {
		const line = { batchNo: "LOT-9", batchLabel: undefined };
		const applied = applyCreatedBatch(line, { name: "a1b2c3", batch_id: "LOT-9" });
		assert.equal(applied.batchNo, "a1b2c3", "batch_no is a link on a real site");
		assert.equal(batchText(applied), "LOT-9", "the operator still reads the lot number");
	});

	it("falls back to the name when the site returns no batch id", () => {
		const applied = applyCreatedBatch({}, { name: "a1b2c3", batch_id: "" });
		assert.equal(batchText(applied), "a1b2c3");
	});
});

describe("warnings that are not refusals", () => {
	it("says when a pick exceeds what is on hand", () => {
		const task = createFlowTask(
			"t10",
			"pick-dn",
			{ ...header, reference: "SO-0001", customer: "Kedai Kopi" },
			[pickLinesFromSalesOrder([{ name: "so1", item_code: "FG-1002", qty: 24, delivered_qty: 0, uom: "Nos", warehouse: "Stores - DEMO" }])[0]]
		);
		const picked = { ...task, lines: [{ ...task.lines[0], qty: 30, systemQty: 24 }] };
		assert.match(flowWarnings(picked)[0], /picking 30 Nos but only 24 on hand/);
		assert.ok(
			validateFlow(picked).every((message) => !/on hand/.test(message)),
			"the shelf warns, the document refuses — a short shelf is not a validation error"
		);
	});

	it("says nothing when the shelf has enough, or when it does not know", () => {
		const base = createFlowTask(
			"t10",
			"pick-wo",
			{ ...header, reference: "WO-1", fromWarehouse: "Stores - DEMO", toWarehouse: "WIP" },
			[line({ qty: 2, requiredQty: 5, fromWarehouse: "Stores - DEMO", toWarehouse: "WIP" })]
		);
		assert.deepEqual(flowWarnings({ ...base, lines: [{ ...base.lines[0], systemQty: 9 }] }), []);
		assert.deepEqual(flowWarnings(base), [], "no on-hand figure, no warning");
	});

	it("never warns on a count, where finding more is the answer", () => {
		const task = createFlowTask("t11", "count-rack", header, [line({ qty: 9, systemQty: 2 })]);
		assert.deepEqual(flowWarnings(task), []);
	});
});

describe("the variance a count produces", () => {
	it("adds up what was found against what the system believed", () => {
		const task = createFlowTask("t12", "count-rack", header, [
			line({ key: "A", itemCode: "A", qty: 5, systemQty: 5 }),
			line({ key: "B", itemCode: "B", qty: 8, systemQty: 10 }),
			line({ key: "C", itemCode: "C", qty: 1, systemQty: 0 }),
		]);
		const variance = flowVariance(task);
		assert.equal(variance.lines, 3);
		assert.equal(variance.net, -1, "-2 found on one shelf, +1 on another");
		assert.equal(variance.larger, 1);
		assert.equal(variance.smaller, 1);
	});

	it("ignores lines the system never had a figure for", () => {
		const task = createFlowTask("t12", "count-rack", header, [line({ qty: 4 })]);
		assert.deepEqual(flowVariance(task), { lines: 0, net: 0, larger: 0, smaller: 0 });
	});
});
