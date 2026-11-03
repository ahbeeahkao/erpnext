// Zebra Programming Language, by hand.
//
// A phone cannot open a socket to a printer on port 9100, so the app has two honest routes to a
// real label: print the sheet from the browser, or hand a printer-ready ZPL string to a small
// bridge running on the same network. This module builds that string. It is pure and import-free so
// the tests can read it — a label that comes out garbled is a printer jam in the middle of a
// delivery, and there is no way to debug that from the app.
//
// Sizes are the stock that is actually sold in Malaysia: 50 × 25 mm carton labels, 100 × 50 mm
// pallet/shelf labels, and the 38 × 25 mm dymo-style strip.

export type LabelSize = "50x25" | "100x50" | "38x25";

export interface LabelStock {
	/** Millimetres. */
	width: number;
	height: number;
	/** What to call it in the settings screen. */
	label: string;
}

export const LABEL_SIZES: Record<LabelSize, LabelStock> = {
	"50x25": { width: 50, height: 25, label: "50 × 25 mm — carton" },
	"100x50": { width: 100, height: 50, label: "100 × 50 mm — pallet / shelf" },
	"38x25": { width: 38, height: 25, label: "38 × 25 mm — strip" },
};

export const DEFAULT_LABEL_SIZE: LabelSize = "50x25";

/** Every Zebra desktop printer in this class is 203 dpi (8 dots/mm) unless someone changed it. */
export const LABEL_DPI = 203;

export function mmToDots(mm: number, dpi = LABEL_DPI): number {
	return Math.round((mm / 25.4) * dpi);
}

/**
 * `^` and `~` are control characters in ZPL, and an item name is allowed to contain either. A name
 * with a caret in it would silently swallow the rest of the label, so they become spaces. Newlines
 * collapse for the same reason.
 */
export function zplText(value: string, max = 48): string {
	return value
		.replace(/[\^~]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, max);
}

export interface ZplLabel {
	itemCode: string;
	qty: number;
	uom: string;
	itemName?: string;
	batchNo?: string;
	warehouse?: string;
	location?: string;
}

/** The second line under the barcode: what a person needs to know when the label is on a carton. */
export function labelFootLine(label: ZplLabel): string {
	return [label.warehouse, label.location, label.batchNo ? `Batch ${label.batchNo}` : ""]
		.filter((part) => part && String(part).trim())
		.join(" · ");
}

/**
 * One label, laid out in fractions of the stock height so the same code works on all three sizes.
 * The barcode carries the item code, because that is what the scanner on the other end reads.
 */
export function labelZpl(label: ZplLabel, size: LabelSize = DEFAULT_LABEL_SIZE): string {
	const stock = LABEL_SIZES[size];
	const width = mmToDots(stock.width);
	const height = mmToDots(stock.height);

	const x = Math.round(width * 0.04);
	const box = width - x * 2;
	// ZPL fonts below ~14 dots are unreadable on a thermal head; clamp rather than shrink.
	const font = (fraction: number) => Math.max(14, Math.round(height * fraction));

	const qty = `${label.qty} ${label.uom}`.trim();
	const name = zplText(label.itemName ?? "", 60);
	const foot = zplText(labelFootLine(label), 60);

	const parts = [
		"^XA",
		`^PW${width}`,
		`^LL${height}`,
		"^CI28",
		// item code, top left
		`^FO${x},${Math.round(height * 0.02)}^A0N,${font(0.1)},${font(0.1)}^FB${Math.round(
			box * 0.62
		)},1,0,L^FD${zplText(label.itemCode, 26)}^FS`,
		// quantity, top right
		`^FO${x},${Math.round(height * 0.02)}^A0N,${font(0.1)},${font(0.1)}^FB${box},1,0,R^FD${qty}^FS`,
		// CODE128, no interpretation line — the code is already written above it
		`^BY2,2,${Math.round(height * 0.3)}`,
		`^FO${x},${Math.round(height * 0.28)}^BCN,${Math.round(height * 0.3)},N,N,N^FD${zplText(
			label.itemCode,
			40
		)}^FS`,
	];
	if (name) {
		parts.push(
			`^FO${x},${Math.round(height * 0.62)}^A0N,${font(0.08)},${font(
				0.08
			)}^FB${box},1,0,L^FD${name}^FS`
		);
	}
	if (foot) {
		parts.push(
			`^FO${x},${Math.round(height * 0.79)}^A0N,${font(0.08)},${font(
				0.08
			)}^FB${box},1,0,L^FD${foot}^FS`
		);
	}
	parts.push("^XZ");
	return `${parts.join("\n")}\n`;
}

/** Every label on the sheet, one after another — one print job, not one per carton. */
export function labelsZpl(labels: ZplLabel[], size: LabelSize = DEFAULT_LABEL_SIZE): string {
	return labels.map((label) => labelZpl(label, size)).join("");
}

/** `FG-1002-3.zpl` — a filename someone can find again in the download folder. */
export function zplFileName(labels: ZplLabel[]): string {
	const first = labels[0]?.itemCode ?? "labels";
	const safe = first.replace(/[^A-Za-z0-9._-]+/g, "-");
	return `${safe}-${labels.length}.zpl`;
}
