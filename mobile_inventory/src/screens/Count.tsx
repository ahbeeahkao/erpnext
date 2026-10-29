import { useEffect, useMemo, useState } from "react";
import { AlertIcon, BackIcon, CountIcon } from "../components/icons";
import { Button, Field, Select, TextInput } from "../components/ui";
import { ApiError } from "../lib/errors";
import { formatQty } from "../lib/format";
import { buildReconciliationDoc, validateCount } from "../lib/payloads";
import { todayIso } from "../lib/settings";
import type {
	CountInput,
	InventoryClient,
	ItemInfo,
	QueueOp,
	Session,
	StockRow,
	Warehouse,
} from "../lib/types";
import type { Notify } from "../hooks/useToasts";
import { newId } from "./Move";

export function CountScreen({
	client,
	session,
	item,
	warehouses,
	online,
	defaultWarehouse,
	onBack,
	onQueued,
	onPosted,
	notify,
}: {
	client: InventoryClient;
	session: Session;
	item: ItemInfo;
	warehouses: Warehouse[];
	online: boolean;
	defaultWarehouse?: string;
	onBack: () => void;
	onQueued: (op: QueueOp) => Promise<void> | void;
	onPosted: () => void;
	notify: Notify;
}) {
	const uom = item.stock_uom ?? "Nos";
	const options = warehouses.map((warehouse) => warehouse.name);
	const [warehouse, setWarehouse] = useState(defaultWarehouse ?? options[0] ?? "");
	const [counted, setCounted] = useState("");
	const [stock, setStock] = useState<StockRow[]>([]);
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState("");

	useEffect(() => {
		client
			.stockFor(item.item_code)
			.then(setStock)
			.catch(() => setStock([]));
	}, [client, item.item_code]);

	const systemQty = useMemo(
		() => stock.find((row) => row.warehouse === warehouse)?.actual_qty ?? 0,
		[stock, warehouse]
	);
	const difference = (Number(counted) || 0) - systemQty;

	function buildInput(): CountInput {
		return {
			id: newId(),
			itemCode: item.item_code,
			qty: Number(counted),
			uom,
			warehouse,
			note: note.trim() || undefined,
		};
	}

	async function submit(queueOnly = false) {
		const input = buildInput();
		const problems = validateCount(input, item);
		if (counted === "") problems.push("Enter the counted quantity");
		if (problems.length) {
			setErrors(problems);
			return;
		}
		setErrors([]);
		setBusy(true);
		const doc = buildReconciliationDoc(input, {
			company: session.company ?? "",
			postingDate: todayIso(),
		});

		const op: QueueOp = {
			id: input.id,
			kind: "count",
			createdAt: new Date().toISOString(),
			status: "pending",
			attempts: 0,
			doc,
			summary: {
				kind: "count",
				itemCode: item.item_code,
				itemName: item.item_name,
				qty: input.qty,
				uom,
				warehouse,
				difference,
			},
			demo: session.mode === "demo",
		};

		try {
			if (queueOnly || !online) {
				await onQueued(op);
				notify(queueOnly ? "Count queued on this device" : "Offline — count saved", "info");
				onPosted();
				return;
			}
			const created = await client.createDoc(doc);
			const submitted = await client.submitDoc({ ...doc, name: created.name });
			notify(`Stock reconciled as ${submitted.name}`, "success");
			onPosted();
		} catch (error) {
			if (error instanceof ApiError && error.kind === "network") {
				await onQueued(op);
				notify("Connection lost — saved and will sync automatically", "info");
				onPosted();
				return;
			}
			setErrors([error instanceof ApiError ? error.message : "Could not post the count"]);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="screen">
			<header className="screen__header screen__header--back">
				<button className="icon-btn" onClick={onBack} aria-label="Back">
					<BackIcon width={22} height={22} />
				</button>
				<div className="screen__header-body">
					<p className="eyebrow">{item.item_code}</p>
					<h1>Count stock</h1>
				</div>
				<CountIcon width={24} height={24} className="header__glyph" />
			</header>

			<div className="stack">
				<Field label="Warehouse counted">
					<Select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>
						<option value="">Select warehouse…</option>
						{options.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</Select>
				</Field>

				<div className="stat-row">
					<div className="stat">
						<span className="muted">System</span>
						<strong>{formatQty(systemQty, uom)}</strong>
					</div>
					<div className="stat">
						<span className="muted">Counted</span>
						<strong>{counted === "" ? "—" : formatQty(Number(counted) || 0, uom)}</strong>
					</div>
					<div className="stat">
						<span className="muted">Difference</span>
						<strong
							className={
								difference < 0 ? "text-danger" : difference > 0 ? "text-success" : undefined
							}
						>
							{counted === ""
								? "—"
								: `${difference > 0 ? "+" : ""}${formatQty(difference, uom)}`}
						</strong>
					</div>
				</div>

				<Field label={`Counted quantity (${uom})`} hint="Zero is a valid count">
					<TextInput
						className="input--big"
						value={counted}
						onChange={(event) => setCounted(event.target.value.replace(/[^0-9.]/g, ""))}
						inputMode="decimal"
						placeholder="0"
						autoComplete="off"
					/>
				</Field>

				{item.has_batch_no ? (
					<p className="note">
						This item is batch-tracked. Batch-level counts are best done in the desk; this posts
						the item total for the warehouse.
					</p>
				) : null}

				<Field label="Note">
					<TextInput
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="Cycle count 12/2026"
					/>
				</Field>
			</div>

			{errors.length ? (
				<div className="banner banner--error" role="alert">
					<AlertIcon width={18} height={18} />
					<ul className="banner__list">
						{errors.map((message) => (
							<li key={message}>{message}</li>
						))}
					</ul>
				</div>
			) : null}

			<div className="actions">
				<Button block loading={busy} onClick={() => void submit(false)}>
					{online ? "Post reconciliation" : "Save offline"}
				</Button>
				{online ? (
					<Button block variant="secondary" onClick={() => void submit(true)} disabled={busy}>
						Queue for later
					</Button>
				) : null}
			</div>

			<p className="footnote">
				Counting creates a Stock Reconciliation. ERPNext ignores rows where the quantity has not
				changed, so re-sending a count is safe.
			</p>
		</div>
	);
}
