import { useEffect, useState } from "react";
import { CloudIcon, RefreshIcon, TrashIcon } from "../components/icons";
import { Button, Field, Pill, Row, Rows, Select, TextInput } from "../components/ui";
import { catalogueSize } from "../lib/catalogue";
import { normalizeBridge } from "../lib/printbridge";
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, type LabelSize } from "../lib/zpl";
import type { Connection, DiagnosticCheck, Session } from "../lib/types";

export function SettingsScreen({
	session,
	connection,
	pending,
	syncing,
	onSync,
	onDefaultWarehouse,
	onLabelSize,
	onPrintBridge,
	onDiagnose,
	onClearLocal,
	onDisconnect,
}: {
	session: Session;
	connection: Connection | null;
	pending: number;
	syncing: boolean;
	onSync: () => void;
	onDefaultWarehouse: (warehouse: string) => void;
	onLabelSize: (size: LabelSize) => void;
	onPrintBridge: (url: string) => void;
	onDiagnose: () => Promise<DiagnosticCheck[]>;
	onClearLocal: () => Promise<void> | void;
	onDisconnect: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const [cached, setCached] = useState<number | null>(null);
	const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
	const [checking, setChecking] = useState(false);

	async function diagnose() {
		setChecking(true);
		try {
			setChecks(await onDiagnose());
		} catch {
			setChecks([
				{ id: "error", label: "Site check", ok: false, detail: "The check could not run." },
			]);
		} finally {
			setChecking(false);
		}
	}
	const [bridge, setBridge] = useState(session.printBridge ?? "");
	const bridgeTarget = normalizeBridge(bridge);
	const bridgeValid = !bridge.trim() || /^https?:\/\/[^\s/]+/i.test(bridgeTarget);

	// The catalogue is what makes an offline scan work; worth showing what the device holds.
	useEffect(() => {
		let live = true;
		void catalogueSize().then((size) => {
			if (live) setCached(size);
		});
		return () => {
			live = false;
		};
	}, [session]);

	const modeLabel =
		session.mode === "demo" ? "Demo (no server)" : session.mode === "token" ? "API key" : "Site session";

	return (
		<div className="screen">
			<header className="screen__header">
				<div>
					<p className="eyebrow">Settings</p>
					<h1>Connection</h1>
				</div>
			</header>

			<Rows>
				<Row
					leading={
						<span className="avatar avatar--user">
							{(connection?.user ?? "?").slice(0, 1).toUpperCase()}
						</span>
					}
					title={connection?.user ?? "Not connected"}
					subtitle={
						session.mode === "token"
							? session.baseUrl
							: session.mode === "site"
							? window.location.origin
							: "Sample data"
					}
					trailing={<Pill tone="info">{modeLabel}</Pill>}
				/>
				<Row
					title="Company"
					trailing={<strong>{connection?.company ?? session.company ?? "—"}</strong>}
				/>
				<Row
					title="Warehouses available"
					trailing={<strong>{connection?.warehouses.length ?? 0}</strong>}
				/>
			</Rows>

			<section className="section">
				<h2 className="section__title">Defaults</h2>
				<Field label="Default warehouse" hint="Pre-selected when receiving or issuing">
					<Select
						value={session.defaultWarehouse ?? ""}
						onChange={(event) => onDefaultWarehouse(event.target.value)}
					>
						<option value="">No default</option>
						{(connection?.warehouses ?? []).map((warehouse) => (
							<option key={warehouse.name} value={warehouse.name}>
								{warehouse.name}
							</option>
						))}
					</Select>
				</Field>
			</section>

			<section className="section">
				<h2 className="section__title">Labels {"&"} printing</h2>
				<Field label="Label stock" hint="The size of the roll in the printer">
					<Select
						value={session.labelSize ?? DEFAULT_LABEL_SIZE}
						onChange={(event) => onLabelSize(event.target.value as LabelSize)}
					>
						{Object.entries(LABEL_SIZES).map(([key, stock]) => (
							<option key={key} value={key}>
								{stock.label}
							</option>
						))}
					</Select>
				</Field>
				<Field
					label="Print bridge"
					hint="Optional. A helper on the shop network that forwards labels to the printer."
				>
					<TextInput
						value={bridge}
						placeholder="e.g. 192.168.1.31:9101/print"
						onChange={(event) => setBridge(event.target.value)}
						onBlur={() => onPrintBridge(bridge)}
					/>
				</Field>
				{bridge.trim() && !bridgeValid ? (
					<p className="field__hint text-warn">
						That does not look like an address. Try <code>192.168.1.31:9101</code> or{" "}
						<code>http://printbridge.local</code>.
					</p>
				) : (
					<p className="field__hint">
						With a bridge set, the label sheet gains <strong>Send to printer</strong>. Without one,
						print from the browser sheet or save the <code>.zpl</code> file.
					</p>
				)}
			</section>

			<section className="section">
				<h2 className="section__title">Is this site ready?</h2>
				<p className="field__hint">
					Read-only checks against the connected site. Run these before a pilot, not during one.
				</p>
				<Button variant="secondary" loading={checking} onClick={() => void diagnose()}>
					Check this site
				</Button>
				{checks ? (
					<Rows>
						{checks.map((check) => (
							<Row
								key={check.id}
								title={check.label}
								subtitle={check.detail}
								trailing={
									<Pill tone={check.ok ? "success" : "warn"}>{check.ok ? "OK" : "Check"}</Pill>
								}
							/>
						))}
					</Rows>
				) : null}
			</section>

			<section className="section">
				<h2 className="section__title">Sync</h2>
				<Rows>
					<Row
						leading={<CloudIcon width={20} height={20} />}
						title="Pending transactions"
						subtitle={
							pending ? "These will post automatically when online" : "Everything is posted"
						}
						trailing={<strong>{pending}</strong>}
					/>
					<Row
						leading={<RefreshIcon width={20} height={20} />}
						title="Items cached on this device"
						subtitle="Scans and searches keep working offline for these items"
						trailing={<strong>{cached ?? "—"}</strong>}
					/>
					<Row
						leading={<RefreshIcon width={20} height={20} />}
						title="Sync now"
						subtitle="Post queued transactions immediately"
						trailing={
							<Button
								variant="secondary"
								loading={syncing}
								onClick={onSync}
								disabled={!pending}
							>
								Sync
							</Button>
						}
					/>
				</Rows>
			</section>

			<section className="section">
				<h2 className="section__title">This device</h2>
				<Rows>
					<Row
						leading={<TrashIcon width={20} height={20} />}
						title="Clear local data"
						subtitle="Removes the queue, cached warehouses and recent items"
						trailing={
							confirming ? (
								<Button
									variant="danger"
									onClick={() => {
										void onClearLocal();
										setConfirming(false);
									}}
								>
									Confirm
								</Button>
							) : (
								<Button variant="secondary" onClick={() => setConfirming(true)}>
									Clear
								</Button>
							)
						}
					/>
				</Rows>
				<Button block variant="ghost" onClick={onDisconnect}>
					Disconnect
				</Button>
			</section>

			<section className="section">
				<h2 className="section__title">About</h2>
				<Rows>
					<Row title="Version" trailing={<strong>0.1.0</strong>} />
					<Row title="Design" subtitle="Offline-first · ERPNext REST API · installable PWA" />
					<Row
						title="Documents used"
						subtitle="Stock Entry (Receipt / Issue / Transfer) and Stock Reconciliation"
					/>
				</Rows>
				<p className="footnote">
					The app never stores stock balances; each screen reads live data (or the last known queue)
					so the desk and the phone always agree.
				</p>
			</section>
		</div>
	);
}
