// Thin ERPNext REST client.
//
// Two auth modes:
//  * "site"  – the app is served from the ERPNext site itself (www page or /assets), so the
//              browser session cookie is used. Unsafe requests get X-Frappe-CSRF-Token from
//              window.csrf_token (injected by the www template), like the desk/banking SPA.
//  * "token" – standalone hosting. Uses `Authorization: token <api_key>:<api_secret>`.
//              Frappe skips the CSRF check when the session has no csrf token, which is the
//              case for token-authenticated requests.
//
// Reads use GET (whitelisted methods accept GET and query params) so they work in both modes
// without a CSRF token; writes always POST.
import { ApiError, toApiError } from "./errors";
import { parseScanResponse } from "./payloads";
import type { Connection, InventoryClient, ItemInfo, ScanMatch, Session, StockRow, Warehouse } from "./types";

const TIMEOUT_MS = 20_000;

const ITEM_FIELDS = [
	"item_code",
	"item_name",
	"stock_uom",
	"has_batch_no",
	"has_serial_no",
	"is_stock_item",
	"image",
	"item_group",
];

type Query = Record<string, string | number | undefined | null>;

interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	query?: Query;
	body?: unknown;
	timeoutMs?: number;
}

function csrfToken(): string | null {
	const injected = (window as unknown as { csrf_token?: string }).csrf_token;
	if (injected) return injected;
	const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
	return meta?.content ?? null;
}

function unwrap<T>(payload: unknown, key: "message" | "data"): T {
	if (payload && typeof payload === "object" && key in payload) {
		return (payload as Record<string, T>)[key];
	}
	return payload as T;
}

export class FrappeClient implements InventoryClient {
	readonly mode: "site" | "token";
	private readonly session: Session;

	constructor(session: Session) {
		this.session = session;
		this.mode = session.mode === "token" ? "token" : "site";
	}

	// ---------------------------------------------------------------- transport

	private buildUrl(path: string, query?: Query): string {
		const base = this.mode === "token" ? this.session.baseUrl ?? "" : "";
		const raw = `${base}${path}`;
		const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(raw, window.location.origin);
		for (const [key, value] of Object.entries(query ?? {})) {
			if (value === undefined || value === null || value === "") continue;
			url.searchParams.set(key, String(value));
		}
		return url.toString();
	}

	private headers(unsafe: boolean, hasBody: boolean): Record<string, string> {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (hasBody) headers["Content-Type"] = "application/json";

		if (this.mode === "token") {
			if (!this.session.apiKey || !this.session.apiSecret) {
				throw new ApiError("API key and secret are required", "auth");
			}
			headers.Authorization = `token ${this.session.apiKey}:${this.session.apiSecret}`;
		} else if (unsafe) {
			const token = csrfToken();
			if (token) headers["X-Frappe-CSRF-Token"] = token;
		}

		return headers;
	}

	private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
		const method = options.method ?? "GET";
		const unsafe = method !== "GET";
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

		let response: Response;
		try {
			response = await fetch(this.buildUrl(path, options.query), {
				method,
				credentials: this.mode === "site" ? "same-origin" : "omit",
				headers: this.headers(unsafe, options.body !== undefined),
				body: options.body === undefined ? undefined : JSON.stringify(options.body),
				signal: controller.signal,
			});
		} catch {
			throw new ApiError(
				controller.signal.aborted
					? "The server took too long to answer. Try again."
					: "Cannot reach the server. Check the connection and the site URL.",
				"network"
			);
		} finally {
			clearTimeout(timer);
		}

		const text = await response.text();
		let payload: unknown = null;
		if (text) {
			try {
				payload = JSON.parse(text);
			} catch {
				payload = text;
			}
		}

