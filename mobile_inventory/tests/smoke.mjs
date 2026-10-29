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

function type(input, value) {
	if (!input) throw new Error(`Input not found while typing ${value}`);
	const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
	setter.call(input, value);
	input.dispatchEvent(new window.Event("input", { bubbles: true }));
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
	check("demo mode reaches the home screen", text().includes("Scan a barcode"));
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
	check("returns home after posting", text().includes("Scan a barcode"));

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
