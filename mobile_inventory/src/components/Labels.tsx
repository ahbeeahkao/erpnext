import JsBarcode from "jsbarcode";
import { useEffect, useRef, useState } from "react";
import type { LabelData } from "../lib/labels";
import { sendLabelsToBridge } from "../lib/printbridge";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, labelsZpl, zplFileName, type LabelSize } from "../lib/zpl";
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
	onMessage,
	size = DEFAULT_LABEL_SIZE,
	bridgeUrl,
}: {
	labels: LabelData[];
	onClose: () => void;
	onError?: (message: string) => void;
	onMessage?: (message: string) => void;
	size?: LabelSize;
	bridgeUrl?: string;
}) {
	const refs = useRef<Array<SVGSVGElement | null>>([]);
	const [sending, setSending] = useState(false);
	const stock = LABEL_SIZES[size] ?? LABEL_SIZES[DEFAULT_LABEL_SIZE];

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

	/** The printer-ready string, saved as a file for the operator to hand to the printer's own tool. */
	function save() {
		const name = zplFileName(labels);
		try {
			const blob = new Blob([labelsZpl(labels, size)], { type: "text/plain;charset=UTF-8" });
			const href = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = href;
			link.download = name;
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(href), 2000);
			onMessage?.(`${labels.length} label${labels.length === 1 ? "" : "s"} saved as ${name}`);
		} catch (error) {
			onError?.(messageOf(error));
		}
	}

	async function send() {
		if (!bridgeUrl) return;
		setSending(true);
		try {
			await sendLabelsToBridge(bridgeUrl, labelsZpl(labels, size));
			onMessage?.(`Sent ${labels.length} label${labels.length === 1 ? "" : "s"} to the printer`);
		} catch (error) {
			onError?.(messageOf(error));
		} finally {
			setSending(false);
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
					<Button variant="ghost" onClick={save}>
						Save .zpl
					</Button>
					{bridgeUrl ? (
						<Button variant="secondary" onClick={() => void send()} loading={sending}>
							Send to printer
						</Button>
					) : null}
					<button className="icon-btn" onClick={onClose} aria-label="Close labels">
						<CloseIcon width={20} height={20} />
					</button>
				</div>
			</div>

			<div className="label-sheet">
				{labels.map((label, index) => (
					<div
						className="label"
						key={`${label.itemCode}-${index}`}
						style={{ width: `${stock.width}mm`, height: `${stock.height}mm` }}
					>
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
