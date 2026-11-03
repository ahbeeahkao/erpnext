import { useEffect, useRef, useState } from "react";
import { LabelSheet } from "../components/Labels";
import { Scanner } from "../components/Scanner";
import { AlertIcon, BackIcon, CloudIcon, ScanIcon } from "../components/icons";
import { Button, Field, Pill, Row, Rows, Select, TextInput } from "../components/ui";
import type { Notify } from "../hooks/useToasts";
import { ApiError } from "../lib/errors";
import { formatQty } from "../lib/format";
import { labelsForTask } from "../lib/labels";
import {
	addFlowLine,
	applyFlowScan,
	clearFlow,
	describeBatch,
	flowProgress,
	flowQueueOp,
	isShort,
	requiredOnLine,
	lineLocation,
	SHORT_REASONS,
	patchFlowLine,
	removeFlowLine,
	setFlowQty,
	taskLabel,
	toggleFlowBlind,
	validateFlow,
} from "../lib/taskflow";
import type {
	BatchOption,
	FlowLine,
	FlowTask,
	InventoryClient,
	QueueOp,
	Session,
	Warehouse,
} from "../lib/types";

function messageOf(error: unknown): string {
	if (error instanceof ApiError) return error.message;
	if (error instanceof Error) return error.message;
	return "Something went wrong";
}

/**
 * One screen for every counted job: rack count, put away, pick for a work order, pick for delivery.
 * The differences live in the task (where lines come from, what document they become), not in the UI.
 */
