#!/usr/bin/env node
// Zero-dependency static server for the built app (`npm run build` first).
// Used for previews on hosts where a Vite dev server is not reachable.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd(), "dist");
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".map": "application/json; charset=utf-8",
	".woff2": "font/woff2",
	".txt": "text/plain; charset=utf-8",
};

if (!existsSync(root)) {
	console.error(`dist/ not found at ${root}. Run "npm run build" first.`);
	process.exit(1);
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", "http://localhost");
	let pathname = decodeURIComponent(url.pathname);
	if (pathname.endsWith("/")) pathname += "index.html";

	const candidate = normalize(join(root, pathname));
	if (!candidate.startsWith(root)) {
		res.writeHead(403).end("Forbidden");
		return;
	}

	const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
	const ext = extname(file);
	const immutable = file.includes(`${root}/assets/`);

	res.writeHead(200, {
		"Content-Type": MIME[ext] ?? "application/octet-stream",
		"Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
		"Service-Worker-Allowed": "/",
	});
	createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
	console.log(`Inventory PWA on http://${host}:${port}`);
});
