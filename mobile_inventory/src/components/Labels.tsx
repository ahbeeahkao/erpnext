import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";
import type { LabelData } from "../lib/labels";
import { CloseIcon } from "./icons";
import { Button } from "./ui";

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : "Printing is not available on this device";
}

/**
 * A printable sheet of labels. The barcode is drawn into the SVG on mount; if the encoder or the
 * printer is not available the label still reads, which is the failure mode that matters.
 */
export function LabelSheet({
	labels,
	onClose,
	onError,
}: {
	labels: LabelData[];
	onClose: () => void;
	onError?: (message: string) => void;
}) {
	const refs = useRef<Array<SVGSVGElement | null>>([]);

	useEffect(() => {
		labels.forEach((label, index) => {
			const svg = refs.current[index];
			if (!svg) return;
			try {
				JsBarcode(svg, label.itemCode, {
					format: "CODE128",
					displayValue: false,
					height: 34,
					width: 1.4,
					margin: 0,
				});
			} catch {
				// An encoder that cannot draw this value leaves a text-only label.
			}
		});
	}, [labels]);

	function print() {
		try {
			window.print();
		} catch (error) {
			onError?.(messageOf(error));
		}
	}

	return (
		<div className="label-overlay" role="dialog" aria-modal="true" aria-label="Labels">
			<div className="label-sheet__bar">
				<strong>
					{labels.length} label{labels.length === 1 ? "" : "s"}
				</strong>
				<div className="label-sheet__actions">
					<Button variant="secondary" onClick={print}>
						Print
					</Button>
					<button className="icon-btn" onClick={onClose} aria-label="Close labels">
						<CloseIcon width={20} height={20} />
					</button>
				</div>
			</div>

			<div className="label-sheet">
				{labels.map((label, index) => (
					<div className="label" key={`${label.itemCode}-${index}`}>
						<div className="label__row">
							<strong>{label.itemCode}</strong>
							<span>
								{label.qty} {label.uom}
							</span>
						</div>
						<svg
							className="label__barcode"
							ref={(node) => {
								refs.current[index] = node;
							}}
						/>
						<div className="label__row label__row--small">
							<span>{label.itemName}</span>
							{label.batchNo ? <span>Batch {label.batchNo}</span> : null}
						</div>
						<div className="label__row label__row--small">
							<span>{label.warehouse}</span>
							{label.location ? <span>{label.location}</span> : null}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
