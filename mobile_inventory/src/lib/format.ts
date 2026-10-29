// Formatting helpers shared by the UI.

export function formatQty(value: number, uom?: string): string {
	const rounded = Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
	const text = rounded.toLocaleString(undefined, { maximumFractionDigits: 3 });
	return uom ? `${text} ${uom}` : text;
}

export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const now = new Date();
	const sameDay = date.toDateString() === now.toDateString();
	const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	return sameDay
		? time
		: `${date.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} ${time}`;
}

export function relativeTime(iso: string): string {
	const date = new Date(iso).getTime();
	if (Number.isNaN(date)) return "";
	const seconds = Math.round((Date.now() - date) / 1000);
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86_400)}d ago`;
}

export function shortWarehouse(name?: string): string {
	if (!name) return "—";
	return name.replace(/\s*-\s*[A-Z0-9]{2,6}$/, "");
}
