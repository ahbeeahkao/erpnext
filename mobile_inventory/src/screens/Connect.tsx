import { useState } from "react";
import { AlertIcon, BoxIcon } from "../components/icons";
import { Button, Field, TextInput } from "../components/ui";
import { ApiError } from "../lib/errors";
import { createClient } from "../lib/client";
import { normalizeBaseUrl, saveSession } from "../lib/settings";
import type { Connection, Session } from "../lib/types";

type Mode = "demo" | "site" | "token";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
	{ id: "demo", label: "Demo", hint: "Explore with sample data" },
	{ id: "site", label: "This site", hint: "Served from ERPNext" },
	{ id: "token", label: "API key", hint: "Standalone hosting" },
];

export function Connect({
	initial,
	notice,
	onConnected,
}: {
	initial?: Session | null;
	notice?: string | null;
	onConnected: (session: Session, connection: Connection) => void;
}) {
	const [mode, setMode] = useState<Mode>(
		initial?.mode === "token" ? "token" : initial?.mode === "site" ? "site" : "demo"
	);
	const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
	const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
	const [apiSecret, setApiSecret] = useState(initial?.apiSecret ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const origin = typeof window === "undefined" ? "" : window.location.origin;

	async function connect() {
		setError(null);
		setBusy(true);
		try {
			const session: Session =
				mode === "demo"
					? { mode: "demo", demo: true }
					: mode === "site"
					? { mode: "site" }
					: {
							mode: "token",
							baseUrl: normalizeBaseUrl(baseUrl),
							apiKey: apiKey.trim(),
							apiSecret: apiSecret.trim(),
					  };

			if (mode === "token" && (!session.baseUrl || !session.apiKey || !session.apiSecret)) {
				throw new ApiError("Site URL, API key and API secret are all required", "validation");
			}

			const client = createClient(session);
			const connection = await client.connect();
			const merged: Session = {
				...session,
				user: connection.user,
				company: session.company ?? connection.company,
			};
			await saveSession(merged);
			onConnected(merged, connection);
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : "Could not connect to the site");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="connect">
			<div className="connect__hero">
				<div className="connect__logo" aria-hidden="true">
					<BoxIcon width={30} height={30} />
				</div>
				<h1>Inventory</h1>
				<p className="muted">Scan, move and count stock in ERPNext — even without a signal.</p>
			</div>

			<div className="segmented" role="tablist" aria-label="Connection mode">
				{MODES.map((entry) => (
					<button
						key={entry.id}
						role="tab"
						aria-selected={mode === entry.id}
						className={`segmented__item${mode === entry.id ? " is-active" : ""}`}
						onClick={() => {
							setMode(entry.id);
							setError(null);
						}}
					>
						<span>{entry.label}</span>
						<small>{entry.hint}</small>
					</button>
				))}
			</div>

			{mode === "demo" ? (
				<p className="note">
					Runs entirely on this device with sample warehouses and items. Perfect for trying the flow
					before pointing the app at a live site.
				</p>
			) : mode === "site" ? (
				<p className="note">
					Use this when the app is opened from your ERPNext site (for example{" "}
					<code>{origin}/inventory</code>). Sign-in and CSRF come from the existing session.
				</p>
			) : (
				<div className="stack">
					<Field label="Site URL" hint="For example https://erp.example.com">
						<TextInput
							value={baseUrl}
							onChange={(event) => setBaseUrl(event.target.value)}
							placeholder="https://erp.example.com"
							inputMode="url"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
						/>
					</Field>
					<Field label="API key">
						<TextInput
							value={apiKey}
							onChange={(event) => setApiKey(event.target.value)}
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
						/>
					</Field>
					<Field label="API secret" hint="User → API Access → Generate Keys">
						<TextInput
							type="password"
							value={apiSecret}
							onChange={(event) => setApiSecret(event.target.value)}
							autoComplete="off"
						/>
					</Field>
				</div>
			)}

			{notice ? (
				<div className="banner banner--warn">
					<AlertIcon width={18} height={18} />
					<span>{notice}</span>
				</div>
			) : null}

			{error ? (
				<div className="banner banner--error" role="alert">
					<AlertIcon width={18} height={18} />
					<span>{error}</span>
				</div>
			) : null}

			<Button block loading={busy} onClick={() => void connect()}>
				{mode === "demo" ? "Open the demo" : "Connect"}
			</Button>

			<p className="footnote">
				Keys are stored in this browser only (IndexedDB). For production, serve the app from the
				ERPNext site so the session cookie is used instead of long-lived keys.
			</p>
		</div>
	);
}
