import type { IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";

interface DetectorResult {
	rawValue: string;
}
interface DetectorLike {
	detect(source: HTMLVideoElement): Promise<DetectorResult[]>;
}
type DetectorCtor = new (options?: { formats?: string[] }) => DetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

function detectorCtor(): DetectorCtor | undefined {
	return (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
}

export interface Scanner {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	active: boolean;
	error: string | null;
	start: () => Promise<void>;
	stop: () => void;
}

/**
 * Camera barcode scanning.
 * Uses the native BarcodeDetector where available (Chrome/Android) and falls back to ZXing
 * (iOS Safari and desktop). Results are de-duplicated for a second so a steady camera does not
 * fire the same code repeatedly.
 */
export function useScanner(onResult: (value: string) => void): Scanner {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const controlsRef = useRef<IScannerControls | null>(null);
	const rafRef = useRef<number | null>(null);
	const lastHitRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
	const activeRef = useRef(false);
	const callbackRef = useRef(onResult);
	const [active, setActive] = useState(false);
	const [error, setError] = useState<string | null>(null);

	callbackRef.current = onResult;

	const emit = useCallback((value: string) => {
		const now = Date.now();
		if (lastHitRef.current.value === value && now - lastHitRef.current.at < 1200) return;
		lastHitRef.current = { value, at: now };
		callbackRef.current(value);
	}, []);

	const stop = useCallback(() => {
		activeRef.current = false;
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		controlsRef.current?.stop();
		controlsRef.current = null;
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
		setActive(false);
	}, []);

	const start = useCallback(async () => {
		setError(null);
		if (!navigator.mediaDevices?.getUserMedia) {
			setError("This browser cannot use the camera. Type the code instead.");
			return;
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
				audio: false,
			});
			streamRef.current = stream;
			const video = videoRef.current;
			if (!video) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			video.srcObject = stream;
			video.setAttribute("playsinline", "true");
			await video.play().catch(() => undefined);

			activeRef.current = true;
			setActive(true);

			const Ctor = detectorCtor();
			if (Ctor) {
				const detector = new Ctor({ formats: FORMATS });
				const tick = async () => {
					if (!activeRef.current || !videoRef.current) return;
					try {
						const results = await detector.detect(videoRef.current);
						const value = results[0]?.rawValue;
						if (value) emit(value);
					} catch {
						// transient detector errors are normal while the camera warms up
					}
					if (activeRef.current) rafRef.current = requestAnimationFrame(tick);
				};
				rafRef.current = requestAnimationFrame(tick);
			} else {
				// Loaded on demand: only browsers without BarcodeDetector pay for ZXing.
				const { BrowserMultiFormatReader } = await import("@zxing/browser");
				const reader = new BrowserMultiFormatReader();
				controlsRef.current = await reader.decodeFromVideoElement(video, (result) => {
					if (result) emit(result.getText());
				});
			}
		} catch (caught) {
			const message =
				caught instanceof DOMException && caught.name === "NotAllowedError"
					? "Camera permission was denied. Type the code instead."
					: "Could not start the camera. Type the code instead.";
			setError(message);
			stop();
		}
	}, [emit, stop]);

	useEffect(() => stop, [stop]);

	return { videoRef, active, error, start, stop };
}
