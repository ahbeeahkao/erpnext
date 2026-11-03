// Unit tests for which warehouses a user may see.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { warehousesForCompany } from "../src/lib/warehouses.ts";

const rows = [
	{ name: "Stores - A", warehouse_name: "Stores", company: "Company A" },
	{ name: "Stores - B", warehouse_name: "Stores", company: "Company B" },
	{ name: "Transit - X", warehouse_name: "Transit" },
];

describe("warehouses the user should see", () => {
	it("keeps only the active company's stores", () => {
		assert.deepEqual(
			warehousesForCompany(rows, "Company A").map((row) => row.name),
			["Stores - A", "Transit - X"]
		);
	});

	it("keeps warehouses that declare no company", () => {
		assert.ok(warehousesForCompany(rows, "Company B").some((row) => row.name === "Transit - X"));
	});

	it("shows everything when the company is unknown", () => {
		assert.equal(warehousesForCompany(rows).length, 3);
		assert.equal(warehousesForCompany(rows, "").length, 3);
	});
});
