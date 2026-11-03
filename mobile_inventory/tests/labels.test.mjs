// Unit tests for the label sheet: how many labels a job produces and what they say.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_LABELS, labelCount, labelsForTask } from "../src/lib/labels.ts";
import { createFlowTask, setFlowQty } from "../src/lib/taskflow.ts";

const header = {
	title: "Receiving - DEMO → Stores - DEMO",
	reference: "Receiving - DEMO",
	company: "Demo Co",
	postingDate: "2026-11-03",
	postingTime: "09:00:00",
	fromWarehouse: "Receiving - DEMO",
	toWarehouse: "Stores - DEMO",
	location: "A1-03",
};

const line = (overrides = {}) => ({
	key: "FG-1001",
	itemCode: "FG-1001",
	itemName: "Arabica Beans 1kg",
	uom: "Kg",
	conversionFactor: 1,
	qty: 0,
	fromWarehouse: "Receiving - DEMO",
	toWarehouse: "Stores - DEMO",
	...overrides,
});

describe("how many labels", () => {
	it("one per whole unit, one for a weighed line", () => {
		assert.equal(labelCount(0), 0);
		assert.equal(labelCount(3), 3);
		assert.equal(labelCount(0.5), 1, "half a carton gets one label stating the weight");
		assert.equal(labelCount(-2), 0);
	});
});

describe("the label sheet", () => {
	it("labels only what moved", () => {
		let task = createFlowTask("t1", "putaway", header, [
			line({ qty: 2, batchNo: "LOT-A" }),
			line({ key: "ACC-3001", itemCode: "ACC-3001", uom: "Nos", qty: 0 }),
		]);
		const labels = labelsForTask(task);
		assert.equal(labels.length, 2, "two units, one label each");
		assert.equal(labels[0].batchNo, "LOT-A");
		assert.equal(labels[0].warehouse, "Stores - DEMO", "the label says where it went");
		assert.equal(labels[0].location, "A1-03");
		assert.equal(labels[0].qty, 1);
		task = setFlowQty(task, "FG-1001", 1);
		assert.equal(labelsForTask(task).length, 1);
	});

	it("stops at a printable sheet instead of a printer jam", () => {
		const task = createFlowTask("t1", "putaway", header, [line({ qty: 500 })]);
		assert.equal(labelsForTask(task).length, MAX_LABELS);
		assert.equal(labelsForTask(task, 3).length, 3);
	});

	it("has nothing to label when counting", () => {
		const task = createFlowTask(
			"t2",
			"count-rack",
			{ ...header, title: "Stores - DEMO" },
			[line({ qty: 4 })]
		);
		assert.deepEqual(labelsForTask(task), [], "a count moves no stock, so there is no carton");
	});
});

describe("an issue", () => {
	it("prints no labels — the stock is leaving, not arriving", () => {
		const task = {
			...createFlowTask("l9", "issue", {
				title: "Issue from Stores",
				reference: "Stores",
				company: "Demo Co",
				postingDate: "2026-11-03",
				postingTime: "09:00:00",
				fromWarehouse: "Stores",
			}),
			lines: [
				{ key: "A", itemCode: "A", itemName: "A", uom: "Nos", conversionFactor: 1, qty: 2, fromWarehouse: "Stores" },
			],
		};
		assert.deepEqual(labelsForTask(task), []);
	});
});
