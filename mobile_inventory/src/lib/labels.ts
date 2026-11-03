// Labels for the stock that just moved.
//
// A phone cannot drive a Zebra printer, but a browser can print a sheet: one label per unit, with a
// CODE128 of the item code, the batch and where it went. Pure data in `labelsForTask`, one overlay
// component for the sheet, and `@media print` in the stylesheet does the rest.

import type { FlowTask } from "./types";

export interface LabelData {
	itemCode: string;
	itemName?: string;
	batchNo?: string;
	qty: number;
	uom: string;
	warehouse?: string;
	location?: string;
}

/** A sheet nobody asked for is a printer jam. Two dozen covers a pallet's worth of cartons. */
export const MAX_LABELS = 24;

/**
 * Whole units get one label each — the point is to stick one on every carton. A weighed line
 * (0.5 Kg) gets a single label that states the quantity, because half a label is not a thing.
 */
export function labelCount(qty: number): number {
	if (!Number.isFinite(qty) || qty <= 0) return 0;
	return Number.isInteger(qty) ? qty : 1;
}

export function labelsForTask(task: FlowTask, max = MAX_LABELS): LabelData[] {
	// Counting does not create stock; there is nothing to label.
	if (task.kind === "count-rack") return [];

	const labels: LabelData[] = [];
	for (const line of task.lines) {
		if (line.qty <= 0) continue;
		const count = labelCount(line.qty);
		for (let index = 0; index < count; index += 1) {
			if (labels.length >= max) return labels;
			labels.push({
				itemCode: line.itemCode,
				itemName: line.itemName,
				batchNo: line.batchNo?.trim() || undefined,
				qty: count === 1 ? line.qty : 1,
				uom: line.uom,
				warehouse: line.toWarehouse ?? line.fromWarehouse ?? task.toWarehouse ?? task.fromWarehouse,
				location: (line.location ?? task.location)?.trim() || undefined,
			});
		}
	}
	return labels;
}
