// Transfer stock: one item, two warehouses, no document behind it.
//
// This is what is left of the old "move" screen, which also offered receipt and issue. Those two are
// jobs now — receiving starts from the purchase order and issuing from the warehouse — because a
// screen that asks you to pick a Stock Entry purpose is the Desk with smaller buttons. A bare
// transfer has no delivery, no work order and no order line to start from, so it keeps a form.
import { useEffect, useMemo, useState } from "react";
import { AlertIcon, BackIcon, CloudIcon, SwapIcon } from "../components/icons";
import { Button, Field, Pill, Select, TextInput } from "../components/ui";
import type { Notify } from "../hooks/useToasts";
import { ApiError } from "../lib/errors";
import { formatQty, nowTime, shortWarehouse } from "../lib/format";
import { newId } from "../lib/ids";
import { MOVE_ENTRY_TYPE, buildStockEntryDoc, validateMove } from "../lib/payloads";
import { todayIso } from "../lib/settings";
import type { InventoryClient, ItemInfo, MoveInput, QueueOp, Session, StockRow, Warehouse } from "../lib/types";

const QUICK_QTY = [1, 5, 10, 25];

export function TransferScreen({
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
	// Captured when the screen opens: a transfer posted tonight for yesterday keeps yesterday's date.
	const stamp = useMemo(() => ({ date: todayIso(), time: nowTime() }), []);
	const uom = item.stock_uom ?? "Nos";
	const options = warehouses.map((warehouse) => warehouse.name);
	const fallback = defaultWarehouse ?? options[0] ?? "";

	const [qty, setQty] = useState("1");
	const [fromWarehouse, setFromWarehouse] = useState(fallback);
	const [toWarehouse, setToWarehouse] = useState(options.find((name) => name !== fallback) ?? "");
	const [batch, setBatch] = useState("");
	const [serial, setSerial] = useState("");
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

	const available = useMemo(
		() => stock.find((row) => row.warehouse === fromWarehouse)?.actual_qty ?? 0,
		[stock, fromWarehouse]
	);

	function buildInput(): MoveInput {
		return {
			id: newId(),
			itemCode: item.item_code,
			qty: Number(qty),
			uom,
			fromWarehouse,
			toWarehouse,
			batchNo: batch.trim() || undefined,
			serialNo: serial.trim() || undefined,
			note: note.trim() || undefined,
		};
	}

	function toOp(input: MoveInput, doc: Record<string, unknown>): QueueOp {
		return {
			id: input.id,
			kind: "transfer",
			createdAt: new Date().toISOString(),
			status: "pending",
			attempts: 0,
			doc,
			summary: {
				kind: "transfer",
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
			postingDate: stamp.date,
			postingTime: stamp.time,
		});

		try {
			if (!online) {
				await queue(input, doc, "Offline — saved and will sync automatically");
				return;
			}
			const created = await client.createDoc(doc);
			const submitted = await client.submitDoc({ ...doc, name: created.name });
			notify(`${MOVE_ENTRY_TYPE} posted as ${submitted.name}`, "success");
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
		const doc = buildStockEntryDoc(input, {
			company: session.company ?? "",
			postingDate: stamp.date,
			postingTime: stamp.time,
		});
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
					<h1>Transfer stock</h1>
				</div>
				<SwapIcon width={24} height={24} className="header__glyph" />
			</header>

			<p className="note">Move stock between two warehouses. Nothing arrives from outside.</p>

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
				</div>
				<p className="muted qty-card__hint">
					Available in {shortWarehouse(fromWarehouse) || "source"}:{" "}
					<strong>{formatQty(available, uom)}</strong>
				</p>
			</div>

			<div className="stack">
				<Field label="From warehouse">
					<Select value={fromWarehouse} onChange={(event) => setFromWarehouse(event.target.value)}>
						<option value="">Select warehouse…</option>
						{options.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</Select>
				</Field>

				<Field label="To warehouse">
					<Select value={toWarehouse} onChange={(event) => setToWarehouse(event.target.value)}>
						<option value="">Select warehouse…</option>
						{options
							.filter((name) => name !== fromWarehouse)
							.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
					</Select>
				</Field>

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

				<Field label="Note" hint="Optional — appears in the document remarks">
					<TextInput
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="e.g. for the packing line"
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
					{online ? "Transfer now" : "Save offline"}
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
