// A small offline catalogue.
//
// Item master data and the barcode → item mapping are read far more often than they change, and a
// warehouse is exactly where the signal dies. Every successful lookup writes through to the device,
// so scanning an item you have seen before still works with no connection — enough to queue the move
// and let it post later.
//
// Only master data is cached. Stock balances are cached too, but they are marked stale when served
// offline: a stale quantity must never look like a fresh one.

import { kvGet, kvSet } from "./storage.ts";
import type { ItemInfo, StockRow } from "./types";

const KEY = "catalogue:v1";
/** Enough for the items a site actually moves; keeps the record small enough to rewrite cheaply. */
export const MAX_ITEMS = 2000;

interface Entry {
	item: ItemInfo;
	touched: number;
}

interface Catalogue {
	items: Entry[];
	barcodes: Record<string, string>;
	stocks: Record<string, { rows: StockRow[]; at: number }>;
}

const EMPTY: Catalogue = { items: [], barcodes: {}, stocks: {} };
let cache: Catalogue | null = null;

async function load(): Promise<Catalogue> {
	if (cache) return cache;
	const stored = await kvGet<Catalogue>(KEY);
	cache = stored && Array.isArray(stored.items) ? stored : { ...EMPTY, items: [], barcodes: {}, stocks: {} };
	return cache;
}

async function save(next: Catalogue): Promise<void> {
	cache = next;
	await kvSet(KEY, next);
}

export async function rememberItem(item: ItemInfo): Promise<void> {
	if (!item?.item_code) return;
	const catalogue = await load();
	const items = catalogue.items.filter((entry) => entry.item.item_code !== item.item_code);
	items.push({ item, touched: Date.now() });
	// Oldest first out: the record stays bounded without a separate index.
	while (items.length > MAX_ITEMS) items.shift();
	await save({ ...catalogue, items });
}

export async function rememberItems(list: ItemInfo[]): Promise<void> {
	for (const item of list) await rememberItem(item);
}

export async function rememberScan(value: string, itemCode: string): Promise<void> {
	const key = value.trim().toLowerCase();
	if (!key || !itemCode) return;
	const catalogue = await load();
	await save({ ...catalogue, barcodes: { ...catalogue.barcodes, [key]: itemCode } });
}

export async function rememberStock(itemCode: string, rows: StockRow[]): Promise<void> {
	const catalogue = await load();
	await save({ ...catalogue, stocks: { ...catalogue.stocks, [itemCode]: { rows, at: Date.now() } } });
}

export async function cachedItem(itemCode: string): Promise<ItemInfo | null> {
	const catalogue = await load();
	const key = itemCode.trim().toLowerCase();
	const found = catalogue.items.find((entry) => entry.item.item_code.toLowerCase() === key);
	return found?.item ?? null;
}

/** Resolves a scanned value (barcode or item code) with no server at all. */
export async function cachedScan(value: string): Promise<ItemInfo | null> {
	const catalogue = await load();
	const key = value.trim().toLowerCase();
	const code = catalogue.barcodes[key] ?? value.trim();
	return cachedItem(code);
}

export async function searchCachedItems(query: string, limit = 25): Promise<ItemInfo[]> {
	const term = query.trim().toLowerCase();
	if (term.length < 2) return [];
	const catalogue = await load();
	return catalogue.items
		.map((entry) => entry.item)
		.filter(
			(item) =>
				item.item_code.toLowerCase().includes(term) ||
				(item.item_name ?? "").toLowerCase().includes(term)
		)
		.slice(0, limit);
}

/** Last known balances, each row flagged so no screen can present them as fresh. */
export async function cachedStock(itemCode: string): Promise<StockRow[]> {
	const catalogue = await load();
	const found = catalogue.stocks[itemCode];
	if (!found) return [];
	return found.rows.map((row) => ({ ...row, stale: true }));
}

export async function catalogueSize(): Promise<number> {
	const catalogue = await load();
	return catalogue.items.length;
}

/** Used by the "clear local data" button and by tests. */
export async function clearCatalogue(): Promise<void> {
	cache = { items: [], barcodes: {}, stocks: {} };
	await kvSet(KEY, cache);
}
