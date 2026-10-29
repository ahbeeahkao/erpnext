// Demo adapter: an in-memory stand-in for a live ERPNext site.
//
// It exists so the UI can be explored without a bench (and so this sandbox can show a working
// preview). It mirrors the real client's behaviour closely enough to be useful: documents are
// created first and submitted second, stock moves update balances, negative stock is refused,
// and the idempotency marker in `remarks` finds an already-posted document.
import { ApiError } from "./errors";
import { parseScanResponse } from "./payloads";
import type { Connection, InventoryClient, ItemInfo, ScanMatch, StockRow, Warehouse } from "./types";

interface DemoItem extends ItemInfo {
	barcode: string;
}

const WAREHOUSES: Warehouse[] = [
	{ name: "Stores - DEMO", warehouse_name: "Stores", company: "Demo Company" },
	{ name: "Cold Room - DEMO", warehouse_name: "Cold Room", company: "Demo Company" },
	{ name: "Transit - DEMO", warehouse_name: "Transit", company: "Demo Company" },
];

const ITEMS: DemoItem[] = [
	{
		item_code: "FG-1001",
		item_name: "Arabica Beans 1kg",
		stock_uom: "Kg",
		barcode: "8901234567890",
		has_batch_no: 1,
		has_serial_no: 0,
		is_stock_item: 1,
		item_group: "Products",
	},
	{
		item_code: "FG-1002",
		item_name: "Cold Brew Bottle 330ml",
		stock_uom: "Nos",
		barcode: "8901234567891",
		has_batch_no: 0,
		has_serial_no: 0,
		is_stock_item: 1,
		item_group: "Products",
	},
	{
		item_code: "RM-2001",
		item_name: "Milk Powder 25kg",
		stock_uom: "Bag",
		barcode: "8901234567892",
		has_batch_no: 1,
		has_serial_no: 0,
		is_stock_item: 1,
		item_group: "Raw Material",
	},
	{
		item_code: "RM-2002",
		item_name: "Sugar Syrup 20L",
		stock_uom: "Can",
		barcode: "8901234567893",
		has_batch_no: 0,
		has_serial_no: 0,
		is_stock_item: 1,
		item_group: "Raw Material",
	},
	{
		item_code: "ACC-3001",
		item_name: "Paper Cup 12oz",
		stock_uom: "Nos",
		barcode: "8901234567894",
		has_batch_no: 0,
		has_serial_no: 0,
		is_stock_item: 1,
		item_group: "Consumables",
	},
	{
		item_code: "EQ-4001",
		item_name: "Espresso Machine GX-1",
		stock_uom: "Nos",
		barcode: "8901234567895",
		has_batch_no: 0,
		has_serial_no: 1,
		is_stock_item: 1,
		item_group: "Equipment",
	},
];

const stock = new Map<string, number>();
const documents = new Map<string, Record<string, unknown>>();
let sequence = 1000;

function stockKey(itemCode: string, warehouse: string): string {
	return `${itemCode}::${warehouse}`;
}

function seedStock(): void {
	const seeds: Array<[string, string, number]> = [
		["FG-1001", "Stores - DEMO", 42],
		["FG-1001", "Cold Room - DEMO", 8],
		["FG-1002", "Stores - DEMO", 120],
		["FG-1002", "Transit - DEMO", 24],
		["RM-2001", "Stores - DEMO", 15],
		["RM-2002", "Stores - DEMO", 6],
		["ACC-3001", "Stores - DEMO", 480],
		["EQ-4001", "Stores - DEMO", 3],
	];
	for (const [item, warehouse, qty] of seeds) stock.set(stockKey(item, warehouse), qty);
}

seedStock();

/** Strips the demo-only barcode field before handing an item to the UI. */
function publicItem(item: DemoItem): ItemInfo {
	return {
		item_code: item.item_code,
		item_name: item.item_name,
		stock_uom: item.stock_uom,
		has_batch_no: item.has_batch_no,
		has_serial_no: item.has_serial_no,
		is_stock_item: item.is_stock_item,
		item_group: item.item_group,
	};
}

function itemFor(code: string): DemoItem {
	const item = ITEMS.find((row) => row.item_code.toLowerCase() === code.trim().toLowerCase());
	if (!item) throw new ApiError(`Item ${code} was not found`, "validation", 404);
	return item;
}

function qtyOf(itemCode: string, warehouse: string): number {
	return stock.get(stockKey(itemCode, warehouse)) ?? 0;
}

function adjust(itemCode: string, warehouse: string, delta: number, context: string): void {
	const next = Math.round((qtyOf(itemCode, warehouse) + delta) * 1000) / 1000;
	if (next < 0) {
		throw new ApiError(
			`${itemCode} only has ${qtyOf(
				itemCode,
				warehouse
			)} in ${warehouse} — ${context} would take it negative`,
			"validation",
			417
		);
	}
	stock.set(stockKey(itemCode, warehouse), next);
}

