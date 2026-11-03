import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	DEFAULT_LABEL_SIZE,
	LABEL_SIZES,
	labelFootLine,
	labelZpl,
	labelsZpl,
	mmToDots,
	zplFileName,
	zplText,
} from "../src/lib/zpl.ts";
import { bridgeRequest, bridgeFailure, normalizeBridge } from "../src/lib/printbridge.ts";

const label = {
	itemCode: "FG-1002",
	itemName: "Cold Brew Bottle 250ml",
	qty: 6,
	uom: "Nos",
	batchNo: "LOT-2603-B",
	warehouse: "Stores - K",
	location: "A1-03",
};

describe("ZPL labels", () => {
	it("sizes the label in dots for the stock in the printer", () => {
		assert.equal(mmToDots(50), 400);
		assert.equal(mmToDots(100), 799);
		const small = labelZpl(label, "50x25");
		assert.ok(small.includes("^PW400"));
		assert.ok(small.includes("^LL200"));
		const big = labelZpl(label, "100x50");
		assert.ok(big.includes("^PW799"));
		assert.ok(big.includes("^LL400"));
	});

	it("wraps the label in a job and carries the code in a barcode", () => {
		const zpl = labelZpl(label);
		assert.ok(zpl.startsWith("^XA"));
		assert.ok(zpl.trimEnd().endsWith("^XZ"));
		assert.ok(zpl.includes("^BCN"));
		assert.ok(zpl.includes("^FDFG-1002^FS"));
		assert.ok(zpl.includes("6 Nos"));
	});

	it("strips the characters that would break the job", () => {
		const zpl = labelZpl({ ...label, itemName: "Bolt ^FS 3~4 \" big" });
		assert.ok(!zpl.includes("^FS 3"));
		assert.ok(zpl.includes("Bolt FS 3 4"));
		assert.equal(zplText("a^b~c\nd", 40), "a b c d");
	});

	it("puts the shelf and the lot under the barcode", () => {
		assert.equal(labelFootLine(label), "Stores - K · A1-03 · Batch LOT-2603-B");
		const zpl = labelZpl({ ...label, batchNo: undefined, location: undefined });
		assert.ok(zpl.includes("Stores - K"));
		assert.ok(!zpl.includes("Batch"));
	});

	it("sends one job for the whole sheet", () => {
		const sheet = labelsZpl([label, { ...label, itemCode: "RM-2001" }]);
		assert.equal(sheet.match(/\^XA/g)?.length, 2);
		assert.equal(sheet.match(/\^XZ/g)?.length, 2);
		assert.equal(DEFAULT_LABEL_SIZE, "50x25");
		assert.equal(Object.keys(LABEL_SIZES).length, 3);
	});

	it("names the file after the item and the count", () => {
		assert.equal(zplFileName([label, label, label]), "FG-1002-3.zpl");
		assert.equal(zplFileName([]), "labels-0.zpl");
	});
});

describe("the print bridge", () => {
	it("accepts what people type", () => {
		assert.equal(normalizeBridge(" 192.168.1.31:9101 "), "http://192.168.1.31:9101");
		assert.equal(normalizeBridge("https://print.local/api/"), "https://print.local/api");
		assert.equal(normalizeBridge(""), "");
	});

	it("posts raw ZPL, which is what a bridge expects", () => {
		const request = bridgeRequest("192.168.1.31:9101", "^XA^XZ");
		assert.equal(request.url, "http://192.168.1.31:9101");
		assert.equal(request.init.method, "POST");
		assert.equal(request.init.body, "^XA^XZ");
		assert.match(String(request.init.headers["Content-Type"]), /text\/plain/);
	});

	it("says something a person on the floor can act on", () => {
		const abort = new Error("aborted");
		abort.name = "AbortError";
		assert.match(bridgeFailure(abort), /did not answer/);
		assert.match(bridgeFailure(new Error("The print bridge refused the job (HTTP 500).")), /HTTP 500/);
		assert.match(bridgeFailure(new TypeError("Failed to fetch")), /same network/);
	});
});
