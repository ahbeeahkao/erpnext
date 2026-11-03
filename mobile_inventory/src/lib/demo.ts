// Demo adapter: an in-memory stand-in for a live ERPNext site.
//
// It exists so the UI can be explored without a bench (and so this sandbox can show a working
// preview). It mirrors the real client's behaviour closely enough to be useful: documents are
// created first and submitted second, stock moves update balances, negative stock is refused,
// and the idempotency marker in `remarks` finds an already-posted document.
import { ApiError } from "./errors";
import { parseScanResponse } from "./payloads";
import type {
	Connection,
	ExistingDoc,
	BatchOption,
	InventoryClient,
	InventoryDimension,
	ItemInfo,
	PurchaseOrder,
	PurchaseOrderLine,
	SalesOrder,
	SalesOrderLine,
	ScanMatch,
	StockRow,
	Warehouse,
	WorkOrder,
	WorkOrderLine,
} from "./types";

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

/** Two open purchase orders, so the receiving task has something real to receive. */
const PURCHASE_ORDERS: Array<PurchaseOrder & { lines: PurchaseOrderLine[] }> = [
	{
		name: "PO-DEMO-0001",
		supplier: "Kedai Kopi Supplies",
		company: "Demo Company",
		transaction_date: "2026-10-28",
		per_received: 0,
		status: "To Receive and Bill",
		lines: [
			{
				name: "po1-row1",
				item_code: "FG-1001",
				item_name: "Arabica Beans 1kg",
				qty: 40,
				received_qty: 0,
				uom: "Kg",
				stock_uom: "Kg",
				conversion_factor: 1,
				warehouse: "Stores - DEMO",
				rate: 32,
			},
			{
				name: "po1-row2",
				item_code: "FG-1002",
				item_name: "Cold Brew Bottle 330ml",
				qty: 120,
				received_qty: 0,
				uom: "Nos",
				stock_uom: "Nos",
				conversion_factor: 1,
				warehouse: "Cold Room - DEMO",
				rate: 3.2,
			},
		],
	},
	{
		name: "PO-DEMO-0002",
		supplier: "Sin Heng Hardware",
		company: "Demo Company",
		transaction_date: "2026-10-30",
		per_received: 0,
		status: "To Receive and Bill",
		lines: [
			{
				name: "po2-row1",
				item_code: "ACC-3001",
				item_name: "Paper Cup 8oz (sleeve)",
				qty: 24,
				received_qty: 0,
				uom: "Nos",
				stock_uom: "Nos",
				conversion_factor: 1,
				warehouse: "Stores - DEMO",
				rate: 4.5,
			},
		],
	},
];

/** How much of each order line has already been received on this device's demo site. */
const poReceived = new Map<string, number>();

/** A work order whose milk powder has not been issued yet. */
const WORK_ORDERS: Array<WorkOrder & { lines: WorkOrderLine[] }> = [
	{
		name: "WO-DEMO-0001",
		production_item: "FG-1002",
		qty: 60,
		produced_qty: 0,
		status: "Not Started",
		company: "Demo Company",
		wip_warehouse: "Transit - DEMO",
		source_warehouse: "Stores - DEMO",
		planned_start_date: "2026-11-03 08:00:00",
		lines: [
			{
				name: "wo1-row1",
				item_code: "RM-2001",
				item_name: "Milk Powder 25kg",
				required_qty: 4,
				transferred_qty: 1,
				source_warehouse: "Stores - DEMO",
				stock_uom: "Bag",
			},
			{
				name: "wo1-row2",
				item_code: "RM-2002",
				item_name: "Sugar Syrup 20L",
				required_qty: 6,
				transferred_qty: 0,
				source_warehouse: "Stores - DEMO",
				stock_uom: "Can",
			},
		],
	},
];

/** A sales order due out today. */
const SALES_ORDERS: Array<SalesOrder & { lines: SalesOrderLine[] }> = [
	{
		name: "SO-DEMO-0001",
		customer: "Kedai Kopi Jalan Ampang",
		company: "Demo Company",
		transaction_date: "2026-10-30",
		delivery_date: "2026-11-03",
		per_delivered: 0,
		status: "To Deliver and Bill",
		lines: [
			{
				name: "so1-row1",
				item_code: "FG-1002",
				item_name: "Cold Brew Bottle 330ml",
				qty: 24,
				delivered_qty: 0,
				uom: "Nos",
				stock_uom: "Nos",
				conversion_factor: 1,
				warehouse: "Stores - DEMO",
			},
			{
				name: "so1-row2",
				item_code: "ACC-3001",
				item_name: "Paper Cup 12oz",
				qty: 100,
				delivered_qty: 20,
				uom: "Nos",
				stock_uom: "Nos",
				conversion_factor: 1,
				warehouse: "Stores - DEMO",
			},
		],
	},
];

const woTransferred = new Map<string, number>();
const soDelivered = new Map<string, number>();

