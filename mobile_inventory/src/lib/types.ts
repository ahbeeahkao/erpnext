// Shared types for the mobile inventory app.
import type { LabelSize } from "./zpl";


export type AuthMode = "site" | "token" | "demo";

export interface Session {
	mode: AuthMode;
	/** Absolute site URL, only for token mode. Empty means "same origin". */
	baseUrl?: string;
	apiKey?: string;
	apiSecret?: string;
	user?: string;
	company?: string;
	defaultWarehouse?: string;
	/** Label stock on the shop's printer. */
	labelSize?: LabelSize;
	/** Address of the small helper that forwards ZPL to the printer, if the site has one. */
	printBridge?: string;
	/** Demo data is kept separate so it never mixes with real queued work. */
	demo?: boolean;
}

export interface Warehouse {
	name: string;
	warehouse_name?: string;
	company?: string;
}

export interface ItemInfo {
	item_code: string;
	item_name?: string;
	stock_uom?: string;
	has_batch_no?: 0 | 1;
	has_serial_no?: 0 | 1;
	is_stock_item?: 0 | 1;
	image?: string | null;
	item_group?: string;
}

export interface StockRow {
	/** Served from the device: last known, not current. */
	stale?: boolean;
	warehouse: string;
	actual_qty: number;
	stock_uom?: string;
	valuation_rate?: number;
}

export interface ScanCandidate {
	item_code: string;
	barcode?: string;
	uom?: string;
	batch_no?: string;
	serial_no?: string;
}

export interface ScanMatch {
	kind: "item" | "candidates" | "warehouse" | "none";
	item_code?: string;
	uom?: string;
	batch_no?: string;
	serial_no?: string;
	has_batch_no?: 0 | 1;
	has_serial_no?: 0 | 1;
	candidates?: ScanCandidate[];
	warehouse?: string;
	/** Original scanned text, kept for the UI. */
	raw?: string;
}

/** What the app can still create by hand: one item moved between two warehouses. */
export type MoveKind = "transfer";

/**
 * Receipt and issue were queued by older builds. They are no longer created (receiving and issuing
 * are jobs), but a phone that upgraded mid-shift may still hold them, so the queue still knows them.
 */
export type LegacyMoveKind = "receipt" | "issue";
export type TaskKind = "count-rack" | "putaway" | "issue" | "pick-wo" | "pick-dn";

/** Every job the home screen can start. */
export type JobKey = "receive" | TaskKind;

export type OpKind = MoveKind | LegacyMoveKind | "count" | "po-receipt" | TaskKind;

export interface MoveInput {
	id: string;
	itemCode: string;
	qty: number;
	uom: string;
	fromWarehouse?: string;
	toWarehouse?: string;
	batchNo?: string;
	serialNo?: string;
	note?: string;
}

export interface CountInput {
	id: string;
	itemCode: string;
	qty: number;
	uom: string;
	warehouse: string;
	valuationRate?: number | null;
	batchNo?: string;
	note?: string;
}

export interface OpSummary {
	kind: OpKind;
	/** Shown in the queue instead of the item/qty line when a task produced several lines. */
	label?: string;
	itemCode: string;
	itemName?: string;
	qty: number;
	uom: string;
	fromWarehouse?: string;
	toWarehouse?: string;
	warehouse?: string;
	difference?: number;
}

export type OpStatus = "pending" | "syncing" | "error" | "done";

export interface QueueOp {
	id: string;
	kind: OpKind;
	createdAt: string;
	status: OpStatus;
	attempts: number;
	/** Full ERPNext document payload; built locally so it can be queued offline. */
	doc: Record<string, unknown>;
	summary: OpSummary;
	/** false for documents that must stay drafts (a pick hands over to dispatch, who submits). */
	submit?: boolean;
	error?: string;
	serverName?: string;
	lastAttemptAt?: string;
	demo?: boolean;
}

export interface ExistingDoc {
	name: string;
	/** 0 draft, 1 submitted, 2 cancelled. A draft is NOT a posted document. */
	docstatus: number;
}

export interface PurchaseOrder {
	name: string;
	supplier?: string;
	company?: string;
	transaction_date?: string;
	per_received?: number;
	status?: string;
}

export interface PurchaseOrderLine {
	/** Child row name — becomes `purchase_order_item` on the receipt. */
	name: string;
	item_code: string;
	item_name?: string;
	qty: number;
	received_qty?: number;
	uom?: string;
	stock_uom?: string;
	conversion_factor?: number;
	warehouse?: string;
	rate?: number;
}

export interface ReceiptLine {
	key: string;
	itemCode: string;
	itemName?: string;
	uom: string;
	stockUom?: string;
	conversionFactor: number;
	warehouse: string;
	orderedQty: number;
	alreadyReceived: number;
	/** Counted on this device, in `uom`. */
	receivedNow: number;
	/** Part of `receivedNow` that is not fit to sell: goes to the quarantine warehouse. */
	rejectedNow?: number;
	rejectedWarehouse?: string;
	rate?: number;
	batchNo?: string;
	/** What the operator sees when the link value is not the lot number. */
	batchLabel?: string;
	serialNo?: string;
	hasBatchNo?: boolean;
	hasSerialNo?: boolean;
}

export interface ReceiptTask {
	/** Device-side task id; also the idempotency marker on the document. */
	id: string;
	order: string;
	supplier?: string;
	company: string;
	postingDate: string;
	postingTime: string;
	blind: boolean;
	lines: ReceiptLine[];
}

