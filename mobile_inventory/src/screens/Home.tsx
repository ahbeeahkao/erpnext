import { useCallback, useEffect, useRef, useState } from "react";
import { Scanner } from "../components/Scanner";
import {
	AlertIcon,
	BoxIcon,
	CloudIcon,
	QueueIcon,
	ScanIcon,
	SearchIcon,
	WifiOffIcon,
} from "../components/icons";
import { Button, EmptyState, Pill, Row, Rows, Spinner, TextInput } from "../components/ui";
import { ApiError } from "../lib/errors";
import { addRecent, loadRecent, type RecentItem } from "../lib/recent";
import { shortWarehouse } from "../lib/format";
import type { InventoryClient, ItemInfo, ScanMatch, Session } from "../lib/types";
import type { Notify } from "../hooks/useToasts";

interface HomeProps {
	client: InventoryClient;
	session: Session;
	online: boolean;
	pending: number;
	syncing: boolean;
	onSync: () => void;
	onOpenItem: (itemCode: string) => void;
	notify: Notify;
}

export function Home({ client, session, online, pending, syncing, onSync, onOpenItem, notify }: HomeProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<ItemInfo[]>([]);
	const [searching, setSearching] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [candidates, setCandidates] = useState<ScanMatch["candidates"] | null>(null);
	const [recent, setRecent] = useState<RecentItem[]>([]);
	const [resolving, setResolving] = useState(false);
	const searchSeq = useRef(0);

	useEffect(() => {
		void loadRecent().then(setRecent);
	}, []);

	const openItem = useCallback(
		async (itemCode: string, known?: Partial<ItemInfo>) => {
			setResolving(true);
			try {
				const item = known?.item_code
					? ({ ...known, item_code: itemCode } as ItemInfo)
					: await client.itemInfo(itemCode);
				setRecent(
					await addRecent({
						item_code: item.item_code,
						item_name: item.item_name,
						stock_uom: item.stock_uom,
					})
				);
				onOpenItem(item.item_code);
			} catch (error) {
				notify(error instanceof ApiError ? error.message : "Could not open that item", "error");
			} finally {
				setResolving(false);
			}
		},
		[client, notify, onOpenItem]
	);

	useEffect(() => {
		const term = query.trim();
		if (term.length < 2) {
			setResults([]);
			setSearching(false);
			return;
		}
		const seq = ++searchSeq.current;
		setSearching(true);
		const timer = window.setTimeout(async () => {
			try {
				const rows = await client.searchItems(term);
				if (seq === searchSeq.current) setResults(rows);
			} catch (error) {
				if (seq === searchSeq.current) {
					notify(error instanceof ApiError ? error.message : "Search failed", "error");
				}
			} finally {
				if (seq === searchSeq.current) setSearching(false);
			}
		}, 280);
		return () => window.clearTimeout(timer);
	}, [client, notify, query]);

	const handleScan = useCallback(
		async (value: string) => {
			setScanning(false);
			setResolving(true);
			try {
				const match = await client.scan(value);
				if (match.kind === "item" && match.item_code) {
					notify(`Scanned ${match.item_code}`);
					await openItem(match.item_code);
				} else if (match.kind === "candidates" && match.candidates?.length) {
					setCandidates(match.candidates);
				} else if (match.kind === "warehouse" && match.warehouse) {
					notify(`That is the warehouse ${match.warehouse}`, "info");
				} else {
					notify(`No item matches “${value}”`, "error");
				}
			} catch (error) {
				notify(error instanceof ApiError ? error.message : "Scan lookup failed", "error");
			} finally {
				setResolving(false);
			}
		},
		[client, notify, openItem]
	);

	const term = query.trim();
	const showSearch = term.length >= 2;

	return (
		<div className="screen">
			<header className="screen__header">
				<div>
					<p className="eyebrow">{session.company ?? "Company"}</p>
					<h1>Inventory</h1>
				</div>
				<div className="header__pills">
					{online ? (
						<Pill tone="success">
							<CloudIcon width={14} height={14} /> Online
						</Pill>
					) : (
						<Pill tone="warn">
							<WifiOffIcon width={14} height={14} /> Offline
						</Pill>
					)}
				</div>
			</header>

			{!online ? (
				<div className="banner banner--warn">
					<WifiOffIcon width={18} height={18} />
					<span>No connection. Moves are saved on the device and sync automatically.</span>
				</div>
			) : null}

			{pending > 0 ? (
				<button className="banner banner--info banner--action" onClick={onSync} disabled={syncing}>
					<QueueIcon width={18} height={18} />
					<span>
						{pending} transaction{pending === 1 ? "" : "s"} waiting to sync
					</span>
					<strong>{syncing ? "Syncing…" : "Sync now"}</strong>
				</button>
			) : null}

			<button className="scan-card" onClick={() => setScanning(true)} disabled={resolving}>
				<span className="scan-card__icon">
					<ScanIcon width={30} height={30} />
				</span>
				<span>
					<strong>{resolving ? "Looking up…" : "Scan a barcode"}</strong>
					<small>Receive, issue, transfer or count in seconds</small>
				</span>
			</button>

			<div className="search">
				<SearchIcon width={18} height={18} className="search__icon" />
				<TextInput
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search item code or name"
					aria-label="Search items"
					autoComplete="off"
				/>
			</div>

			{showSearch ? (
				<section className="section">
					<h2 className="section__title">Results</h2>
					{searching ? (
						<Spinner label="Searching…" />
					) : results.length ? (
						<Rows>
							{results.map((item) => (
								<Row
									key={item.item_code}
									leading={<span className="avatar">{item.item_code.slice(0, 2)}</span>}
									title={item.item_name || item.item_code}
									subtitle={
										<>
											{item.item_code} · {item.stock_uom}
											{item.has_batch_no ? " · batch" : ""}
											{item.has_serial_no ? " · serial" : ""}
										</>
									}
									onClick={() => void openItem(item.item_code, item)}
								/>
							))}
						</Rows>
					) : (
						<EmptyState title="Nothing found" hint={`No stock item matches “${term}”.`} />
					)}
				</section>
			) : (
				<>
					{candidates?.length ? (
						<section className="section">
							<h2 className="section__title">Choose the item</h2>
							<Rows>
								{candidates.map((candidate) => (
									<Row
										key={`${candidate.item_code}-${
											candidate.batch_no ??
											candidate.serial_no ??
											candidate.barcode ??
											""
										}`}
										leading={<BoxIcon width={20} height={20} />}
										title={candidate.item_code}
										subtitle={[candidate.barcode, candidate.batch_no, candidate.serial_no]
											.filter(Boolean)
											.join(" · ")}
										onClick={() => {
											setCandidates(null);
											void openItem(candidate.item_code);
										}}
									/>
								))}
							</Rows>
						</section>
					) : null}

					<section className="section">
						<h2 className="section__title">Recent</h2>
						{recent.length ? (
							<div className="chips">
								{recent.map((item) => (
									<button
										key={item.item_code}
										className="chip"
										onClick={() => void openItem(item.item_code)}
									>
										<span className="chip__code">{item.item_code}</span>
										<span className="chip__name">{item.item_name || item.stock_uom}</span>
									</button>
								))}
							</div>
						) : (
							<EmptyState
								title="Nothing scanned yet"
								hint="Scan a barcode or search above to get started."
								icon={<ScanIcon width={26} height={26} />}
							/>
						)}
					</section>

					{session.defaultWarehouse ? (
						<p className="footnote">
							Default warehouse: <strong>{shortWarehouse(session.defaultWarehouse)}</strong>
						</p>
					) : null}
				</>
			)}

			{scanning ? (
				<Scanner onResult={(value) => void handleScan(value)} onClose={() => setScanning(false)} />
			) : null}

			{resolving ? (
				<div className="resolving" role="status">
					<AlertIcon width={16} height={16} />
					<span>Looking up…</span>
					<Button variant="ghost" onClick={() => setResolving(false)}>
						Cancel
					</Button>
				</div>
			) : null}
		</div>
	);
}
