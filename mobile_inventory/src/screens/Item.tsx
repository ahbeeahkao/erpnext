import { useEffect, useState } from "react";
import { BackIcon, CountIcon, InIcon, OutIcon, SwapIcon } from "../components/icons";
import { Pill, Row, Rows, Spinner } from "../components/ui";
import { ApiError } from "../lib/errors";
import { formatQty, shortWarehouse } from "../lib/format";
import type { InventoryClient, ItemInfo, MoveKind, StockRow } from "../lib/types";
import type { Notify } from "../hooks/useToasts";

export function ItemScreen({
	client,
	item,
	onBack,
	onMove,
	onCount,
	notify,
}: {
	client: InventoryClient;
	item: ItemInfo;
	onBack: () => void;
	onMove: (kind: MoveKind) => void;
	onCount: () => void;
	notify: Notify;
}) {
	const [stock, setStock] = useState<StockRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setStock(null);
		setError(null);
		client
			.stockFor(item.item_code)
			.then((rows) => {
				if (!cancelled) setStock(rows);
			})
			.catch((caught) => {
				if (cancelled) return;
				const message = caught instanceof ApiError ? caught.message : "Could not load stock";
				setError(message);
				notify(message, "error");
			});
		return () => {
			cancelled = true;
		};
	}, [client, item.item_code, notify]);

	const total = (stock ?? []).reduce((sum, row) => sum + (Number(row.actual_qty) || 0), 0);

	return (
		<div className="screen">
			<header className="screen__header screen__header--back">
				<button className="icon-btn" onClick={onBack} aria-label="Back">
					<BackIcon width={22} height={22} />
				</button>
				<div className="screen__header-body">
					<p className="eyebrow">{item.item_code}</p>
					<h1>{item.item_name || item.item_code}</h1>
				</div>
			</header>

			<div className="item-meta">
				<Pill tone="info">{item.stock_uom ?? "—"}</Pill>
				{item.has_batch_no ? <Pill tone="warn">Batch tracked</Pill> : null}
				{item.has_serial_no ? <Pill tone="warn">Serialised</Pill> : null}
				{item.item_group ? <Pill>{item.item_group}</Pill> : null}
			</div>

			<div className="total-card">
				<span className="muted">Total on hand</span>
				<strong className="total-card__value">{formatQty(total, item.stock_uom)}</strong>
				<span className="muted">
					across {(stock ?? []).filter((row) => row.actual_qty).length} warehouse(s)
				</span>
			</div>

			<section className="section">
				<h2 className="section__title">Stock by warehouse</h2>
				{stock === null && !error ? (
					<Spinner label="Loading stock…" />
				) : stock && stock.length ? (
					<Rows>
						{stock.map((row) => (
							<Row
								key={row.warehouse}
								title={shortWarehouse(row.warehouse)}
								subtitle={row.warehouse}
								trailing={
									<strong className={(row.actual_qty ?? 0) < 0 ? "text-danger" : undefined}>
										{formatQty(row.actual_qty, row.stock_uom ?? item.stock_uom)}
									</strong>
								}
							/>
						))}
					</Rows>
				) : (
					<p className="note">No balance recorded yet in any warehouse.</p>
				)}
			</section>

			<section className="section">
				<h2 className="section__title">What do you want to do?</h2>
				<div className="action-grid">
					<button className="action action--in" onClick={() => onMove("receipt")}>
						<InIcon width={24} height={24} />
						<span>Receive</span>
					</button>
					<button className="action action--out" onClick={() => onMove("issue")}>
						<OutIcon width={24} height={24} />
						<span>Issue</span>
					</button>
					<button className="action action--move" onClick={() => onMove("transfer")}>
						<SwapIcon width={24} height={24} />
						<span>Transfer</span>
					</button>
					<button className="action action--count" onClick={onCount}>
						<CountIcon width={24} height={24} />
						<span>Count</span>
					</button>
				</div>
			</section>
		</div>
	);
}