export function TaskFlowScreen({
	client,
	session,
	task,
	onTask,
	online,
	warehouses,
	onBack,
	onQueued,
	onPosted,
	notify,
	resolveScan,
}: {
	client: InventoryClient;
	session: Session;
	task: FlowTask;
	onTask: (task: FlowTask) => void;
	online: boolean;
	warehouses: Warehouse[];
	onBack: () => void;
	onQueued: (op: QueueOp) => Promise<void> | void;
	onPosted: () => void;
	notify: Notify;
	resolveScan?: (code: string) => Promise<FlowLine | null>;
}) {
	const [scan, setScan] = useState("");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [camera, setCamera] = useState(false);
	const [labelsOpen, setLabelsOpen] = useState(false);
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	/** Batches the server says are actually on the shelf, oldest expiry first. */
	const [batches, setBatches] = useState<Record<string, BatchOption[]>>({});
	const [loadingBatches, setLoadingBatches] = useState<string | null>(null);
	const scanRef = useRef<HTMLInputElement | null>(null);

	async function suggestBatches(line: FlowLine) {
		const warehouse =
			line.fromWarehouse ?? task.fromWarehouse ?? line.toWarehouse ?? task.toWarehouse ?? "";
		if (!warehouse || batches[line.key]) return;
		setLoadingBatches(line.key);
		try {
			const rows = await client.availableBatches(line.itemCode, warehouse);
			setBatches((current) => ({ ...current, [line.key]: rows }));
		} catch {
			// No batch list on this site: the operator types the number, as before.
			setBatches((current) => ({ ...current, [line.key]: [] }));
		} finally {
			setLoadingBatches(null);
		}
	}

	useEffect(() => {
		scanRef.current?.focus();
	}, []);

	async function handleScan(raw: string) {
		const value = raw.trim();
		if (!value) return;
		setScan("");
		const result = applyFlowScan(task, value);

		if (result.outcome === "matched") {
			onTask(result.task);
			setErrors([]);
			scanRef.current?.focus();
			return;
		}

		if (result.outcome === "line-complete") {
			notify(`All of ${value} on this task is already counted`, "info");
			return;
		}

		if (result.outcome === "new-item" && resolveScan) {
			try {
				const line = await resolveScan(value);
				if (!line) {
					notify(`${value} was not found`, "error");
					return;
				}
				onTask(addFlowLine(task, line));
				setErrors([]);
				scanRef.current?.focus();
			} catch (error) {
				notify(messageOf(error), "error");
			}
			return;
		}

		notify(`${value} is not on this task`, "error");
	}

	async function post(queueOnly: boolean) {
		const problems = validateFlow(task);
		if (problems.length) {
			setErrors(problems);
			notify(problems[0], "error");
			return;
		}

		setBusy(true);
		const op = flowQueueOp(task);
		try {
			if (online && !queueOnly) {
				const created = await client.createDoc(op.doc);
				if (op.submit === false) {
					notify(`${op.doc.doctype} ${created.name} created as a draft`, "success");
					onPosted();
					return;
				}
				await client.submitDoc({ ...op.doc, name: created.name });
				notify(`${op.doc.doctype} ${created.name} posted`, "success");
				onPosted();
				return;
			}
			await onQueued(op);
			notify("Saved on the device — it will sync", "success");
			onPosted();
		} catch (error) {
			await onQueued(op);
			notify(`${messageOf(error)} — saved to the queue`, "error");
			onPosted();
		} finally {
			setBusy(false);
		}
	}

	const progress = flowProgress(task);
	const percent = progress.linesTotal ? (progress.linesTouched / progress.linesTotal) * 100 : 0;
	const showsSystemQty = task.kind === "count-rack";
	const maybeNegative = task.kind === "count-rack" && !task.blind;

	return (
		<div className="screen">
			<header className="screen__header screen__header--back">
				<button className="icon-btn" onClick={onBack} aria-label="Back">
					<BackIcon width={22} height={22} />
				</button>
				<div className="screen__header-body">
					<p className="eyebrow">{task.subtitle ?? taskLabel(task.kind)}</p>
					<h1>{task.title}</h1>
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
					aria-label="Scan item onto this task"
					autoComplete="off"
					spellCheck={false}
				/>
				<button className="icon-btn" onClick={() => setCamera(true)} aria-label="Use the camera">
					<ScanIcon width={20} height={20} />
				</button>
			</div>

			<label className="toggle">
				<input type="checkbox" checked={task.blind} onChange={() => onTask(toggleFlowBlind(task))} />
				<span>
					Blind {showsSystemQty ? "count" : "pick"}{" "}
					<small>
						{showsSystemQty
							? "hide what the system thinks is here while you count"
							: "hide what the document expects while you pick"}
					</small>
				</span>
			</label>

			{task.dimensionField ? (
				<Field
					label={task.dimensionName ?? "Location"}
					hint="Applies to every line — override it per line in the line's detail"
				>
					<TextInput
						value={task.location ?? ""}
						onChange={(event) => onTask({ ...task, location: event.target.value })}
						placeholder="Scan or type the shelf, e.g. A1-03"
						aria-label={`${task.dimensionName ?? "Location"} for the whole task`}
						autoComplete="off"
					/>
				</Field>
			) : null}

			{!task.lines.length ? (
				<div className="empty">
					<div className="empty__icon">
						<ScanIcon width={26} height={26} />
					</div>
					<strong>Nothing scanned yet</strong>
					<p className="muted">Scan the first item and it appears here as a line.</p>
				</div>
			) : (
				<Rows>
					{task.lines.map((line) => {
						const isOpen = expanded === line.key;
						const done = line.qty > 0;
						return (
							<div key={line.key} className="stack">
								<Row
									leading={<span className={`avatar${done ? " avatar--done" : ""}`}>{line.qty || "—"}</span>}
									title={line.itemName || line.itemCode}
									subtitle={
										<>
											{line.itemCode}
											{task.blind
												? ""
												: showsSystemQty
													? ` · system ${formatQty(line.systemQty ?? 0, line.uom)}`
													: line.requiredQty !== undefined
														? ` · expected ${formatQty(line.requiredQty, line.uom)}`
														: ""}
											{isShort(task, line) ? " · short" : ""}
											{lineLocation(task, line) ? ` · ${lineLocation(task, line)}` : ""}
											{line.batchNo ? ` · batch ${line.batchNo}` : ""}
										</>
									}
									trailing={
										<span className="stepper">
											<button
												type="button"
												className="stepper__btn"
												onClick={() => onTask(setFlowQty(task, line.key, line.qty - 1))}
												disabled={!line.qty}
												aria-label={`Remove one ${line.itemCode}`}
											>
												−
											</button>
											<button
												type="button"
												className="stepper__btn"
												onClick={() => onTask(setFlowQty(task, line.key, line.qty + 1))}
												aria-label={`Add one ${line.itemCode}`}
											>
												+
											</button>
										</span>
									}
									onClick={() => {
										setExpanded(isOpen ? null : line.key);
										if (!isOpen && line.hasBatchNo) void suggestBatches(line);
									}}
								/>
								{isOpen ? (
									<div className="panel">
										<Field
											label={`${showsSystemQty ? "Counted" : "Picked"} (${line.uom})`}
											hint={
												maybeNegative
													? `System says ${formatQty(line.systemQty ?? 0, line.uom)} — a zero count is valid`
													: line.requiredQty !== undefined
														? `${formatQty(line.requiredQty, line.uom)} still open on this task`
														: "Zero is a valid count"
											}
										>
											<TextInput
												value={String(line.qty)}
												onChange={(event) =>
													onTask(
														setFlowQty(
															task,
															line.key,
															Number(event.target.value.replace(/[^0-9.]/g, "")) || 0
														)
													)
												}
												inputMode="decimal"
												aria-label={`Quantity for ${line.itemCode}`}
											/>
										</Field>

										{line.hasBatchNo ? (
											<Field
												label="Batch number"
												hint={
													loadingBatches === line.key
														? "Looking up the batches on the shelf…"
														: "Oldest expiry first — tap one, or type the number"
												}
											>
												<TextInput
													value={line.batchNo ?? ""}
													onChange={(event) =>
														onTask(patchFlowLine(task, line.key, { batchNo: event.target.value }))
													}
													placeholder="e.g. LOT-2411-A"
													autoComplete="off"
												/>
											</Field>
										) : null}

										{line.hasBatchNo && batches[line.key]?.length ? (
											<div className="chips">
												{batches[line.key].map((batch) => (
													<button
														key={batch.batch_no}
														type="button"
														className={`chip${line.batchNo === batch.batch_no ? " is-active" : ""}`}
														onClick={() =>
															onTask(patchFlowLine(task, line.key, { batchNo: batch.batch_no }))
														}
														
													>
														{describeBatch(batch, line.uom)}
													</button>
												))}
											</div>
										) : null}

										{line.hasSerialNo ? (
											<Field label="Serial numbers" hint={`One per unit — ${line.qty} expected`}>
												<textarea
													className="input textarea"
													value={line.serialNo ?? ""}
													onChange={(event) =>
														onTask(patchFlowLine(task, line.key, { serialNo: event.target.value }))
													}
													placeholder={"SN-0001\nSN-0002"}
													rows={3}
													spellCheck={false}
												/>
											</Field>
										) : null}

										{isShort(task, line) ? (
											<Field
												label="Why is it short?"
												hint={`${formatQty(
													requiredOnLine(line) - line.qty,
													line.uom
												)} could not be picked — the reason goes on the document`}
											>
												<Select
													value={line.shortReason ?? ""}
													onChange={(event) =>
														onTask(patchFlowLine(task, line.key, { shortReason: event.target.value }))
													}
												>
													<option value="">Choose a reason</option>
													{SHORT_REASONS.map((reason) => (
														<option key={reason} value={reason}>
															{reason}
														</option>
													))}
												</Select>
											</Field>
										) : null}

										{task.dimensionField ? (
											<Field
												label={task.dimensionName ?? "Location"}
												hint="Only needed when this line goes somewhere else"
											>
												<TextInput
													value={line.location ?? ""}
													onChange={(event) =>
														onTask(patchFlowLine(task, line.key, { location: event.target.value }))
													}
													placeholder={task.location || "Same as the task"}
													aria-label={`Location for ${line.itemCode}`}
													autoComplete="off"
												/>
											</Field>
										) : null}

										{task.kind === "putaway" ? (
											<Field label="Put away to">
												<Select
													value={line.toWarehouse ?? task.toWarehouse ?? ""}
													onChange={(event) =>
														onTask(patchFlowLine(task, line.key, { toWarehouse: event.target.value }))
													}
												>
													{warehouses.map((warehouse) => (
														<option key={warehouse.name} value={warehouse.name}>
															{warehouse.warehouse_name ?? warehouse.name}
														</option>
													))}
												</Select>
											</Field>
										) : null}

										<p className="muted">
											{line.fromWarehouse ?? task.fromWarehouse
												? `${line.fromWarehouse ?? task.fromWarehouse} → ${line.toWarehouse ?? task.toWarehouse ?? "—"}`
												: `Into ${line.toWarehouse ?? task.reference}`}
										</p>

										{resolveScan ? (
											<Button variant="ghost" onClick={() => onTask(removeFlowLine(task, line.key))}>
												Remove this line
											</Button>
										) : null}
									</div>
								) : null}
							</div>
						);
					})}
				</Rows>
			)}

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
				<Button block loading={busy} onClick={() => void post(false)} disabled={!progress.linesTouched}>
					{online
						? `${task.kind === "pick-dn" ? "Create draft" : "Post"} · ${formatQty(progress.units, "")} ${
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
				{task.kind !== "count-rack" && progress.linesTouched ? (
					<Button block variant="secondary" onClick={() => setLabelsOpen(true)}>
						Print labels
					</Button>
				) : null}
				<Button
					block
					variant="ghost"
					onClick={() => {
						onTask(clearFlow(task));
						setErrors([]);
					}}
					disabled={busy || !progress.linesTouched}
				>
					Start again
				</Button>
			</div>

			<p className="footnote">
				<Pill tone="info">
					<CloudIcon width={13} height={13} />{" "}
					{session.mode === "demo" ? "Demo data" : online ? "Posts to ERPNext" : "Stored locally"}
				</Pill>{" "}
				{task.kind === "count-rack"
					? `One Stock Reconciliation for the whole rack: ${task.lines.length} line${
							task.lines.length === 1 ? "" : "s"
						}. Only scanned items are counted — nothing else in the warehouse is touched.`
					: task.kind === "pick-dn"
						? "The delivery note is created as a draft: dispatch checks it against the gate pass and submits."
						: "One document for everything you scanned; the source and target stay on every row."}
			</p>

			{labelsOpen ? (
				<LabelSheet
					labels={labelsForTask(task)}
					onClose={() => setLabelsOpen(false)}
					onError={(message) => notify(message, "error")}
				/>
			) : null}

			{camera ? (
				<Scanner
					title="Scan onto this task"
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

/** Small shared pieces the task containers reuse. */
export function TaskHeader({
	eyebrow,
	title,
	onBack,
	trailing,
}: {
	eyebrow: string;
	title: string;
	onBack: () => void;
	trailing?: React.ReactNode;
}) {
	return (
		<header className="screen__header screen__header--back">
			<button className="icon-btn" onClick={onBack} aria-label="Back">
				<BackIcon width={22} height={22} />
			</button>
			<div className="screen__header-body">
				<p className="eyebrow">{eyebrow}</p>
				<h1>{title}</h1>
			</div>
			{trailing ? <div className="header__pills">{trailing}</div> : null}
		</header>
	);
}

