// End-to-end smoke test against the built app (dist/), running in jsdom.
//
// There is no browser in CI containers, so this mounts exactly what `npm run build` emits and
// drives the real UI: connect in demo mode, search an item, post a receipt (including the
// validation guard), then queue an issue and sync it. It catches blank-screen regressions that
// type-checking and unit tests cannot.
//
// Usage: npm run build && npm run smoke
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "dist");
const indexPath = resolve(root, "index.html");

if (!existsSync(indexPath)) {
	console.error("dist/index.html is missing — run `npm run build` before `npm run smoke`.");
	process.exit(1);
}

const entry = readFileSync(indexPath, "utf8").match(/src="\.\/(assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) {
	console.error("Could not find the entry script in dist/index.html.");
	process.exit(1);
}

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", {
	url: "https://erp.example.test/inventory/",
	pretendToBeVisual: true,
});
const { window } = dom;

for (const key of [
	"window",
	"document",
	"HTMLElement",
	"Element",
	"Node",
	"Event",
	"CustomEvent",
	"MutationObserver",
	"getComputedStyle",
	"localStorage",
	"sessionStorage",
	"matchMedia",
	"DOMException",
	"AbortController",
	"fetch",
]) {
	if (key in window) {
		try {
			globalThis[key] = window[key];
		} catch {
			// some globals are read-only on newer Node versions
		}
	}
}
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", {
	value: window.navigator,
	configurable: true,
	writable: true,
});
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.fetch = async () => {
	throw new Error("The smoke test never talks to a server");
};
// IndexedDB is absent in jsdom: the storage layer falls back to memory, which is what we want.
Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });

const errors = [];
window.addEventListener("error", (event) => errors.push(String(event.error ?? event.message)));
process.on("unhandledRejection", (reason) => errors.push(String(reason)));

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const text = () => window.document.getElementById("root")?.textContent ?? "";

