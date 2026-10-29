import { useEffect, useMemo, useState } from "react";
import { AlertIcon, BackIcon, CloudIcon, InIcon, OutIcon, SwapIcon } from "../components/icons";
import { Button, Field, Pill, Select, TextInput } from "../components/ui";
import { ApiError } from "../lib/errors";
import { formatQty, shortWarehouse } from "../lib/format";
import { MOVE_LABEL, buildStockEntryDoc, validateMove } from "../lib/payloads";
import { todayIso } from "../lib/settings";
import type {
	InventoryClient,
	ItemInfo,
	MoveInput,
	MoveKind,
	QueueOp,
	Session,
	StockRow,
	Warehouse,
} from "../lib/types";
import type { Notify } from "../hooks/useToasts";

const QUICK_QTY = [1, 5, 10, 25];

const COPY: Record<MoveKind, { title: string; hint: string; icon: typeof InIcon }> = {
	receipt: { title: "Receive stock", hint: "Stock coming in from a supplier or production", icon: InIcon },
	issue: { title: "Issue stock", hint: "Stock leaving for consumption, samples or scrap", icon: OutIcon },
	transfer: { title: "Transfer stock", hint: "Move stock between two warehouses", icon: SwapIcon },
};

export function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function MoveScreen({
	client,
	session,
	item,
	kind,
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
	kind: MoveKind;
	warehouses: Warehouse[];
	online: boolean;
	defaultWarehouse?: string;
	onBack: () => void;
	onQueued: (op: QueueOp) => Promise<void> | void;
	onPosted: () => void;
	notify: Notify;
}) {
	const copy = COPY[kind];
	const Icon = copy.icon;
	const uom = item.stock_uom ?? "Nos";
	const options = warehouses.map((warehouse) => warehouse.name);
	const fallback = defaultWarehouse ?? options[0] ?? "";

	const [qty, setQty] = useState("1");
	const [fromWarehouse, setFromWarehouse] = useState(
		kind === "issue" || kind === "transfer" ? fallback : ""
	);
	const [toWarehouse, setToWarehouse] = useState(
		kind === "receipt" ? fallback : options.find((name) => name !== fallback) ?? ""
	);
	const [batch, setBatch] = useState("");
	const [serial, setSerial] = useState("");
	const [rate, setRate] = useState("");
	const [zeroValue, setZeroValue] = useState(false);
	const [note, setNote] = useState("");
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [stock, setStock] = useState<StockRow[]>([]);

	useEffect(() => {
		client
			.stockFor(item.item_code)
			.then(setStock)
			.catch(() => setStock([]));
	}, [client, item.item_code]);

	const available = useMemo(() => {
		const source = kind === "receipt" ? toWarehouse : fromWarehouse;
		return stock.find((row) => row.warehouse === source)?.actual_qty ?? 0;
	}, [fromWarehouse, kind, stock, toWarehouse]);

	function buildInput(): MoveInput {
		return {
			id: newId(),
			kind,
			itemCode: item.item_code,
			qty: Number(qty),
			uom,
			fromWarehouse: kind === "receipt" ? undefined : fromWarehouse,
			toWarehouse: kind === "issue" ? undefined : toWarehouse,
			rate: rate ? Number(rate) : null,
			zeroValuation: zeroValue,
			batchNo: batch.trim() || undefined,
			serialNo: serial.trim() || undefined,
			note: note.trim() || undefined,
		};
	}

	function toOp(input: MoveInput, doc: Record<string, unknown>): QueueOp {
		return {
			id: input.id,
			kind,
			createdAt: new Date().toISOString(),
			status: "pending",
			attempts: 0,
			doc,
			summary: {
				kind,
				itemCode: item.item_code,
				itemName: item.item_name,
				qty: input.qty,
				uom,
				fromWarehouse: input.fromWarehouse,
				toWarehouse: input.toWarehouse,
			},
			demo: session.mode === "demo",
		};
	}

	async function queue(input: MoveInput, doc: Record<string, unknown>, message: string) {
		await onQueued(toOp(input, doc));
		notify(message, "info");
		onPosted();
	}

	async function submit() {
		const input = buildInput();
		const problems = validateMove(input, item);
		if (problems.length) {
			setErrors(problems);
			return;
		}
		setErrors([]);
		setBusy(true);
		const doc = buildStockEntryDoc(input, {
			company: session.company ?? "",
			postingDate: todayIso(),
		});

		try {
			if (!online) {
				await queue(input, doc, "Offline — saved and will sync automatically");
				return;
			}
			const created = await client.createDoc(doc);
			const submitted = await client.submitDoc({ ...doc, name: created.name });
			notify(`${MOVE_LABEL[kind]} posted as ${submitted.name}`, "success");
			onPosted();
		} catch (error) {
			if (error instanceof ApiError && error.kind === "network") {
				await queue(input, doc, "Connection lost — saved and will sync automatically");
				return;
			}
			setErrors([error instanceof ApiError ? error.message : "Could not post this transaction"]);
		} finally {
			setBusy(false);
		}
	}

	async function queueOnly() {
		const input = buildInput();
		const problems = validateMove(input, item);
		if (problems.length) {
			setErrors(problems);
			return;
		}
		setErrors([]);
		const doc = buildStockEntryDoc(input, { company: session.company ?? "", postingDate: todayIso() });
		await queue(input, doc, "Queued on this device");
	}

	return (
		<div className="screen">
			<header className="screen__header screen__header--back">
				<button className="icon-btn" onClick={onBack} aria-label="Back">
					<BackIcon width={22} height={22} />
				</button>
				<div className="screen__header-body">
					<p className="eyebrow">{item.item_code}</p>
					<h1>{copy.title}</h1>
				</div>
				<Icon width={24} height={24} className="header__glyph" />
			</header>

			<p className="note">{copy.hint}</p>

			<div className="qty-card">
				<label className="qty-card__label" htmlFor="qty">
					Quantity ({uom})
				</label>
				<input
					id="qty"
					className="qty-input"
					value={qty}
					onChange={(event) => setQty(event.target.value.replace(/[^0-9.]/g, ""))}
					inputMode="decimal"
					autoComplete="off"
				/>
				<div className="chips chips--tight">
					{QUICK_QTY.map((value) => (
						<button
							key={value}
							type="button"
							className="chip chip--sm"
							onClick={() => setQty(String(value))}
						>
							+{value}
						</button>
					))}
					<button
						type="button"
						className="chip chip--sm"
						onClick={() => setQty(String(Number(qty) || 0))}
					>
						clear
					</button>
				</div>
				{kind !== "receipt" ? (
					<p className="muted qty-card__hint">
						Available in {shortWarehouse(fromWarehouse) || "source"}:{" "}
						<strong>{formatQty(available, uom)}</strong>
					</p>
				) : null}
			</div>

			<div className="stack">
				{kind !== "receipt" ? (
					<Field label={kind === "transfer" ? "From warehouse" : "Issue from"}>
						<Select
							value={fromWarehouse}
							onChange={(event) => setFromWarehouse(event.target.value)}
						>
							<option value="">Select warehouse…</option>
							{options.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</Select>
					</Field>
				) : null}

				{kind !== "issue" ? (
					<Field label={kind === "transfer" ? "To warehouse" : "Receive into"}>
						<Select value={toWarehouse} onChange={(event) => setToWarehouse(event.target.value)}>
							<option value="">Select warehouse…</option>
							{options
								.filter((name) => kind !== "transfer" || name !== fromWarehouse)
								.map((name) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
						</Select>
					</Field>
				) : null}

				{item.has_batch_no ? (
					<Field label="Batch number" hint="Scanned or typed; batches are created by ERPNext rules">
						<TextInput
							value={batch}
							onChange={(event) => setBatch(event.target.value)}
							placeholder="e.g. BATCH-2026-001"
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
						/>
					</Field>
				) : null}

				{item.has_serial_no ? (
					<Field label="Serial numbers" hint={`One per unit — you entered ${Number(qty) || 0}`}>
						<textarea
							className="input textarea"
							value={serial}
							onChange={(event) => setSerial(event.target.value)}
							placeholder="SN-0001&#10;SN-0002"
							rows={3}
							spellCheck={false}
						/>
					</Field>
				) : null}

				{kind === "receipt" ? (
					<>
						<Field label="Unit cost" hint="Leave empty only for free/zero-value receipts">
							<TextInput
								value={rate}
								onChange={(event) => setRate(event.target.value.replace(/[^0-9.]/g, ""))}
								inputMode="decimal"
								placeholder="0.00"
								disabled={zeroValue}
							/>
						</Field>
						<label className="toggle">
							<input
								type="checkbox"
								checked={zeroValue}
								onChange={(event) => setZeroValue(event.target.checked)}
							/>
							<span>
								Zero value receipt <small>posts with no stock value</small>
							</span>
						</label>
					</>
				) : null}

				<Field label="Note" hint="Optional — appears in the document remarks">
					<TextInput
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="e.g. GRN 8821, damaged on arrival"
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
				<Button block loading={busy} onClick={() => void submit()}>
					{online ? `${MOVE_LABEL[kind]} now` : "Save offline"}
				</Button>
				{online ? (
					<Button block variant="secondary" onClick={() => void queueOnly()} disabled={busy}>
						Queue for later
					</Button>
				) : null}
			</div>

			<p className="footnote">
				<Pill tone="info">
					<CloudIcon width={13} height={13} />{" "}
					{session.mode === "demo" ? "Demo data" : online ? "Posts to ERPNext" : "Stored locally"}
				</Pill>{" "}
				Every transaction carries a device reference, so a retry can never post the same move twice.
			</p>
		</div>
	);
}
