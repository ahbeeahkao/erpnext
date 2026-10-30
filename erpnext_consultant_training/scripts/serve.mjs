#!/usr/bin/env node
// Zero-dependency static server for the course. Supports range requests so the narration
// audio can be scrubbed in the deck bar.

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".wav": "audio/wav",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".md": "text/markdown; charset=utf-8",
};

const server = createServer((request, response) => {
	const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
	const requested = decodeURIComponent(url.pathname);
	const relative = normalize(requested === "/" ? "/index.html" : requested).replace(/^([/\\])+/, "");
	const filePath = join(ROOT, relative);

	if (!filePath.startsWith(ROOT)) {
		response.writeHead(403).end("Forbidden");
		return;
	}

	let stats;
	try {
		stats = statSync(filePath);
	} catch {
		response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
		return;
	}
	if (stats.isDirectory()) {
		response.writeHead(302, { Location: `${requested.replace(/\/$/, "")}/index.html` }).end();
		return;
	}

	const headers = {
		"Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
		"Accept-Ranges": "bytes",
		"Cache-Control": "no-cache",
	};

	const range = request.headers.range;
	if (range) {
		const match = /bytes=(\d*)-(\d*)/.exec(range);
		const start = match?.[1] ? Number(match[1]) : 0;
		const end = match?.[2] ? Number(match[2]) : stats.size - 1;
		if (start >= stats.size || end >= stats.size || start > end) {
			response.writeHead(416, { "Content-Range": `bytes */${stats.size}` }).end();
			return;
		}
		response.writeHead(206, {
			...headers,
			"Content-Range": `bytes ${start}-${end}/${stats.size}`,
			"Content-Length": end - start + 1,
		});
		createReadStream(filePath, { start, end }).pipe(response);
		return;
	}

	response.writeHead(200, { ...headers, "Content-Length": stats.size });
	createReadStream(filePath).pipe(response);
});

server.listen(PORT, HOST, () => {
	console.log(`ERPNext consultant training on http://${HOST}:${PORT} (root: ${ROOT})`);
});