function applyDocument(doc: Record<string, unknown>): void {
	const rows = Array.isArray(doc.items) ? (doc.items as Record<string, any>[]) : [];
	if (!rows.length) throw new ApiError("The document has no items", "validation", 417);

	if (doc.doctype === "Purchase Receipt") {
		for (const row of rows) {
			const item = itemFor(String(row.item_code));
			const factor = Number(row.conversion_factor) || 1;
			const qty = Number(row.stock_qty ?? Number(row.qty) * factor) || 0;
			const rejected = (Number(row.rejected_qty) || 0) * factor;
			if (qty <= 0)
				throw new ApiError("Received quantity must be greater than zero", "validation", 417);
			if (rejected > qty)
				throw new ApiError("Rejected quantity cannot exceed the quantity", "validation", 417);
			if (rejected > 0) {
				if (!row.rejected_warehouse) {
					throw new ApiError("Rejected stock needs a warehouse", "validation", 417);
				}
				adjust(item.item_code, String(row.rejected_warehouse), rejected, "this receipt");
			}
			const lineKey = `${row.purchase_order}:${row.purchase_order_item}`;
			poReceived.set(lineKey, (poReceived.get(lineKey) ?? 0) + qty);
			adjust(item.item_code, String(row.warehouse), qty - rejected, "this receipt");
		}
		return;
	}

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
		} else if (type === "Material Transfer" || type === "Material Transfer for Manufacture") {
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

	async findDocument(doctype: string, reference: string): Promise<ExistingDoc | null> {
		let match: ExistingDoc | null = null;
		for (const [name, doc] of documents) {
			if (String(doc.doctype ?? "") !== doctype) continue;
			const remarks = typeof doc.remarks === "string" ? doc.remarks : "";
			if (!remarks.includes(reference)) continue;
			const docstatus = Number(doc.docstatus) || 0;
			// A submitted document wins over a draft left behind by an earlier failure.
			if (!match || docstatus > match.docstatus) match = { name, docstatus };
		}
		return this.delay(match, 60);
	}

	async openPurchaseOrders(): Promise<PurchaseOrder[]> {
		const open = PURCHASE_ORDERS.filter((order) => {
			const received = order.lines.every(
				(line) => (poReceived.get(`${order.name}:${line.name}`) ?? 0) >= line.qty
			);
			return !received;
		}).map(({ lines: _lines, ...header }) => header);
		return this.delay(open, 120);
	}

	async availableBatches(itemCode: string, warehouse: string): Promise<BatchOption[]> {
		// Two batches per batch-tracked demo item, oldest expiry first — the order a picker should use.
		const catalogue: Record<string, BatchOption[]> = {
			"FG-1001": [
				{ batch_no: "LOT-2601-A", qty: Math.min(18, qtyOf("FG-1001", warehouse) || 18), expiry_date: "2026-12-31" },
				{ batch_no: "LOT-2603-B", qty: 24, expiry_date: "2027-03-31" },
			],
			"RM-2001": [
				{ batch_no: "MP-2411", qty: 6, expiry_date: "2027-05-30" },
				{ batch_no: "MP-2502", qty: 9, expiry_date: "2027-11-30" },
			],
		};
		return this.delay(catalogue[itemCode] ?? [], 90);
	}

	async inventoryDimensions(): Promise<InventoryDimension[]> {
		return this.delay(
			[{ dimension_name: "Location", fieldname: "location", doctype: "Warehouse" }],
			80
		);
	}

	async openWorkOrders(): Promise<WorkOrder[]> {
		const open = WORK_ORDERS.map(({ lines: _lines, ...header }) => header);
		return this.delay(open, 120);
	}

	async workOrderLines(workOrder: string): Promise<WorkOrderLine[]> {
		const found = WORK_ORDERS.find((row) => row.name === workOrder);
		if (!found) throw new ApiError(`Work order ${workOrder} was not found`, "validation", 404);
		return this.delay(
			found.lines.map((line) => ({
				...line,
				transferred_qty: (line.transferred_qty ?? 0) + (woTransferred.get(`${found.name}:${line.name}`) ?? 0),
			})),
			120
		);
	}

	async openSalesOrders(): Promise<SalesOrder[]> {
		const open = SALES_ORDERS.map(({ lines: _lines, ...header }) => header);
		return this.delay(open, 120);
	}

	async salesOrderLines(salesOrder: string): Promise<SalesOrderLine[]> {
		const found = SALES_ORDERS.find((row) => row.name === salesOrder);
		if (!found) throw new ApiError(`Sales order ${salesOrder} was not found`, "validation", 404);
		return this.delay(
			found.lines.map((line) => ({
				...line,
				delivered_qty: (line.delivered_qty ?? 0) + (soDelivered.get(`${found.name}:${line.name}`) ?? 0),
			})),
			120
		);
	}

	async purchaseOrderLines(order: string): Promise<PurchaseOrderLine[]> {
		const found = PURCHASE_ORDERS.find((row) => row.name === order);
		if (!found) throw new ApiError(`Purchase order ${order} was not found`, "validation", 404);
		const lines = found.lines.map((line) => ({
			...line,
			received_qty: poReceived.get(`${found.name}:${line.name}`) ?? 0,
		}));
		return this.delay(lines, 120);
	}
}