/** A configured Inventory Dimension, e.g. Location / Shelf, applied to stock documents. */
export interface InventoryDimension {
	dimension_name: string;
	/** Field name on the transaction row, e.g. `location`. */
	fieldname: string;
	/** What the value points at, usually a DocType such as Location. */
	doctype?: string;
}

export interface BatchOption {
	batch_no: string;
	qty: number;
	expiry_date?: string | null;
}

/** A batch the device just created on the site. `name` is the link value, `batch_id` what a human reads. */
/** One line of the site check: does this ERPNext actually support what the app asks of it? */
export interface DiagnosticCheck {
	id: string;
	label: string;
	ok: boolean;
	detail: string;
}

export interface CreatedBatch {
	name: string;
	batch_id: string;
}

export interface FlowLine {
	/** Stable key: item code for scanned flows, source row name for document flows. */
	key: string;
	itemCode: string;
	itemName?: string;
	uom: string;
	conversionFactor: number;
	/** Captured on the device. */
	qty: number;
	/** What the job expects; hidden while blind, never removed. */
	requiredQty?: number;
	/** What the system believes is on the shelf (counts only). */
	systemQty?: number;
	valuationRate?: number;
	fromWarehouse?: string;
	toWarehouse?: string;
	/** The link value posted to ERPNext (a Batch document name). */
	batchNo?: string;
	/** What the operator sees when the link value is not the lot number. */
	batchLabel?: string;
	serialNo?: string;
	hasBatchNo?: boolean;
	hasSerialNo?: boolean;
	/** Child row on the source document (SO row / WO row). */
	sourceRow?: string;
	/** Value of the configured dimension, e.g. the shelf. Falls back to the task default. */
	location?: string;
	/** Why a pick came up short. Goes into the document remarks, where dispatch can read it. */
	shortReason?: string;
}

export interface FlowTask {
	id: string;
	kind: TaskKind;
	title: string;
	subtitle?: string;
	/** What the job is about: a warehouse, a work order, a sales order. */
	reference: string;
	customer?: string;
	company: string;
	postingDate: string;
	postingTime: string;
	blind: boolean;
	fromWarehouse?: string;
	toWarehouse?: string;
	/** Set when the site has an Inventory Dimension the task can record, e.g. `location`. */
	dimensionField?: string;
	dimensionName?: string;
	/** Default dimension value for every line. */
	location?: string;
	lines: FlowLine[];
}

export interface WorkOrder {
	name: string;
	production_item?: string;
	qty?: number;
	produced_qty?: number;
	status?: string;
	company?: string;
	wip_warehouse?: string;
	source_warehouse?: string;
	planned_start_date?: string;
}

export interface WorkOrderLine {
	name: string;
	item_code: string;
	item_name?: string;
	required_qty?: number;
	transferred_qty?: number;
	source_warehouse?: string;
	stock_uom?: string;
}

export interface SalesOrder {
	name: string;
	customer?: string;
	company?: string;
	transaction_date?: string;
	delivery_date?: string;
	per_delivered?: number;
	status?: string;
}

export interface SalesOrderLine {
	name: string;
	item_code: string;
	item_name?: string;
	qty: number;
	delivered_qty?: number;
	uom?: string;
	stock_uom?: string;
	conversion_factor?: number;
	warehouse?: string;
}

export interface Connection {
	user: string;
	company?: string;
	warehouses: Warehouse[];
}

export interface InventoryClient {
	readonly mode: AuthMode;
	connect(): Promise<Connection>;
	listWarehouses(): Promise<Warehouse[]>;
	listCompanies(): Promise<string[]>;
	itemInfo(itemCode: string): Promise<ItemInfo>;
	searchItems(query: string): Promise<ItemInfo[]>;
	scan(value: string): Promise<ScanMatch>;
	stockFor(itemCode: string): Promise<StockRow[]>;
	createDoc(doc: Record<string, unknown>): Promise<{ name: string }>;
	submitDoc(doc: Record<string, unknown>): Promise<{ name: string }>;
	/** Finds a previously posted document by its device marker, with its docstatus. */
	findDocument(doctype: string, reference: string): Promise<ExistingDoc | null>;
	/** Purchase orders with quantity still to receive, oldest first. */
	openPurchaseOrders(): Promise<PurchaseOrder[]>;
	purchaseOrderLines(order: string): Promise<PurchaseOrderLine[]>;

	/** Work orders with material still to pick. */
	openWorkOrders(): Promise<WorkOrder[]>;
	workOrderLines(workOrder: string): Promise<WorkOrderLine[]>;

	/** Inventory Dimensions configured on the site (empty when none, or when not permitted). */
	inventoryDimensions(): Promise<InventoryDimension[]>;

	/** Batches with stock, oldest expiry first (FEFO) — what a picker should take. */
	availableBatches(itemCode: string, warehouse: string): Promise<BatchOption[]>;

	/** Creates a Batch for a lot that arrived without one. Needs a site: master data is not queued. */
	createBatch(itemCode: string, batchId?: string): Promise<CreatedBatch>;
	/** Read-only checks against the connected site, so a pilot does not discover gaps mid-delivery. */
	runDiagnostics(): Promise<DiagnosticCheck[]>;

	/** Sales orders with quantity still to deliver. */
	openSalesOrders(): Promise<SalesOrder[]>;
	salesOrderLines(salesOrder: string): Promise<SalesOrderLine[]>;
}
