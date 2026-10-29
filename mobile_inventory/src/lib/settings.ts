// Connection/session persistence + small cached lookups.

import { kvDelete, kvGet, kvSet } from "./storage";
import type { Session, Warehouse } from "./types";

const SESSION_KEY = "session";
const WAREHOUSE_CACHE = "warehouses";

export const DEFAULT_SESSION: Session = { mode: "demo", demo: true };

export async function loadSession(): Promise<Session | null> {
	const stored = await kvGet<Session>(SESSION_KEY);
	if (stored) return stored;
	return null;
}

export async function saveSession(session: Session): Promise<void> {
	await kvSet(SESSION_KEY, session);
}

export async function clearSession(): Promise<void> {
	await kvDelete(SESSION_KEY);
	await kvDelete(WAREHOUSE_CACHE);
}

export async function cacheWarehouses(session: Session, warehouses: Warehouse[]): Promise<void> {
	await kvSet(`${WAREHOUSE_CACHE}:${sessionKey(session)}`, warehouses);
}

export async function cachedWarehouses(session: Session): Promise<Warehouse[]> {
	return (await kvGet<Warehouse[]>(`${WAREHOUSE_CACHE}:${sessionKey(session)}`)) ?? [];
}

export function sessionKey(session: Session): string {
	if (session.mode === "demo") return "demo";
	return session.mode === "token" ? `token:${session.baseUrl ?? ""}` : "site";
}

/** Trims a URL and drops a trailing slash so paths can be appended safely. */
export function normalizeBaseUrl(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	return withScheme.replace(/\/+$/, "");
}

export function todayIso(): string {
	const now = new Date();
	const offset = now.getTimezoneOffset();
	return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
