// ERPNext/Frappe error normalisation.
//
// Frappe returns errors as HTTP 4xx/5xx with a body shaped like:
//   { exception: "frappe.exceptions.ValidationError: ...", exc_type: "...",
//     _server_messages: "[\"{\\\"message\\\": \\\"Item X is not in stock\\\"}\"]" }
// Messages often contain HTML, so they are flattened to plain text for the UI.

export type ErrorKind = "network" | "auth" | "permission" | "validation" | "conflict" | "server";

export class ApiError extends Error {
	readonly kind: ErrorKind;
	readonly status: number;

	constructor(message: string, kind: ErrorKind, status = 0) {
		super(message);
		this.name = "ApiError";
		this.kind = kind;
		this.status = status;
	}
}

export function stripHtml(value: string): string {
	return value
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<\/(p|div|li)>/gi, " ")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

export function classifyStatus(status: number): ErrorKind {
	if (status === 401) return "auth";
	if (status === 403) return "permission";
	if (status === 409) return "conflict";
	if (status === 417 || status === 400 || status === 422) return "validation";
	return "server";
}

/** Extracts the most useful human message out of a Frappe error body. */
export function serverMessage(body: unknown): string | null {
	if (!body) return null;
	if (typeof body === "string") return stripHtml(body).slice(0, 400) || null;

	const data = body as Record<string, unknown>;

	const rawMessages = data._server_messages;
	if (typeof rawMessages === "string" && rawMessages.trim()) {
		try {
			const list = JSON.parse(rawMessages) as unknown;
			if (Array.isArray(list)) {
				const messages = list
					.map((entry) => {
						if (typeof entry === "string") {
							try {
								const parsed = JSON.parse(entry) as { message?: string };
								return parsed.message ?? entry;
							} catch {
								return entry;
							}
						}
						if (entry && typeof entry === "object") {
							return (entry as { message?: string }).message ?? null;
						}
						return null;
					})
					.filter((message): message is string => Boolean(message))
					.map(stripHtml)
					.filter(Boolean);
				if (messages.length) return messages.join(" · ").slice(0, 400);
			}
		} catch {
			// fall through to the other fields
		}
	}

	if (typeof data.message === "string" && data.message.trim()) return stripHtml(data.message).slice(0, 400);

	if (typeof data.exception === "string" && data.exception.trim()) {
		const line = data.exception.split("\n").filter(Boolean).pop() ?? data.exception;
		// Drop the "frappe.exceptions.ValidationError:" prefix — the message is what matters.
		return stripHtml(line.replace(/^[\w.]*(?:Exception|Error):\s*/, "")).slice(0, 400);
	}

	return null;
}

export function toApiError(status: number, body: unknown): ApiError {
	const message = serverMessage(body) ?? `Request failed (${status})`;
	return new ApiError(message, classifyStatus(status), status);
}