		if (!response.ok) throw toApiError(response.status, payload);
		return payload as T;
	}

	// ---------------------------------------------------------------- endpoints

	async connect(): Promise<Connection> {
		const user = unwrap<string>(await this.request("/api/method/frappe.auth.get_logged_user"), "message");
		if (!user || user === "Guest") {
			throw new ApiError(
				"Not signed in. Use an API key/secret, or open the app from your ERPNext site.",
				"auth"
			);
		}

		const [warehouses, companies] = await Promise.all([
			this.listWarehouses().catch(() => [] as Warehouse[]),
			this.listCompanies().catch(() => [] as string[]),
		]);

		let company = companies[0];
		try {
			const defaults = unwrap<{ default_company?: string }>(
				await this.request("/api/resource/Global Defaults/Global Defaults", {
					query: { fields: JSON.stringify(["default_company"]) },
				}),
				"data"
			);
			if (defaults?.default_company) company = defaults.default_company;
		} catch {
			// Global Defaults may not be readable by every role; the first company is fine.
		}

		return { user, company, warehouses };
	}

	async listWarehouses(): Promise<Warehouse[]> {
		const data = unwrap<Warehouse[]>(
			await this.request("/api/resource/Warehouse", {
				query: {
					fields: JSON.stringify(["name", "warehouse_name", "company"]),
					filters: JSON.stringify([
						["is_group", "=", 0],
						["disabled", "=", 0],
					]),
					order_by: "name asc",
					limit_page_length: 500,
				},
			}),
			"data"
		);
		return data ?? [];
	}

	async listCompanies(): Promise<string[]> {
		const rows = unwrap<{ name: string }[]>(
			await this.request("/api/resource/Company", {
				query: { fields: JSON.stringify(["name"]), order_by: "name asc", limit_page_length: 100 },
			}),
			"data"
		);
		return (rows ?? []).map((row) => row.name);
	}

	async itemInfo(itemCode: string): Promise<ItemInfo> {
		const data = unwrap<ItemInfo>(
			await this.request(`/api/resource/Item/${encodeURIComponent(itemCode)}`, {
				query: { fields: JSON.stringify(ITEM_FIELDS) },
			}),
			"data"
		);
		if (!data?.item_code) throw new ApiError(`Item ${itemCode} was not found`, "validation", 404);
		return data;
	}

	async searchItems(query: string): Promise<ItemInfo[]> {
		const term = query.trim();
		if (term.length < 2) return [];
		const like = `%${term}%`;
		const rows = unwrap<ItemInfo[]>(
			await this.request("/api/resource/Item", {
				query: {
					fields: JSON.stringify(ITEM_FIELDS),
					filters: JSON.stringify([
						["disabled", "=", 0],
						["is_stock_item", "=", 1],
					]),
					or_filters: JSON.stringify([
						["item_code", "like", like],
						["item_name", "like", like],
					]),
					order_by: "item_name asc",
					limit_page_length: 25,
				},
			}),
			"data"
		);
		return rows ?? [];
	}

	async scan(value: string): Promise<ScanMatch> {
		const trimmed = value.trim();
		if (!trimmed) throw new ApiError("Nothing to look up", "validation");
		const message = unwrap<unknown>(
			await this.request("/api/method/erpnext.stock.utils.scan_barcode", {
				query: { search_value: trimmed },
			}),
			"message"
		);
		return parseScanResponse(message, trimmed);
	}

	async stockFor(itemCode: string): Promise<StockRow[]> {
		const rows = unwrap<StockRow[]>(
			await this.request("/api/resource/Bin", {
				query: {
					fields: JSON.stringify(["warehouse", "actual_qty", "stock_uom", "valuation_rate"]),
					filters: JSON.stringify([["item_code", "=", itemCode]]),
					order_by: "actual_qty desc",
					limit_page_length: 200,
				},
			}),
			"data"
		);
		return rows ?? [];
	}

	async createDoc(doc: Record<string, unknown>): Promise<{ name: string }> {
		const doctype = typeof doc.doctype === "string" ? doc.doctype : "";
		if (!doctype) throw new ApiError("The document is missing its doctype", "validation");
		const data = unwrap<{ name?: string }>(
			await this.request(`/api/resource/${encodeURIComponent(doctype)}`, {
				method: "POST",
				body: doc,
			}),
			"data"
		);
		if (!data?.name) throw new ApiError("The server did not return a document name", "server");
		return { name: data.name };
	}

	async submitDoc(doc: Record<string, unknown>): Promise<{ name: string }> {
		const message = unwrap<unknown>(
			await this.request("/api/method/frappe.client.submit", {
				method: "POST",
				body: { doc: JSON.stringify(doc) },
			}),
			"message"
		);
		if (typeof message === "string") return { name: message };
		const name = (message as { name?: string } | null)?.name;
		if (!name) throw new ApiError("The server did not confirm the submission", "server");
		return { name };
	}

	async findByReference(reference: string): Promise<string | null> {
		const rows = unwrap<{ name: string }[]>(
			await this.request("/api/resource/Stock Entry", {
				query: {
					fields: JSON.stringify(["name"]),
					filters: JSON.stringify([["remarks", "like", `%${reference}%`]]),
					limit_page_length: 1,
				},
			}),
			"data"
		);
		return rows?.[0]?.name ?? null;
	}
}
