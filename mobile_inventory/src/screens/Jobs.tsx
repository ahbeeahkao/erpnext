import { useCallback, useEffect, useState } from "react";
import { AlertIcon, BoxIcon, OutIcon } from "../components/icons";
import { Button, EmptyState, Field, Pill, Row, Rows, Select, Spinner } from "../components/ui";
import type { Notify } from "../hooks/useToasts";
import { ApiError } from "../lib/errors";
import { formatQty, nowTime } from "../lib/format";
import { todayIso } from "../lib/settings";
import {
	createFlowTask,
	pickLinesFromSalesOrder,
	pickLinesFromWorkOrder,
} from "../lib/taskflow";
import type {
	FlowLine,
	FlowTask,
	InventoryClient,
	QueueOp,
	SalesOrder,
	Session,
	Warehouse,
	WorkOrder,
} from "../lib/types";
import { newId } from "./Move";
import { TaskFlowScreen, TaskHeader } from "./TaskFlow";

function messageOf(error: unknown): string {
	if (error instanceof ApiError) return error.message;
	if (error instanceof Error) return error.message;
	return "Something went wrong";
}

interface CommonProps {
	client: InventoryClient;
	session: Session;
	warehouses: Warehouse[];
	defaultWarehouse?: string;
	online: boolean;
	onBack: () => void;
	onQueued: (op: QueueOp) => Promise<void> | void;
	onPosted: () => void;
	notify: Notify;
}

function stamp() {
	return { postingDate: todayIso(), postingTime: nowTime() };
}

/** Resolves a scanned value to an item, whether it is a barcode or a code. */
async function resolveItem(client: InventoryClient, value: string) {
	try {
		const match = await client.scan(value);
		if (match.kind === "item" && match.item_code) return match;
		if (match.kind === "candidates" && match.candidates?.length === 1) {
			return { ...match, kind: "item" as const, item_code: match.candidates[0].item_code };
		}
		if (match.kind !== "none") return null;
	} catch {
		// A site with scan_barcode restricted: fall back to treating the value as an item code.
	}
	try {
		const info = await client.itemInfo(value);
		return { kind: "item" as const, item_code: info.item_code };
	} catch {
		return null;
	}
}

/** Document flows do not carry batch/serial flags, so learn them from the items themselves. */
async function withItemFlags(client: InventoryClient, lines: FlowLine[]): Promise<FlowLine[]> {
	const codes = [...new Set(lines.map((line) => line.itemCode))];
	const results = await Promise.allSettled(codes.map((code) => client.itemInfo(code)));
	const flags = new Map<string, { hasBatchNo: boolean; hasSerialNo: boolean }>();
	results.forEach((result, index) => {
		if (result.status !== "fulfilled") return;
		flags.set(codes[index], {
			hasBatchNo: Boolean(result.value.has_batch_no),
			hasSerialNo: Boolean(result.value.has_serial_no),
		});
	});
	return lines.map((line) => {
		const flag = flags.get(line.itemCode);
		return flag ? { ...line, ...flag } : line;
	});
}

// ---------------------------------------------------------------- count a rack

export function RackCountScreen(props: CommonProps) {
	const { client, session, warehouses, defaultWarehouse, online, onBack, onQueued, onPosted, notify } = props;
	const [warehouse, setWarehouse] = useState(defaultWarehouse ?? warehouses[0]?.name ?? "");
	const [task, setTask] = useState<FlowTask | null>(null);

	function start() {
		if (!warehouse) {
			notify("Choose the warehouse you are counting", "error");
			return;
		}
		setTask(
			createFlowTask(newId(), "count-rack", {
				title: warehouse,
				subtitle: "Count a rack",
				reference: warehouse,
				company: session.company ?? "",
				...stamp(),
				toWarehouse: warehouse,
			})
		);
	}

	const resolveScan = useCallback(
		async (code: string): Promise<FlowLine | null> => {
			const hit = await resolveItem(client, code);
			if (!hit?.item_code) return null;
			const info = await client.itemInfo(hit.item_code);
			const bins = await client.stockFor(info.item_code).catch(() => []);
			const bin = bins.find((row) => row.warehouse === warehouse);
			return {
				key: info.item_code,
				itemCode: info.item_code,
				itemName: info.item_name,
				uom: info.stock_uom ?? "Nos",
				conversionFactor: 1,
				qty: 1,
				systemQty: bin?.actual_qty ?? 0,
				valuationRate: bin?.valuation_rate,
				toWarehouse: warehouse,
				hasBatchNo: Boolean(info.has_batch_no),
				hasSerialNo: Boolean(info.has_serial_no),
			};
		},
		[client, warehouse]
	);

	if (task) {
		return (
			<TaskFlowScreen
				client={client}
				session={session}
				task={task}
				onTask={setTask}
				online={online}
				warehouses={warehouses}
				onBack={() => setTask(null)}
				onQueued={onQueued}
				onPosted={onPosted}
				notify={notify}
				resolveScan={resolveScan}
			/>
		);
	}

	return (
		<div className="screen">
			<TaskHeader eyebrow="Count a rack" title="Pick the warehouse" onBack={onBack} />
			<div className="panel">
				<Field label="Warehouse" hint="Everything you scan is counted in this warehouse only">
					<Select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>
						{warehouses.map((row) => (
							<option key={row.name} value={row.name}>
								{row.warehouse_name ?? row.name}
							</option>
						))}
					</Select>
				</Field>
				<Button block onClick={start}>
					Start counting
				</Button>
			</div>
			<p className="footnote">
				Blind by default: the system quantity stays hidden until you have counted, and every item
				you scan goes onto one Stock Reconciliation.
			</p>
		</div>
	);
}

