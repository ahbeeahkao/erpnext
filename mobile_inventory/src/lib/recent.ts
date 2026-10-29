// Recently opened items, kept locally so the home screen is useful without a search.

import { kvGet, kvSet } from "./storage";
import type { ItemInfo } from "./types";

const KEY = "recent-items";
const LIMIT = 8;

export type RecentItem = Pick<ItemInfo, "item_code" | "item_name" | "stock_uom">;

export async function loadRecent(): Promise<RecentItem[]> {
	return (await kvGet<RecentItem[]>(KEY)) ?? [];
}

export async function addRecent(item: RecentItem): Promise<RecentItem[]> {
	const existing = await loadRecent();
	const next = [item, ...existing.filter((row) => row.item_code !== item.item_code)].slice(0, LIMIT);
	await kvSet(KEY, next);
	return next;
}

export async function clearRecent(): Promise<void> {
	await kvSet(KEY, []);
}
