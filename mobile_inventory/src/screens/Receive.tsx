import { useCallback, useEffect, useRef, useState } from "react";
import { Scanner } from "../components/Scanner";
import { AlertIcon, BackIcon, CheckIcon, CloudIcon, InIcon, ScanIcon } from "../components/icons";
import { Button, EmptyState, Field, Pill, Row, Rows, Select, Spinner, TextInput } from "../components/ui";
import type { Notify } from "../hooks/useToasts";
import { ApiError } from "../lib/errors";
import { formatQty, nowTime } from "../lib/format";
import {
	applyScan,
	clearReceipt,
	createReceiptTask,
	patchLine,
	receiptProgress,
	receiptQueueOp,
	remainingToReceive,
	setLineQty,
	setLineRejected,
	toggleBlind,
	validateReceipt,
} from "../lib/receiving";
import { todayIso } from "../lib/settings";
import { applyCreatedBatch, batchText } from "../lib/taskflow";
import type {
	InventoryClient,
	PurchaseOrder,
	QueueOp,
	ReceiptLine,
	ReceiptTask,
	Session,
	Warehouse,
} from "../lib/types";
import { newId } from "./Move";

function messageOf(error: unknown): string {
	if (error instanceof ApiError) return error.message;
	if (error instanceof Error) return error.message;
	return "Something went wrong";
}

/**
 * Receiving, the way it happens on a loading bay: pick the order, scan what came off the lorry,
 * post one receipt. The document is the by-product, not the form.
 */