// -------------------------------------------------------------------- put away

export function PutAwayScreen(props: CommonProps) {
	const { client, session, warehouses, defaultWarehouse, online, onBack, onQueued, onPosted, notify } = props;
	const [fromWarehouse, setFrom] = useState(defaultWarehouse ?? warehouses[0]?.name ?? "");
	const [toWarehouse, setTo] = useState(
		warehouses.find((row) => row.name !== (defaultWarehouse ?? warehouses[0]?.name))?.name ?? ""
	);
	const [task, setTask] = useState<FlowTask | null>(null);

	function start() {
		if (!fromWarehouse || !toWarehouse) {
			notify("Choose both warehouses", "error");
			return;
		}
		if (fromWarehouse === toWarehouse) {
			notify("From and to are the same warehouse", "error");
			return;
		}
		setTask(
			createFlowTask(newId(), "putaway", {
				title: `${fromWarehouse} → ${toWarehouse}`,
				subtitle: "Put away",
				reference: fromWarehouse,
				company: session.company ?? "",
				...stamp(),
				fromWarehouse,
				toWarehouse,
			})
		);
	}

	const resolveScan = useCallback(
		async (code: string): Promise<FlowLine | null> => {
			const hit = await resolveItem(client, code);
			if (!hit?.item_code) return null;
			const info = await client.itemInfo(hit.item_code);
			return {
				key: info.item_code,
				itemCode: info.item_code,
				itemName: info.item_name,
				uom: info.stock_uom ?? "Nos",
				conversionFactor: 1,
				qty: 1,
				fromWarehouse,
				toWarehouse,
				hasBatchNo: Boolean(info.has_batch_no),
				hasSerialNo: Boolean(info.has_serial_no),
			};
		},
		[client, fromWarehouse, toWarehouse]
	);

	if (task) {
		return (
			<TaskFlowScreen
				client={client}
				session={session}
				task={task}
				onTask={setTask}
				online={online}
				warehouses={warehouses}
				onBack={() => setTask(null)}
				onQueued={onQueued}
				onPosted={onPosted}
				notify={notify}
				resolveScan={resolveScan}
			/>
		);
	}

	return (
		<div className="screen">
			<TaskHeader eyebrow="Put away" title="Where is it going?" onBack={onBack} />
			<div className="panel">
				<Field label="It is in now" hint="Usually the receiving or staging warehouse">
					<Select value={fromWarehouse} onChange={(event) => setFrom(event.target.value)}>
						{warehouses.map((row) => (
							<option key={row.name} value={row.name}>
								{row.warehouse_name ?? row.name}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Put it away to">
					<Select value={toWarehouse} onChange={(event) => setTo(event.target.value)}>
						{warehouses.map((row) => (
							<option key={row.name} value={row.name}>
								{row.warehouse_name ?? row.name}
							</option>
						))}
					</Select>
				</Field>
				<Button block onClick={start}>
					Start putting away
				</Button>
			</div>
			<p className="footnote">
				Scan each carton, then post one Material Transfer. Change the destination per line if a
				carton belongs somewhere else.
			</p>
		</div>
	);
}

// ------------------------------------------------------------- pick for work order

export function PickWorkOrderScreen(props: CommonProps) {
	const { client, session, warehouses, online, onBack, onQueued, onPosted, notify } = props;
	const [orders, setOrders] = useState<WorkOrder[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [opening, setOpening] = useState<string | null>(null);
	const [task, setTask] = useState<FlowTask | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setOrders(await client.openWorkOrders());
		} catch (caught) {
			setError(messageOf(caught));
		} finally {
			setLoading(false);
		}
	}, [client]);

	useEffect(() => {
		void load();
	}, [load]);

	async function open(order: WorkOrder) {
		setOpening(order.name);
		try {
			const rows = await client.workOrderLines(order.name);
			const lines = await withItemFlags(client, pickLinesFromWorkOrder(order, rows));
			if (!lines.length) {
				notify("Every material on this work order is already issued", "info");
				return;
			}
			setTask(
				createFlowTask(newId(), "pick-wo", {
					title: order.name,
					subtitle: order.production_item ?? "Pick for work order",
					reference: order.name,
					company: order.company ?? session.company ?? "",
					...stamp(),
					fromWarehouse: order.source_warehouse,
					toWarehouse: order.wip_warehouse,
				}, lines)
			);
		} catch (caught) {
			notify(messageOf(caught), "error");
		} finally {
			setOpening(null);
		}
	}

	if (task) {
		return (
			<TaskFlowScreen
				client={client}
				session={session}
				task={task}
				onTask={setTask}
				online={online}
				warehouses={warehouses}
				onBack={() => setTask(null)}
				onQueued={onQueued}
				onPosted={onPosted}
				notify={notify}
			/>
		);
	}

	return (
		<div className="screen">
			<TaskHeader eyebrow="Pick for a work order" title="What are we making?" onBack={onBack} />
			{loading ? (
				<Spinner label="Loading work orders…" />
			) : error ? (
				<>
					<div className="banner banner--error" role="alert">
						<AlertIcon width={18} height={18} />
						<span>{error}</span>
					</div>
					<Button block variant="secondary" onClick={() => void load()}>
						Try again
					</Button>
				</>
			) : !orders?.length ? (
				<EmptyState
					title="No work orders waiting"
					hint="Submitted work orders that still need material appear here."
					icon={<BoxIcon width={28} height={28} />}
				/>
			) : (
				<Rows>
					{orders.map((order) => (
						<Row
							key={order.name}
							leading={
								<span className="avatar">
									<BoxIcon width={18} height={18} />
								</span>
							}
							title={order.production_item ?? order.name}
							subtitle={
								<>
									{order.name} · {formatQty(order.qty ?? 0, "")} planned
									{order.status ? ` · ${order.status}` : ""}
								</>
							}
							trailing={<Pill tone="info">Pick</Pill>}
							onClick={() => void open(order)}
						/>
					))}
				</Rows>
			)}
			{opening ? <Spinner label="Loading the bill of materials…" /> : null}
		</div>
	);
}

// ------------------------------------------------------------ pick for delivery

export function PickDeliveryScreen(props: CommonProps) {
	const { client, session, warehouses, online, onBack, onQueued, onPosted, notify } = props;
	const [orders, setOrders] = useState<SalesOrder[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [opening, setOpening] = useState<string | null>(null);
	const [task, setTask] = useState<FlowTask | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setOrders(await client.openSalesOrders());
		} catch (caught) {
			setError(messageOf(caught));
		} finally {
			setLoading(false);
		}
	}, [client]);

	useEffect(() => {
		void load();
	}, [load]);

	async function open(order: SalesOrder) {
		setOpening(order.name);
		try {
			const rows = await client.salesOrderLines(order.name);
			const lines = await withItemFlags(client, pickLinesFromSalesOrder(rows));
			if (!lines.length) {
				notify("This order is already fully delivered", "info");
				return;
			}
			setTask(
				createFlowTask(newId(), "pick-dn", {
					title: order.name,
					subtitle: order.customer ?? "Pick for delivery",
					reference: order.name,
					customer: order.customer,
					company: order.company ?? session.company ?? "",
					...stamp(),
				}, lines)
			);
		} catch (caught) {
			notify(messageOf(caught), "error");
		} finally {
			setOpening(null);
		}
	}

	if (task) {
		return (
			<TaskFlowScreen
				client={client}
				session={session}
				task={task}
				onTask={setTask}
				online={online}
				warehouses={warehouses}
				onBack={() => setTask(null)}
				onQueued={onQueued}
				onPosted={onPosted}
				notify={notify}
			/>
		);
	}

	return (
		<div className="screen">
			<TaskHeader eyebrow="Pick for delivery" title="What is going out?" onBack={onBack} />
			{loading ? (
				<Spinner label="Loading sales orders…" />
			) : error ? (
				<>
					<div className="banner banner--error" role="alert">
						<AlertIcon width={18} height={18} />
						<span>{error}</span>
					</div>
					<Button block variant="secondary" onClick={() => void load()}>
						Try again
					</Button>
				</>
			) : !orders?.length ? (
				<EmptyState
					title="Nothing to pick"
					hint="Submitted sales orders that still have quantity to deliver appear here."
					icon={<OutIcon width={28} height={28} />}
				/>
			) : (
				<Rows>
					{orders.map((order) => (
						<Row
							key={order.name}
							leading={
								<span className="avatar">
									<OutIcon width={18} height={18} />
								</span>
							}
							title={order.customer ?? order.name}
							subtitle={
								<>
									{order.name}
									{order.delivery_date ? ` · due ${order.delivery_date}` : ""}
									{order.per_delivered ? ` · ${Math.round(order.per_delivered)}% out` : ""}
								</>
							}
							trailing={<Pill tone="info">Pick</Pill>}
							onClick={() => void open(order)}
						/>
					))}
				</Rows>
			)}
			{opening ? <Spinner label="Loading the order lines…" /> : null}
		</div>
	);
}

