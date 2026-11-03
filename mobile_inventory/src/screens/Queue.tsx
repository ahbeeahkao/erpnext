import { useState } from "react";
import { QueueIcon, RefreshIcon, TrashIcon, WifiOffIcon } from "../components/icons";
import { Button, EmptyState, Pill, Rows } from "../components/ui";
import { relativeTime } from "../lib/format";
import { describeOp } from "../lib/payloads";
import type { QueueOp } from "../lib/types";

const STATUS: Record<
	QueueOp["status"],
	{ label: string; tone: "neutral" | "success" | "warn" | "danger" | "info" }
> = {
	pending: { label: "Waiting", tone: "warn" },
	syncing: { label: "Syncing", tone: "info" },
	error: { label: "Needs attention", tone: "danger" },
	done: { label: "Posted", tone: "success" },
};

export function QueueScreen({
	ops,
	pending,
	syncing,
	online,
	onSync,
	onRetry,
	onRemove,
}: {
	ops: QueueOp[];
	pending: number;
	syncing: boolean;
	online: boolean;
	onSync: () => void;
	onRetry: (op: QueueOp) => void;
	onRemove: (op: QueueOp) => void;
}) {
	const [openId, setOpenId] = useState<string | null>(null);
	const unfinished = ops.filter((op) => op.status !== "done");
	const finished = ops.filter((op) => op.status === "done");

	return (
		<div className="screen">
			<header className="screen__header">
				<div>
					<p className="eyebrow">{pending ? `${pending} waiting` : "All clear"}</p>
					<h1>Pending sync</h1>
				</div>
				<Button variant="secondary" onClick={onSync} loading={syncing} disabled={!online || !pending}>
					<RefreshIcon width={16} height={16} /> Sync
				</Button>
			</header>

			{!online ? (
				<div className="banner banner--warn">
					<WifiOffIcon width={18} height={18} />
					<span>Offline. Queued transactions will sync when the connection returns.</span>
				</div>
			) : null}

			{unfinished.length ? (
				<section className="section">
					<h2 className="section__title">Waiting to post</h2>
					<Rows>
						{unfinished.map((op) => {
							const status = STATUS[op.status];
							return (
								<div className="row row--stack" key={op.id}>
									<div className="row__body">
										<div className="row__title">
											{describeOp(op)} <Pill tone={status.tone}>{status.label}</Pill>
										</div>
										<div className="row__subtitle">
											{op.summary.fromWarehouse ? `${op.summary.fromWarehouse} → ` : ""}
											{op.summary.toWarehouse ?? op.summary.warehouse ?? ""}
										</div>
										<div className="row__subtitle">
											{relativeTime(op.createdAt)} · {op.attempts} attempt
											{op.attempts === 1 ? "" : "s"}
										</div>
										{op.error ? <div className="row__error">{op.error}</div> : null}
										<button
											type="button"
											className="link-btn"
											onClick={() => setOpenId(openId === op.id ? null : op.id)}
											aria-expanded={openId === op.id}
										>
											{openId === op.id ? "Hide what will be posted" : "What will be posted?"}
										</button>
										{openId === op.id ? <OpDetail op={op} /> : null}
									</div>
									<div className="row__actions">
										<Button
											variant="ghost"
											onClick={() => onRetry(op)}
											disabled={syncing}
										>
											<RefreshIcon width={16} height={16} /> Retry
										</Button>
										<Button
											variant="ghost"
											onClick={() => onRemove(op)}
											aria-label="Delete"
										>
											<TrashIcon width={16} height={16} />
										</Button>
									</div>
								</div>
							);
						})}
					</Rows>
				</section>
			) : (
				<EmptyState
					title="Nothing waiting"
					hint="Transactions you save offline appear here until they are posted."
					icon={<QueueIcon width={26} height={26} />}
				/>
			)}

			{finished.length ? (
				<section className="section">
					<h2 className="section__title">Recently posted</h2>
					<Rows>
						{finished.map((op) => (
							<div className="row row--stack" key={op.id}>
								<div className="row__body">
									<div className="row__title">
										{describeOp(op)} <Pill tone="success">Posted</Pill>
									</div>
									<div className="row__subtitle">
										{op.serverName ?? "posted"} · {relativeTime(op.createdAt)}
									</div>
									<button
										type="button"
										className="link-btn"
										onClick={() => setOpenId(openId === op.id ? null : op.id)}
										aria-expanded={openId === op.id}
									>
										{openId === op.id ? "Hide what was posted" : "What was posted?"}
									</button>
									{openId === op.id ? <OpDetail op={op} /> : null}
								</div>
							</div>
						))}
					</Rows>
				</section>
			) : null}
		</div>
	);
}

/** The document the phone is holding, in the words of the person chasing it. */
function OpDetail({ op }: { op: QueueOp }) {
	const doc = op.doc;
	const rows = Array.isArray(doc.items) ? (doc.items as Array<Record<string, unknown>>) : [];
	const value = (key: string) => {
		const raw = doc[key];
		return raw === undefined || raw === null || raw === "" ? "—" : String(raw);
	};

	return (
		<div className="panel">
			<div className="kv">
				<span>Document</span>
				<span>{value("doctype")}</span>
				<span>Posting date</span>
				<span>
					{value("posting_date")} {doc.posting_time ? String(doc.posting_time) : ""}
				</span>
				<span>Company</span>
				<span>{value("company")}</span>
				{doc.supplier ? (
					<>
						<span>Supplier</span>
						<span>{String(doc.supplier)}</span>
					</>
				) : null}
				{doc.customer ? (
					<>
						<span>Customer</span>
						<span>{String(doc.customer)}</span>
					</>
				) : null}
				{doc.work_order ? (
					<>
						<span>Work order</span>
						<span>{String(doc.work_order)}</span>
					</>
				) : null}
				<span>Reference</span>
				<span className="mono">{op.serverName ?? op.id.slice(0, 8)}</span>
			</div>

			{rows.length ? (
				<table className="kv-table">
					<thead>
						<tr>
							<th>Item</th>
							<th>Qty</th>
							<th>From</th>
							<th>To</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row, index) => (
							<tr key={`${String(row.item_code)}-${index}`}>
								<td>
									{String(row.item_code)}
									{row.batch_no ? <small> · {String(row.batch_no)}</small> : null}
									{row.location ? <small> · {String(row.location)}</small> : null}
								</td>
								<td>
									{String(row.qty)} {String(row.uom ?? "")}
									{row.rejected_qty ? (
										<small> · {String(row.rejected_qty)} rejected</small>
									) : null}
								</td>
								<td>{row.s_warehouse ? String(row.s_warehouse) : String(row.warehouse ?? "—")}</td>
								<td>{row.t_warehouse ? String(row.t_warehouse) : "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			<p className="muted">
				{op.submit === false
					? "Created as a draft on the site; dispatch submits it."
					: "Submitted as soon as the connection allows."}
			</p>
		</div>
	);
}
