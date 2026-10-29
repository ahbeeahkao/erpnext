import { useEffect, useRef, useState } from "react";
import { useScanner } from "../hooks/useScanner";
import { CloseIcon, ScanIcon } from "./icons";
import { Button, TextInput } from "./ui";

export function Scanner({
	title = "Scan a barcode",
	onResult,
	onClose,
}: {
	title?: string;
	onResult: (value: string) => void;
	onClose: () => void;
}) {
	const [manual, setManual] = useState("");
	const startedRef = useRef(false);
	const scanner = useScanner((value) => onResult(value));

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		void scanner.start();
		// Start once: `start` is stable and re-running would re-open the camera stream.
	}, []);

	return (
		<div className="scanner" role="dialog" aria-modal="true" aria-label={title}>
			<div className="scanner__stage">
				<video ref={scanner.videoRef} className="scanner__video" muted playsInline />
				{!scanner.active ? (
					<div className="scanner__placeholder">
						<ScanIcon width={40} height={40} />
						<p className="muted">{scanner.error ?? "Starting the camera…"}</p>
					</div>
				) : (
					<div className="scanner__reticle" aria-hidden="true" />
				)}
				<button className="scanner__close icon-btn" onClick={onClose} aria-label="Close scanner">
					<CloseIcon width={20} height={20} />
				</button>
				<div className="scanner__hint">Point the camera at an item barcode</div>
			</div>

			<div className="scanner__manual">
				<form
					className="scanner__form"
					onSubmit={(event) => {
						event.preventDefault();
						const value = manual.trim();
						if (value) onResult(value);
					}}
				>
					<TextInput
						value={manual}
						onChange={(event) => setManual(event.target.value)}
						placeholder="Or type a barcode / item code"
						inputMode="text"
						autoComplete="off"
						aria-label="Barcode or item code"
					/>
					<Button type="submit" variant="secondary" disabled={!manual.trim()}>
						Look up
					</Button>
				</form>
			</div>
		</div>
	);
}
