// Shared types for the mobile inventory app.

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

export type MoveKind = "receipt" | "issue" | "transfer";
export type OpKind = MoveKind | "count";

export interface MoveInput {
	id: string;
	kind: MoveKind;
	itemCode: string;
	qty: number;
	uom: string;
	fromWarehouse?: string;
	toWarehouse?: string;
	rate?: number | null;
	zeroValuation?: boolean;
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
	error?: string;
	serverName?: string;
	lastAttemptAt?: string;
	demo?: boolean;
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
	findByReference(reference: string): Promise<string | null>;
}
