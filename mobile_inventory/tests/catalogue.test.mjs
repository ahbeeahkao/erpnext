// Unit tests for the offline catalogue: what survives when the signal does not.
// IndexedDB is absent under Node, so the storage layer's in-memory fallback is what runs here.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
	MAX_ITEMS,
	cachedItem,
	cachedScan,
	cachedStock,
	catalogueSize,
	clearCatalogue,
	rememberItem,
	rememberItems,
	rememberScan,
	rememberStock,
	searchCachedItems,
} from "../src/lib/catalogue.ts";

const item = (code, overrides = {}) => ({
	item_code: code,
	item_name: `Item ${code}`,
	stock_uom: "Nos",
	has_batch_no: 0,
	has_serial_no: 0,
	is_stock_item: 1,
	...overrides,
});

describe("the offline catalogue", () => {
	beforeEach(async () => {
		await clearCatalogue();
	});

	it("remembers an item the device has seen", async () => {
		await rememberItem(item("FG-1001"));
		assert.equal((await cachedItem("fg-1001"))?.item_code, "FG-1001", "codes are case-insensitive");
		assert.equal(await cachedItem("NOPE"), null);
	});

	it("searches what it has, by code or name", async () => {
		await rememberItems([item("FG-1001", { item_name: "Arabica Beans 1kg" }), item("ACC-3001")]);
		assert.equal((await searchCachedItems("arabica")).length, 1);
		assert.equal((await searchCachedItems("1001")).length, 1);
		assert.equal((await searchCachedItems("a")).length, 0, "one character is not a search");
	});

	it("resolves a barcode with no server at all", async () => {
		await rememberItem(item("FG-1001", { has_batch_no: 1 }));
		await rememberScan("8901234567890", "FG-1001");
		const found = await cachedScan("8901234567890");
		assert.equal(found?.item_code, "FG-1001");
		assert.equal(found?.has_batch_no, 1, "the batch flag survives too");
		assert.equal((await cachedScan("FG-1001"))?.item_code, "FG-1001", "an item code is also a scan");
	});

	it("stays bounded, dropping the item least recently seen", async () => {
		const many = Array.from({ length: MAX_ITEMS + 2 }, (_, index) => item(`SKU-${index}`));
		await rememberItems(many);
		assert.equal(await catalogueSize(), MAX_ITEMS);
		assert.equal(await cachedItem("SKU-0"), null, "the first one fell off");
		assert.equal((await cachedItem(`SKU-${MAX_ITEMS + 1}`))?.item_code, `SKU-${MAX_ITEMS + 1}`);
	});

	it("marks cached balances as stale, so no screen can call them current", async () => {
		await rememberStock("FG-1001", [
			{ warehouse: "Stores", actual_qty: 42, stock_uom: "Nos", valuation_rate: 12 },
		]);
		const rows = await cachedStock("FG-1001");
		assert.equal(rows.length, 1);
		assert.equal(rows[0].actual_qty, 42);
		assert.equal(rows[0].stale, true);
		assert.deepEqual(await cachedStock("UNKNOWN"), []);
	});

	it("forgets everything on request", async () => {
		await rememberItem(item("FG-1001"));
		await clearCatalogue();
		assert.equal(await catalogueSize(), 0);
	});
});
