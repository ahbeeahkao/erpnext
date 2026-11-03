// Identifiers for queued documents.

/**
 * The id on a queue entry doubles as the idempotency marker in the document remarks, so it has to be
 * unique per capture even when two phones are working the same shelf.
 */
export function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