function applyDocument(doc: Record<string, unknown>): void {
	const rows = Array.isArray(doc.items) ? (doc.items as Record<string, any>[]) : [];
	if (!rows.length) throw new ApiError("The document has no items", "validation", 417);

	if (doc.doctype === "Stock Reconciliation") {
		for (const row of rows) {
			const item = itemFor(String(row.item_code));
			const warehouse = String(row.warehouse);
			stock.set(stockKey(item.item_code, warehouse), Number(row.qty) || 0);
		}
		return;
	}

	const type = String(doc.stock_entry_type ?? "");
	for (const row of rows) {
		const item = itemFor(String(row.item_code));
		const qty = Math.abs(Number(row.qty) || 0);
		if (!qty) throw new ApiError("Quantity must be greater than zero", "validation", 417);

		if (type === "Material Receipt") {
			adjust(item.item_code, String(row.t_warehouse), qty, "this receipt");
		} else if (type === "Material Issue") {
			adjust(item.item_code, String(row.s_warehouse), -qty, "this issue");
		} else if (type === "Material Transfer") {
			adjust(item.item_code, String(row.s_warehouse), -qty, "this transfer");
			adjust(item.item_code, String(row.t_warehouse), qty, "this transfer");
		} else {
			throw new ApiError(`Demo does not support stock entry type ${type}`, "validation", 417);
		}
	}
}

export class DemoClient implements InventoryClient {
	readonly mode = "demo" as const;

	private delay<T>(value: T, ms = 180): Promise<T> {
		return new Promise((resolve) => setTimeout(() => resolve(value), ms));
	}

	async connect(): Promise<Connection> {
		return this.delay({
			user: "demo@example.com",
			company: "Demo Company",
			warehouses: WAREHOUSES,
		});
	}

	async listWarehouses(): Promise<Warehouse[]> {
		return this.delay(WAREHOUSES);
	}

	async listCompanies(): Promise<string[]> {
		return this.delay(["Demo Company"]);
	}

	async itemInfo(itemCode: string): Promise<ItemInfo> {
		return this.delay(publicItem(itemFor(itemCode)));
	}

	async searchItems(query: string): Promise<ItemInfo[]> {
		const term = query.trim().toLowerCase();
		if (term.length < 2) return this.delay([]);
		const matches = ITEMS.filter(
			(item) =>
				item.item_code.toLowerCase().includes(term) ||
				(item.item_name ?? "").toLowerCase().includes(term)
		).slice(0, 25);
		return this.delay(matches.map(publicItem));
	}

	async scan(value: string): Promise<ScanMatch> {
		const term = value.trim();
		const byBarcode = ITEMS.find((item) => item.barcode === term);
		const byCode = ITEMS.find((item) => item.item_code.toLowerCase() === term.toLowerCase());
		const match = byBarcode ?? byCode;
		if (match) {
			return this.delay(
				parseScanResponse(
					{
						item_code: match.item_code,
						barcode: byBarcode ? match.barcode : undefined,
						uom: match.stock_uom,
						record_type: byBarcode ? "Item Barcode" : "Item Code",
						has_batch_no: match.has_batch_no,
						has_serial_no: match.has_serial_no,
					},
					term
				)
			);
		}
		if (WAREHOUSES.some((warehouse) => warehouse.name === term)) {
			return this.delay({ kind: "warehouse", warehouse: term, raw: term });
		}
		return this.delay({ kind: "none", raw: term });
	}

	async stockFor(itemCode: string): Promise<StockRow[]> {
		const item = itemFor(itemCode);
		const rows = WAREHOUSES.map((warehouse) => ({
			warehouse: warehouse.name,
			actual_qty: qtyOf(item.item_code, warehouse.name),
			stock_uom: item.stock_uom,
			valuation_rate: item.item_code === "EQ-4001" ? 4200 : 12.5,
		}));
		return this.delay(rows.sort((a, b) => b.actual_qty - a.actual_qty));
	}

	async createDoc(doc: Record<string, unknown>): Promise<{ name: string }> {
		const doctype = String(doc.doctype ?? "");
		if (!doctype) throw new ApiError("The document is missing its doctype", "validation", 417);
		const prefix = doctype === "Stock Reconciliation" ? "SR" : "STE";
		const name = `${prefix}-DEMO-${++sequence}`;
		documents.set(name, { ...doc, name, docstatus: 0 });
		return this.delay({ name }, 140);
	}

	async submitDoc(doc: Record<string, unknown>): Promise<{ name: string }> {
		const name = String(doc.name ?? "");
		const stored = documents.get(name) ?? { ...doc, name, docstatus: 0 };
		if (stored.docstatus === 1) throw new ApiError(`${name} was already submitted`, "conflict", 409);

		applyDocument(stored);
		stored.docstatus = 1;
		documents.set(name, stored);
		return this.delay({ name }, 200);
	}

	async findByReference(reference: string): Promise<string | null> {
		for (const [name, doc] of documents) {
			const remarks = typeof doc.remarks === "string" ? doc.remarks : "";
			if (remarks.includes(reference)) return this.delay(name, 60);
		}
		return this.delay(null, 60);
	}
}