export function ReceiveScreen({
	client,
	session,
	warehouses,
	defaultWarehouse,
	online,
	onBack,
	onQueued,
	onPosted,
	notify,
}: {
	client: InventoryClient;
	session: Session;
	warehouses: Warehouse[];
	defaultWarehouse?: string;
	online: boolean;
	onBack: () => void;
	onQueued: (op: QueueOp) => Promise<void> | void;
	onPosted: () => void;
	notify: Notify;
}) {
	const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
	const [loadingOrders, setLoadingOrders] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [opening, setOpening] = useState<string | null>(null);
	const [task, setTask] = useState<ReceiptTask | null>(null);
	const [scan, setScan] = useState("");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [camera, setCamera] = useState(false);
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [creatingBatch, setCreatingBatch] = useState<string | null>(null);

	const scanRef = useRef<HTMLInputElement | null>(null);
	const flagsRef = useRef(new Set<string>());

	const loadOrders = useCallback(async () => {
		setLoadingOrders(true);
		setLoadError(null);
		try {
			setOrders(await client.openPurchaseOrders());
		} catch (error) {
			setLoadError(messageOf(error));
		} finally {
			setLoadingOrders(false);
		}
	}, [client]);

	useEffect(() => {
		void loadOrders();
	}, [loadOrders]);

	useEffect(() => {
		if (task) scanRef.current?.focus();
	}, [task]);

	/** Batch/serial flags come from the Item; the PO line does not carry them. */
	const ensureFlags = useCallback(
		async (code: string) => {
			if (flagsRef.current.has(code)) return;
			flagsRef.current.add(code);
			try {
				const info = await client.itemInfo(code);
				setTask((current) =>
					current
						? {
								...current,
								lines: current.lines.map((line) =>
									line.itemCode === code
										? {
												...line,
												hasBatchNo: Boolean(info.has_batch_no),
												hasSerialNo: Boolean(info.has_serial_no),
											}
										: line
								),
							}
						: current
				);
			} catch {
				// Offline: the flags stay unknown and the server validates batch/serial on submit.
				flagsRef.current.delete(code);
			}
		},
		[client]
	);

	async function openOrder(order: PurchaseOrder) {
		setOpening(order.name);
		setLoadError(null);
		try {
			const lines = await client.purchaseOrderLines(order.name);
			const fallback = order.company || session.company || "";
			const opened = createReceiptTask(
				newId(),
				{
					order: order.name,
					supplier: order.supplier,
					company: fallback,
					postingDate: todayIso(),
					postingTime: nowTime(),
				},
				lines.map((line) => ({
					...line,
					warehouse: line.warehouse || defaultWarehouse || warehouses[0]?.name,
				}))
			);
			setTask(opened);
			setExpanded(null);
			setErrors([]);
			void ensureFlags(opened.lines[0]?.itemCode ?? "");
		} catch (error) {
			notify(messageOf(error), "error");
		} finally {
			setOpening(null);
		}
	}

	async function handleScan(raw: string) {
		const value = raw.trim();
		if (!value || !task) return;
		setScan("");

		let result = applyScan(task, value);
		if (result.outcome === "unknown-item") {
			// The label carries a barcode, the order carries an item code: resolve it once.
			try {
				const match = await client.scan(value);
				if (match.kind === "item" && match.item_code) result = applyScan(task, match.item_code);
			} catch {
				// Offline, or scan_barcode is restricted: the refusal below still stands.
			}
		}

		if (result.outcome === "unknown-item") {
			notify(`${value} is not on ${task.order}`, "error");
			return;
		}
		if (result.outcome === "line-complete") {
			notify(`All of ${value} on this order is already counted`, "info");
			return;
		}

		setTask(result.task);
		setErrors([]);
		void ensureFlags(value);
		scanRef.current?.focus();
	}

	function bump(line: ReceiptLine, delta: number) {
		if (!task) return;
		setTask(setLineQty(task, line.key, line.receivedNow + delta));
		setErrors([]);
	}

	async function createBatchFor(line: ReceiptLine) {
		if (!line.batchNo?.trim()) return;
		setCreatingBatch(line.key);
		try {
			const batch = await client.createBatch(line.itemCode, line.batchNo);
			setTask((current) =>
				current ? patchLine(current, line.key, applyCreatedBatch({}, batch)) : current
			);
			notify(`Batch ${batch.batch_id} created`, "success");
		} catch (error) {
			notify(messageOf(error), "error");
		} finally {
			setCreatingBatch(null);
		}
	}

	async function post(queueOnly: boolean) {
		if (!task) return;
		const problems = validateReceipt(task);
		if (problems.length) {
			setErrors(problems);
			notify(problems[0], "error");
			return;
		}

		setBusy(true);
		const op = receiptQueueOp(task);
		try {
			if (online && !queueOnly) {
				const created = await client.createDoc(op.doc);
				await client.submitDoc({ ...op.doc, name: created.name });
				notify(`Receipt ${created.name} posted`, "success");
				onPosted();
				return;
			}
			await onQueued(op);
			notify("Saved on the device — it will sync", "success");
			onPosted();
		} catch (error) {
			// Keep the work: the queue retries, and the marker stops a double receipt.
			await onQueued(op);
			notify(`${messageOf(error)} — saved to the queue`, "error");
			onPosted();
		} finally {
			setBusy(false);
		}
	}

	if (!task) {
		return (
			<div className="screen">
				<header className="screen__header screen__header--back">
					<button className="icon-btn" onClick={onBack} aria-label="Back">
						<BackIcon width={22} height={22} />
					</button>
					<div className="screen__header-body">
						<p className="eyebrow">Receiving</p>
						<h1>Deliveries due</h1>
					</div>
				</header>

				{loadingOrders ? (
					<Spinner label="Loading open purchase orders…" />
				) : loadError ? (
					<>
						<div className="banner banner--error" role="alert">
							<AlertIcon width={18} height={18} />
							<span>{loadError}</span>
						</div>
						<div className="actions">
							<Button block variant="secondary" onClick={() => void loadOrders()}>
								Try again
							</Button>
						</div>
					</>
				) : !orders?.length ? (
					<EmptyState
						title="Nothing to receive"
						hint="Every submitted purchase order has been received in full."
						icon={<CheckIcon width={28} height={28} />}
					/>
				) : (
					<Rows>
						{orders.map((order) => (
							<Row
								key={order.name}
								leading={
									<span className="avatar">
										<InIcon width={18} height={18} />
									</span>
								}
								title={order.supplier || order.name}
								subtitle={
									<>
										{order.name} · {order.transaction_date ?? "—"}
										{order.per_received ? ` · ${Math.round(order.per_received)}% in` : ""}
									</>
								}
								trailing={<Pill tone="info">Open</Pill>}
								onClick={() => void openOrder(order)}
							/>
						))}
					</Rows>
				)}

				{opening ? <Spinner label="Opening the order…" /> : null}
			</div>
		);
	}

	const progress = receiptProgress(task);
	const percent = progress.linesTotal ? (progress.linesTouched / progress.linesTotal) * 100 : 0;

	return (
		<div className="screen">
			<header className="screen__header screen__header--back">
				<button className="icon-btn" onClick={() => setTask(null)} aria-label="Back to orders">
					<BackIcon width={22} height={22} />
				</button>
				<div className="screen__header-body">
					<p className="eyebrow">{task.supplier ?? "Supplier"}</p>
					<h1>{task.order}</h1>
				</div>
				<div className="header__pills">
					<Pill tone={progress.linesTouched ? "success" : "neutral"}>
						{progress.linesTouched}/{progress.linesTotal} lines
					</Pill>
				</div>
			</header>

			<div className="progress" aria-hidden="true">
				<span className="progress__bar" style={{ width: `${percent}%` }} />
			</div>

			<div className="scan-field">
				<ScanIcon width={18} height={18} />
				<input
					ref={scanRef}
					className="input"
					value={scan}
					onChange={(event) => setScan(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void handleScan(scan);
						}
					}}
					placeholder="Scan or type the item code, then Enter"
					aria-label="Scan item into this receipt"
					autoComplete="off"
					spellCheck={false}
					inputMode="text"
				/>
				<button className="icon-btn" onClick={() => setCamera(true)} aria-label="Use the camera">
					<ScanIcon width={20} height={20} />
				</button>
			</div>

			<label className="toggle">
				<input type="checkbox" checked={task.blind} onChange={() => setTask(toggleBlind(task))} />
				<span>
					Blind receiving <small>hide expected quantities while counting</small>
				</span>
			</label>

			<Rows>
				{task.lines.map((line) => {
					const remaining = remainingToReceive(line);
					const done = line.receivedNow > 0;
					const isOpen = expanded === line.key;
					return (
						<div key={line.key} className="stack">
							<Row
								leading={
									<span className={`avatar${done ? " avatar--done" : ""}`}>
										{line.receivedNow || "—"}
									</span>
								}
								title={line.itemName || line.itemCode}
								subtitle={
									<>
										{line.itemCode}
										{task.blind ? null : ` · ordered ${formatQty(remaining, line.uom)}`}
										{line.batchNo ? ` · batch ${batchText(line)}` : ""}
									</>
								}
								trailing={
									<span className="stepper">
										<button
											type="button"
											className="stepper__btn"
											onClick={() => bump(line, -1)}
											disabled={!line.receivedNow}
											aria-label={`Remove one ${line.itemCode}`}
										>
											−
										</button>
										<button
											type="button"
											className="stepper__btn"
											onClick={() => bump(line, 1)}
											aria-label={`Add one ${line.itemCode}`}
										>
											+
										</button>
									</span>
								}
								onClick={() => setExpanded(isOpen ? null : line.key)}
							/>

							{isOpen ? (
								<div className="panel">
									<Field
										label={`Counted (${line.uom})`}
										hint={
											remaining > 0
												? `${formatQty(remaining, line.uom)} still open on the order`
												: "This line is fully received"
										}
									>
										<TextInput
											value={String(line.receivedNow)}
											onChange={(event) =>
												setTask(
													setLineQty(
														task,
														line.key,
														Number(event.target.value.replace(/[^0-9.]/g, "")) ||
															0
													)
												)
											}
											inputMode="decimal"
											aria-label={`Counted quantity for ${line.itemCode}`}
										/>
									</Field>

									<Field
										label={`Rejected (${line.uom})`}
										hint="Damaged or wrong: goes to the quarantine warehouse, not into stock"
									>
										<TextInput
											value={String(line.rejectedNow ?? 0)}
											onChange={(event) =>
												setTask(
													setLineRejected(
														task,
														line.key,
														Number(event.target.value.replace(/[^0-9.]/g, "")) || 0
													)
												)
											}
											inputMode="decimal"
											aria-label={`Rejected quantity for ${line.itemCode}`}
										/>
									</Field>

									{(line.rejectedNow ?? 0) > 0 ? (
										<Field label="Rejected stock goes to">
											<Select
												value={line.rejectedWarehouse ?? ""}
												onChange={(event) =>
													setTask(
														patchLine(task, line.key, { rejectedWarehouse: event.target.value })
													)
												}
											>
												<option value="">Choose a warehouse</option>
												{warehouses.map((warehouse) => (
													<option key={warehouse.name} value={warehouse.name}>
														{warehouse.warehouse_name ?? warehouse.name}
													</option>
												))}
											</Select>
										</Field>
									) : null}

									{line.hasBatchNo ? (
										<Field
											label="Batch number"
											hint={
												line.batchLabel
													? `Created on the site as ${line.batchNo}`
													: "Printed on the carton — create it if this lot is new"
											}
										>
											<TextInput
												value={line.batchLabel ?? line.batchNo ?? ""}
												onChange={(event) =>
													setTask(
														patchLine(task, line.key, {
															batchNo: event.target.value,
															batchLabel: undefined,
														})
													)
												}
												placeholder="e.g. LOT-2411-A"
												autoComplete="off"
											/>
										</Field>
									) : null}

									{line.hasBatchNo && !line.batchLabel && line.batchNo?.trim() ? (
										<Button
											variant="secondary"
											loading={creatingBatch === line.key}
											disabled={!online}
											onClick={() => void createBatchFor(line)}
										>
											{online
												? `Create batch “${line.batchNo.trim()}”`
												: "Creating a batch needs a connection"}
										</Button>
									) : null}

									{line.hasSerialNo ? (
										<Field
											label="Serial numbers"
											hint={`One per unit — ${line.receivedNow} expected`}
										>
											<textarea
												className="input textarea"
												value={line.serialNo ?? ""}
												onChange={(event) =>
													setTask(
														patchLine(task, line.key, {
															serialNo: event.target.value,
														})
													)
												}
												placeholder={"SN-0001\nSN-0002"}
												rows={3}
												spellCheck={false}
											/>
										</Field>
									) : null}

									<p className="muted">
										Into {line.warehouse || "—"} ·{" "}
										{formatQty(
											line.receivedNow * line.conversionFactor,
											line.stockUom || line.uom
										)}{" "}
										in stock units
									</p>
								</div>
							) : null}
						</div>
					);
				})}
			</Rows>

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
				<Button
					block
					loading={busy}
					onClick={() => void post(false)}
					disabled={!progress.linesTouched}
				>
					{online
						? `Post receipt · ${formatQty(progress.units, "")} ${
								progress.units === 1 ? "unit" : "units"
							}`
						: "Save offline"}
				</Button>
				{online ? (
					<Button
						block
						variant="secondary"
						onClick={() => void post(true)}
						disabled={busy || !progress.linesTouched}
					>
						Queue for later
					</Button>
				) : null}
				<Button
					block
					variant="ghost"
					onClick={() => {
						setTask(clearReceipt(task));
						setErrors([]);
					}}
					disabled={busy || !progress.linesTouched}
				>
					Start this order again
				</Button>
			</div>

			<p className="footnote">
				<Pill tone="info">
					<CloudIcon width={13} height={13} />{" "}
					{session.mode === "demo" ? "Demo data" : online ? "Posts to ERPNext" : "Stored locally"}
				</Pill>{" "}
				One line per carton you scanned. The receipt keeps the purchase order link, so the order
				closes itself.
			</p>

			{camera ? (
				<Scanner
					title="Scan into this receipt"
					onResult={(value) => {
						void handleScan(value);
						setCamera(false);
					}}
					onClose={() => setCamera(false)}
				/>
			) : null}
		</div>
	);
}
