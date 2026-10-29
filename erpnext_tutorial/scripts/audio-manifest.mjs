#!/usr/bin/env node
// Rebuild audio/manifest.json from the chapter JSON and the mp3 files on disk.
// The transcript stored here must equal the chapter's narration — the course test enforces it.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const VOICE = "voice-00";

const manifest = JSON.parse(readFileSync(join(ROOT, "course/manifest.json"), "utf8"));
const chapters = {};

for (const entry of manifest.chapters) {
	const chapter = JSON.parse(readFileSync(join(ROOT, "course", entry.file), "utf8"));
	const file = `${chapter.id}.mp3`;
	const path = join(ROOT, "audio", file);
	if (!existsSync(path)) {
		console.error(`missing audio/${file} — generate it before rebuilding the manifest`);
		process.exit(1);
	}
	chapters[chapter.id] = {
		file,
		voice: VOICE,
		chars: chapter.narration.length,
		bytes: statSync(path).size,
		text: chapter.narration,
	};
}

const output = {
	course: manifest.title,
	voice: VOICE,
	note: "Chapter narration generated from course/*.json narration text. Transcripts are identical to the narration field.",
	chapters,
};

writeFileSync(join(ROOT, "audio", "manifest.json"), `${JSON.stringify(output, null, "\t")}\n`, "utf8");
console.log(`wrote audio/manifest.json for ${Object.keys(chapters).length} chapters`);
