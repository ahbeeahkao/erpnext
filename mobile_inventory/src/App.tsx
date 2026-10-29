import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertIcon, BackIcon, CheckIcon, QueueIcon, ScanIcon, SettingsIcon } from "./components/icons";
import { Connect } from "./screens/Connect";
import { CountScreen } from "./screens/Count";
import { Home } from "./screens/Home";
import { ItemScreen } from "./screens/Item";
import { MoveScreen } from "./screens/Move";
import { QueueScreen } from "./screens/Queue";
import { SettingsScreen } from "./screens/Settings";
import { useOnline } from "./hooks/useOnline";
import { useQueue } from "./hooks/useQueue";
import { useToasts } from "./hooks/useToasts";
import { createClient } from "./lib/client";
import { ApiError } from "./lib/errors";
import { clearQueue } from "./lib/queue";
import { clearRecent } from "./lib/recent";
import { clearSession, loadSession, saveSession } from "./lib/settings";
import { clearStore } from "./lib/storage";
import type { Connection, ItemInfo, MoveKind, QueueOp, Session } from "./lib/types";

type Screen =
	| { name: "home" }
	| { name: "queue" }
	| { name: "settings" }
	| { name: "item"; itemCode: string }
	| { name: "move"; itemCode: string; kind: MoveKind }
	| { name: "count"; itemCode: string };

type Tab = "home" | "queue" | "settings";

