// Talking to a print bridge on the shop network.
//
// The browser cannot open a TCP socket to a printer, but it can POST to a tiny helper running on a
// PC or a Raspberry Pi beside the printer (any of the usual "raw 9100" bridges do). This module
// owns the URL rules and the failure wording, so the screen only has to show a message.

export const BRIDGE_TIMEOUT_MS = 8000;

/**
 * Accepts what people actually type ("192.168.1.31:9101", "printbridge.local/print") and returns
 * something fetchable. An empty string means "no bridge configured".
 */
export function normalizeBridge(url: string): string {
	const trimmed = url.trim();
	if (!trimmed) return "";
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
	return withScheme.replace(/\/+$/, "");
}

export function bridgeRequest(url: string, zpl: string): { url: string; init: RequestInit } {
	return {
		url: normalizeBridge(url),
		init: {
			method: "POST",
			headers: { "Content-Type": "text/plain;charset=UTF-8" },
			body: zpl,
		},
	};
}

/**
 * Sends the whole sheet as one job. Bridges answer in whatever shape they like, so the status code
 * is the only thing trusted here.
 */
export async function sendLabelsToBridge(url: string, zpl: string): Promise<void> {
	const target = normalizeBridge(url);
	if (!target) throw new Error("No print bridge is set up. Add its address in Settings.");

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
	try {
		const request = bridgeRequest(target, zpl);
		const response = await fetch(request.url, { ...request.init, signal: controller.signal });
		if (!response.ok) {
			throw new Error(`The print bridge refused the job (HTTP ${response.status}).`);
		}
	} catch (error) {
		throw new Error(bridgeFailure(error));
	} finally {
		clearTimeout(timer);
	}
}

/** A shop-floor sentence for a stack trace nobody on the floor can read. */
export function bridgeFailure(error: unknown): string {
	if (error instanceof Error && error.name === "AbortError") {
		return "The print bridge did not answer. Is it running?";
	}
	if (error instanceof Error && /HTTP \d+/.test(error.message)) return error.message;
	return "Could not reach the print bridge. Check the address, that the phone is on the same network, and that the bridge allows this origin.";
}
