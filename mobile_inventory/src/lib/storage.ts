// Minimal IndexedDB wrapper: one key/value store for settings + caches, one for the offline queue.
// No dependencies; everything degrades to an in-memory map when IndexedDB is unavailable.

const DB_NAME = "erpnext-mobile-inventory";
const DB_VERSION = 1;

export type StoreName = "kv" | "queue";

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("IndexedDB unavailable"));
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
			if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
		request.onblocked = () => reject(new Error("IndexedDB blocked"));
	});

	return dbPromise;
}

async function withStore<T>(
	store: StoreName,
	mode: IDBTransactionMode,
	run: (objectStore: IDBObjectStore) => IDBRequest
): Promise<T> {
	const db = await openDatabase();
	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(store, mode);
		const request = run(transaction.objectStore(store));
		request.onsuccess = () => resolve(request.result as T);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
	});
}

function fallbackKey(store: StoreName, key: string): string {
	return `${store}:${key}`;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
	try {
		return await withStore<T | undefined>("kv", "readonly", (store) => store.get(key));
	} catch {
		return memory.get(fallbackKey("kv", key)) as T | undefined;
	}
}

export async function kvSet(key: string, value: unknown): Promise<void> {
	try {
		await withStore<void>("kv", "readwrite", (store) => store.put(value, key));
	} catch {
		memory.set(fallbackKey("kv", key), value);
	}
}

export async function kvDelete(key: string): Promise<void> {
	try {
		await withStore<void>("kv", "readwrite", (store) => store.delete(key));
	} catch {
		memory.delete(fallbackKey("kv", key));
	}
}

export async function readAll<T>(storeName: StoreName): Promise<T[]> {
	try {
		return await withStore<T[]>(storeName, "readonly", (store) => store.getAll());
	} catch {
		const prefix = `${storeName}:`;
		return [...memory.entries()].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value as T);
	}
}

export async function putRecord(storeName: StoreName, value: { id: string }): Promise<void> {
	try {
		await withStore<void>(storeName, "readwrite", (store) => store.put(value));
	} catch {
		memory.set(fallbackKey(storeName, value.id), value);
	}
}

export async function deleteRecord(storeName: StoreName, id: string): Promise<void> {
	try {
		await withStore<void>(storeName, "readwrite", (store) => store.delete(id));
	} catch {
		memory.delete(fallbackKey(storeName, id));
	}
}

export async function clearStore(storeName: StoreName): Promise<void> {
	try {
		await withStore<void>(storeName, "readwrite", (store) => store.clear());
	} catch {
		const prefix = `${storeName}:`;
		for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
	}
}