export default function App() {
	const online = useOnline();
	const { toasts, notify } = useToasts();

	const [session, setSession] = useState<Session | null>(null);
	const [connection, setConnection] = useState<Connection | null>(null);
	const [booted, setBooted] = useState(false);
	const [bootError, setBootError] = useState<string | null>(null);
	const [screen, setScreen] = useState<Screen>({ name: "home" });
	const [item, setItem] = useState<ItemInfo | null>(null);
	const [itemError, setItemError] = useState<string | null>(null);
	const bootRef = useRef(false);

	const client = useMemo(() => (session ? createClient(session) : null), [session]);
	const queue = useQueue(client, online, Boolean(session && connection), notify);

	// ---- boot: restore the saved session and verify it -------------------------
	useEffect(() => {
		if (bootRef.current) return;
		bootRef.current = true;
		(async () => {
			const stored = await loadSession();
			if (!stored) {
				setBooted(true);
				return;
			}
			try {
				const nextClient = createClient(stored);
				const nextConnection = await nextClient.connect();
				setSession(stored);
				setConnection(nextConnection);
			} catch (error) {
				setBootError(error instanceof ApiError ? error.message : "Could not reconnect");
			} finally {
				setBooted(true);
			}
		})();
	}, []);

	// ---- item loading for detail screens --------------------------------------
	const openItem = useCallback(
		async (itemCode: string) => {
			if (!client) return;
			setItemError(null);
			setScreen({ name: "item", itemCode });
			try {
				const info = await client.itemInfo(itemCode);
				setItem(info);
			} catch (error) {
				const message = error instanceof ApiError ? error.message : "Could not load the item";
				setItemError(message);
				notify(message, "error");
			}
		},
		[client, notify]
	);

	const handleConnected = useCallback(async (nextSession: Session, nextConnection: Connection) => {
		setSession(nextSession);
		setConnection(nextConnection);
		setBootError(null);
		setScreen({ name: "home" });
	}, []);

	const disconnect = useCallback(async () => {
		await clearSession();
		setSession(null);
		setConnection(null);
		setItem(null);
		setScreen({ name: "home" });
	}, []);

	const setDefaultWarehouse = useCallback(
		async (warehouse: string) => {
			if (!session) return;
			const next = { ...session, defaultWarehouse: warehouse || undefined };
			setSession(next);
			await saveSession(next);
		},
		[session]
	);

	const enqueue = useCallback(
		async (op: QueueOp) => {
			await queue.enqueue(op);
			if (online) void queue.syncNow();
		},
		[online, queue]
	);

	const clearLocal = useCallback(async () => {
		await clearQueue();
		await clearRecent();
		await clearStore("kv");
		await queue.refresh();
		notify("Local data cleared", "success");
	}, [notify, queue]);

	// ---- render ---------------------------------------------------------------
	if (!booted) {
		return (
			<div className="boot">
				<span className="spinner" aria-hidden="true" />
			</div>
		);
	}

	if (!session || !connection) {
		return (
			<>
				<Connect
					initial={session}
					notice={bootError}
					onConnected={(s, c) => void handleConnected(s, c)}
				/>
				<Toasts toasts={toasts} />
			</>
		);
	}

	const warehouses = connection.warehouses;
	const currentItem = item?.item_code === (screen as { itemCode?: string }).itemCode ? item : null;

	const body = (() => {
		switch (screen.name) {
			case "home":
				return (
					<Home
						client={client!}
						session={session}
						online={online}
						pending={queue.pending}
						syncing={queue.syncing}
						onSync={() => void queue.syncNow()}
						onOpenItem={(code) => void openItem(code)}
						notify={notify}
					/>
				);
			case "queue":
				return (
					<QueueScreen
						ops={queue.ops}
						pending={queue.pending}
						syncing={queue.syncing}
						online={online}
						onSync={() => void queue.syncNow()}
						onRetry={(op) => void queue.retry(op)}
						onRemove={(op) => void queue.remove(op.id)}
					/>
				);
			case "settings":
				return (
					<SettingsScreen
						session={session}
						connection={connection}
						pending={queue.pending}
						syncing={queue.syncing}
						onSync={() => void queue.syncNow()}
						onDefaultWarehouse={(warehouse) => void setDefaultWarehouse(warehouse)}
						onClearLocal={clearLocal}
						onDisconnect={() => void disconnect()}
					/>
				);
			case "item":
				if (!currentItem) {
					return <ItemLoading error={itemError} onBack={() => setScreen({ name: "home" })} />;
				}
				return (
					<ItemScreen
						client={client!}
						item={currentItem}
						notify={notify}
						onBack={() => setScreen({ name: "home" })}
						onMove={(kind) => setScreen({ name: "move", itemCode: currentItem.item_code, kind })}
						onCount={() => setScreen({ name: "count", itemCode: currentItem.item_code })}
					/>
				);
			case "move":
				if (!currentItem) {
					return <ItemLoading error={itemError} onBack={() => setScreen({ name: "home" })} />;
				}
				return (
					<MoveScreen
						client={client!}
						session={session}
						item={currentItem}
						kind={screen.kind}
						warehouses={warehouses}
						online={online}
						defaultWarehouse={session.defaultWarehouse}
						notify={notify}
						onBack={() => setScreen({ name: "item", itemCode: currentItem.item_code })}
						onQueued={enqueue}
						onPosted={() => setScreen({ name: "home" })}
					/>
				);
			case "count":
				if (!currentItem) {
					setScreen({ name: "home" });
					return null;
				}
				return (
					<CountScreen
						client={client!}
						session={session}
						item={currentItem}
						warehouses={warehouses}
						online={online}
						defaultWarehouse={session.defaultWarehouse}
						notify={notify}
						onBack={() => setScreen({ name: "item", itemCode: currentItem.item_code })}
						onQueued={enqueue}
						onPosted={() => setScreen({ name: "home" })}
					/>
				);
			default:
				return null;
		}
	})();

	const tab: Tab = screen.name === "queue" ? "queue" : screen.name === "settings" ? "settings" : "home";
	const showTabs = screen.name === "home" || screen.name === "queue" || screen.name === "settings";

	return (
		<div className="app">
			<main className="app__body">{body}</main>

			{showTabs ? (
				<nav className="tabbar" aria-label="Main">
					<button
						className={`tabbar__item${tab === "home" ? " is-active" : ""}`}
						onClick={() => setScreen({ name: "home" })}
					>
						<ScanIcon width={22} height={22} />
						<span>Scan</span>
					</button>
					<button
						className={`tabbar__item${tab === "queue" ? " is-active" : ""}`}
						onClick={() => setScreen({ name: "queue" })}
					>
						<span className="tabbar__icon">
							<QueueIcon width={22} height={22} />
							{queue.pending ? <span className="tabbar__badge">{queue.pending}</span> : null}
						</span>
						<span>Queue</span>
					</button>
					<button
						className={`tabbar__item${tab === "settings" ? " is-active" : ""}`}
						onClick={() => setScreen({ name: "settings" })}
					>
						<SettingsIcon width={22} height={22} />
						<span>Settings</span>
					</button>
				</nav>
			) : null}

			<Toasts toasts={toasts} />
		</div>
	);
}

function ItemLoading({ error, onBack }: { error: string | null; onBack: () => void }) {
	return (
		<div className="screen">
			<header className="screen__header screen__header--back">
				<button className="icon-btn" onClick={onBack} aria-label="Back">
					<BackIcon width={22} height={22} />
				</button>
				<div className="screen__header-body">
					<p className="eyebrow">Item</p>
					<h1>Loading…</h1>
				</div>
			</header>
			{error ? (
				<div className="banner banner--error">
					<AlertIcon width={18} height={18} />
					<span>{error}</span>
				</div>
			) : (
				<div className="center-block">
					<span className="spinner" aria-hidden="true" />
					<span className="muted">Fetching item details…</span>
				</div>
			)}
		</div>
	);
}

function Toasts({ toasts }: { toasts: Array<{ id: number; message: string; tone: string }> }) {
	if (!toasts.length) return null;
	return (
		<div className="toasts" role="status" aria-live="polite">
			{toasts.map((toast) => (
				<div key={toast.id} className={`toast toast--${toast.tone}`}>
					{toast.tone === "error" ? (
						<AlertIcon width={16} height={16} />
					) : (
						<CheckIcon width={16} height={16} />
					)}
					<span>{toast.message}</span>
				</div>
			))}
		</div>
	);
}