function click(pattern) {
	const target = [...window.document.querySelectorAll("button")].find((button) =>
		pattern.test(button.textContent ?? "")
	);
	if (!target) throw new Error(`No button matching ${pattern}. Screen text: ${text().slice(0, 200)}`);
	target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function clickBack() {
	const target = window.document.querySelector('button[aria-label^="Back"]');
	if (!target) throw new Error(`No back button. Screen text: ${text().slice(0, 160)}`);
	target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function type(input, value) {
	if (!input) throw new Error(`Input not found while typing ${value}`);
	const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
	setter.call(input, value);
	input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function pick(select, value) {
	if (!select) throw new Error(`Select not found while choosing ${value}`);
	const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
	setter.call(select, value);
	select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function clickIcon(aria) {
	const target = window.document.querySelector(`button[aria-label="${aria}"]`);
	if (!target) throw new Error(`No button labelled ${aria}. Screen text: ${text().slice(0, 160)}`);
	target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function check(label, condition) {
	console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
	if (!condition) {
		errors.push(label);
	}
}

try {
	await import(`${root}/${entry}`);
	await wait(300);

	check("connect screen renders", text().includes("Inventory") && text().includes("Demo"));

	click(/Open the demo/i);
	await wait(800);
	check("demo mode reaches the home screen", text().includes("Scan one item"));
	check("connection status is shown", text().includes("Online"));
	check(
		"bottom tabs are present",
		["Scan", "Queue", "Settings"].every((tab) => text().includes(tab))
	);

	// --- search -> item -> receipt -------------------------------------------
	type(window.document.querySelector('input[aria-label="Search items"]'), "FG-1001");
	await wait(900);
	check("item search returns results", text().includes("Arabica Beans 1kg"));

	click(/Arabica Beans 1kg/);
	await wait(700);
	check("item sheet shows stock", text().includes("Total on hand"));
	check("warehouse balances are listed", text().includes("Stores"));

	click(/^Receive$/);
	await wait(400);
	check("receive form opens", text().includes("Receive stock"));

	type(window.document.getElementById("qty"), "3");
	type(window.document.querySelector('input[placeholder="e.g. BATCH-2026-001"]'), "BATCH-SMOKE-1");
	await wait(120);

	click(/^Receive now$/);
	await wait(300);
	check("missing unit cost is refused", /Enter a unit cost/i.test(text()));
	check("still on the form after refusal", text().includes("Receive stock"));

	type(window.document.querySelector('input[placeholder="0.00"]'), "12.5");
	await wait(120);
	click(/^Receive now$/);
	await wait(1400);
	check("receipt is posted", /posted as STE-DEMO-/.test(text()));
	check("returns home after posting", text().includes("Scan one item"));

	// --- issue -> queue -> sync ----------------------------------------------
	type(window.document.querySelector('input[aria-label="Search items"]'), "FG-1002");
	await wait(900);
	click(/Cold Brew Bottle/);
	await wait(700);
	click(/^Issue$/);
	await wait(400);
	type(window.document.getElementById("qty"), "2");
	await wait(100);
	click(/Queue for later/i);
	await wait(800);
	check("transaction is queued", /Queued on this device/.test(text()));

	click(/Queue/);
	await wait(1600);
	check("queued transaction posts on sync", /Posted/.test(text()));
	check("server document name is shown", /STE-DEMO-\d+/.test(text()));

	click(/What was posted\?/);
	await wait(400);
	check("the posted document can be inspected", text().includes("Document") && text().includes("Stock Entry"));
	check("the lines that were posted are listed", text().includes("Cold Brew Bottle") || text().includes("FG-1002"));
	click(/Hide what was posted/);
	await wait(200);

	// --- receive against a purchase order ------------------------------------
	click(/^Scan$/);
	await wait(600);
	click(/Receive a delivery/i);
	await wait(800);
	check("receiving lists the deliveries due", text().includes("PO-DEMO-0001"));
	check("the supplier names the job, not the doctype", text().includes("Kedai Kopi Supplies"));

	click(/PO-DEMO-0001/);
	await wait(900);
	check("the order opens as a counting task", text().includes("Blind receiving"));
	check("order lines are listed", text().includes("Arabica Beans 1kg"));

	const scanInput = window.document.querySelector('input[aria-label="Scan item into this receipt"]');
	type(scanInput, "FG-1001");
	await wait(120);
	scanInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await wait(400);
	check("one scan adds one unit", text().includes("Post receipt · 1 unit"));
	check("the line shows the scanned quantity", text().includes("1/2 lines"));
	clickBack();
	await wait(300);
	clickBack();
	await wait(500);

	// --- count a rack --------------------------------------------------------
	click(/Count a rack/);
	await wait(400);
	click(/Start counting/);
	await wait(500);
	const countInput = window.document.querySelector('input[aria-label="Scan item onto this task"]');
	type(countInput, "8901234567894");
	await wait(120);
	countInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await wait(1200);
	check("a scanned item becomes a count line", text().includes("1/1 lines"));
	check("the count is blind by default", text().includes("Blind count"));
	clickBack();
	await wait(300);
	clickBack();
	await wait(500);

	// --- put away ------------------------------------------------------------
	click(/Put away/);
	await wait(500);
	check("the site's location dimension is offered", text().includes("Location"));
	type(window.document.querySelector('input[aria-label="Location to put away to"]'), "A1-03");
	await wait(150);
	click(/Start putting away/);
	await wait(500);
	check(
		"the shelf is carried onto the task",
		window.document.querySelector('input[aria-label="Location for the whole task"]')?.value === "A1-03"
	);
	const putAwayInput = window.document.querySelector('input[aria-label="Scan item onto this task"]');
	type(putAwayInput, "FG-1002");
	await wait(120);
	putAwayInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await wait(1000);
	check("put away counts the carton", text().includes("1/1 lines"));
	check("the line shows the shelf it is going to", text().includes("A1-03"));
	clickBack();
	await wait(300);
	clickBack();
	await wait(500);

	// --- pick for a work order ----------------------------------------------
	click(/Pick for a work order/);
	await wait(900);
	check("work orders waiting are listed", text().includes("WO-DEMO-0001"));
	click(/WO-DEMO-0001/);
	await wait(900);
	check("the material to issue is listed", text().includes("Milk Powder 25kg"));
	const pickWoInput = window.document.querySelector('input[aria-label="Scan item onto this task"]');
	type(pickWoInput, "RM-2001");
	await wait(120);
	pickWoInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await wait(500);
	check("a pick line counts up", text().includes("1/2 lines"));
	check("the pick name is the work order", text().includes("WO-DEMO-0001"));

	// the batches actually on the shelf, oldest expiry first
	click(/Milk Powder 25kg/);
	await wait(700);
	check("available batches are offered with expiry", text().includes("MP-2411") && text().includes("exp 2027-05-30"));
	click(/MP-2411/);
	await wait(250);
	check("choosing a batch sets it on the line", text().includes("batch MP-2411"));

	// a lot that arrived without a batch document
	type(window.document.querySelector('input[placeholder="e.g. LOT-2411-A"]'), "LOT-SMOKE-1");
	await wait(200);
	click(/Create batch/);
	await wait(700);
	check("a new lot can be created from the phone", /Batch LOT-SMOKE-1 created/.test(text()));
	check("the line shows the lot number, not the document name", text().includes("batch LOT-SMOKE-1"));

	// labels for what was picked
	click(/Print labels/);
	await wait(500);
	check("a label sheet is built for the pick", /\d+ labels?/.test(text()) && text().includes("Milk Powder"));
	check(
		"labels are laid out at the shop's label size",
		window.document.querySelector(".label")?.style.width === "50mm"
	);
	check("the printer-ready file can be saved", [...window.document.querySelectorAll("button")].some((button) => /Save \.zpl/.test(button.textContent ?? "")));
	clickIcon("Close labels");
	await wait(250);

	// a short pick has to say why
	click(/Post · 1 unit/);
	await wait(500);
	check("a short pick without a reason is refused", text().includes("say why it is short"));

	const reason = [...window.document.querySelectorAll("select")].find((select) =>
		[...select.options].some((option) => option.value === "Damaged")
	);
	pick(reason, "Damaged");
	await wait(250);
	click(/Post · 1 unit/);
	await wait(1400);
	check("the pick posts once the reason is given", /posted/.test(text()));

	// --- pick for delivery -> draft -----------------------------------------
	await wait(600);
	click(/Pick for delivery/);
	await wait(900);
	check("sales orders due are listed", text().includes("Kedai Kopi Jalan Ampang"));
	click(/Kedai Kopi Jalan Ampang/);
	await wait(900);
	check("the order lines are listed", text().includes("Cold Brew Bottle"));
	const pickDnInput = window.document.querySelector('input[aria-label="Scan item onto this task"]');
	type(pickDnInput, "ACC-3001");
	await wait(120);
	pickDnInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await wait(500);
	check("a delivery pick counts up", text().includes("1/2 lines"));

	click(/Paper Cup 12oz/);
	await wait(400);
	const deliveryReason = [...window.document.querySelectorAll("select")].find((select) =>
		[...select.options].some((option) => option.value === "Not on the shelf")
	);
	pick(deliveryReason, "Not on the shelf");
	await wait(200);

	click(/Create draft/);
	await wait(900);
	check("the pick becomes a draft delivery note", /created as a draft/.test(text()));
	check("back home after the pick", text().includes("Scan one item"));

	// --- settings: is this site ready, and what label stock is loaded ---------
	click(/^Settings$/);
	await wait(600);
	check("settings offers a site check", text().includes("Is this site ready?"));
	click(/Check this site/);
	await wait(900);
	check(
		"the site check reports what the site supports",
		text().includes("Sign-in works") && text().includes("OK")
	);

	const stockSelect = [...window.document.querySelectorAll("select")].find((select) =>
		[...select.options].some((option) => option.value === "100x50")
	);
	pick(stockSelect, "100x50");
	await wait(500);
	click(/^Scan$/);
	await wait(400);
	click(/^Settings$/);
	await wait(600);
	const remembered = [...window.document.querySelectorAll("select")].find((select) =>
		[...select.options].some((option) => option.value === "100x50")
	);
	check("label stock is remembered across screens", remembered?.value === "100x50");
} catch (error) {
	console.error(`smoke test crashed: ${error instanceof Error ? error.message : error}`);
	errors.push(String(error));
}

if (errors.length) {
	console.error(`\n${errors.length} problem(s):`);
	for (const error of errors) console.error(` - ${error}`);
	process.exit(1);
}

console.log("\nAll smoke checks passed.");
