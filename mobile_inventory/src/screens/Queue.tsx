import { CheckIcon, QueueIcon, RefreshIcon, TrashIcon, WifiOffIcon } from "../components/icons";
import { Button, EmptyState, Pill, Row, Rows } from "../components/ui";
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
							<Row
								key={op.id}
								leading={<CheckIcon width={18} height={18} className="text-success" />}
								title={describeOp(op)}
								subtitle={`${op.serverName ?? "posted"} · ${relativeTime(op.createdAt)}`}
								trailing={<Pill tone="success">Posted</Pill>}
							/>
						))}
					</Rows>
				</section>
			) : null}
		</div>
	);
}
