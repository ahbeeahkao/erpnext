/* Offline shell for the inventory PWA.
 *
 * Caches only the app shell and static assets from this origin. API traffic (anything under
 * /api/, and every non-GET request) is never cached — stock must always come from ERPNext.
 */
const VERSION = "v1";
const CACHE = `inventory-shell-${VERSION}`;
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await Promise.all(
				PRECACHE.map((url) =>
					cache.add(new Request(url, { cache: "reload" })).catch(() => {
						/* a missing optional asset must not fail the install */
					})
				)
			);
			await self.skipWaiting();
		})()
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith("inventory-shell-") && key !== CACHE)
					.map((key) => caches.delete(key))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener("message", (event) => {
	if (event.data === "skip-waiting") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.includes("/api/")) return;

	if (request.mode === "navigate") {
		event.respondWith(networkFirst(request));
		return;
	}

	event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		const shell = await cache.match("./index.html");
		if (shell) return shell;
		return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
	}
}

async function staleWhileRevalidate(request) {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	const network = fetch(request)
		.then((response) => {
			if (response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => undefined);

	return cached ?? (await network) ?? new Response("", { status: 504 });
}
