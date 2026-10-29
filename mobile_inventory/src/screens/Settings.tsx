import { useState } from "react";
import { CloudIcon, RefreshIcon, TrashIcon } from "../components/icons";
import { Button, Field, Pill, Row, Rows, Select } from "../components/ui";
import type { Connection, Session } from "../lib/types";

export function SettingsScreen({
	session,
	connection,
	pending,
	syncing,
	onSync,
	onDefaultWarehouse,
	onClearLocal,
	onDisconnect,
}: {
	session: Session;
	connection: Connection | null;
	pending: number;
	syncing: boolean;
	onSync: () => void;
	onDefaultWarehouse: (warehouse: string) => void;
	onClearLocal: () => Promise<void> | void;
	onDisconnect: () => void;
}) {
	const [confirming, setConfirming] = useState(false);

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
