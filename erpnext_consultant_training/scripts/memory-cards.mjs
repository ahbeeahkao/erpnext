#!/usr/bin/env node
// Build the printable recall artefacts from the chapter JSON:
//   memory/cards.csv     one row per recall card, importable into Anki or Quizlet
//   memory/cheatsheet.md one page: the ten laws, then every chapter's device and spine
// Run it after editing a chapter's `memory` block. The course test fails if the files drift.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import prettier from "prettier";

const ROOT = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(ROOT, "course/manifest.json"), "utf8"));
const index = JSON.parse(readFileSync(join(ROOT, "course/memory.json"), "utf8"));
const chapters = manifest.chapters.map((entry) =>
	JSON.parse(readFileSync(join(ROOT, "course", entry.file), "utf8"))
);

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;

const rows = ["front,back,tag"];
for (const chapter of chapters) {
	if (!chapter.memory) {
		console.error(`${chapter.id} has no memory block — nothing to export`);
		process.exit(1);
	}
	for (const card of chapter.memory.cards) {
		rows.push(
			[card.q, `${card.a} (${card.hint})`, `${chapter.id}-${chapter.memory.device.kind}`]
				.map(quote)
				.join(",")
		);
	}
}

const lines = [
	"# Recall sheet — ERPNext Functional Consultant",
	"",
	"Ten laws in three buckets, then one device per chapter. Print this page, or import",
	"`cards.csv` into Anki or Quizlet for spaced repetition.",
	"",
	"## The ten laws",
	"",
];

for (const bucket of index.buckets) {
	lines.push(`### ${bucket.title}`, "", `_${bucket.summary}_`, "");
	index.laws
		.filter((law) => law.bucket === bucket.id)
		.forEach((law) => lines.push(`${law.n}. **${law.law}** ${law.detail}`));
	lines.push("");
}

lines.push(
	"## One device per chapter",
	"",
	"| # | Chapter | Device | Kind | Spine |",
	"| - | ------- | ------ | ---- | ----- |"
);
for (const chapter of chapters) {
	const memory = chapter.memory;
	lines.push(
		`| ${chapter.number} | ${chapter.title} | **${memory.device.label}** | ${memory.device.kind} | ${memory.spine} |`
	);
}

lines.push("", "## The cards", "");
for (const chapter of chapters) {
	lines.push(`### ${chapter.number}. ${chapter.title} — ${chapter.memory.device.label}`, "");
	for (const line of chapter.memory.device.expansion) {
		lines.push(`- ${line}`);
	}
	lines.push("");
	chapter.memory.cards.forEach((card, i) => lines.push(`${i + 1}. **${card.q}** ${card.a}`));
	lines.push("", `_Trap:_ ${chapter.memory.trap.what} ${chapter.memory.trap.why}`, "");
}

// Keep the markdown in the repo's prettier style so `npm run format:check` stays green.
const config = prettier.resolveConfig.sync(join(ROOT, "memory/cheatsheet.md")) ?? {};
const markdown = prettier.format(`${lines.join("\n")}\n`, { ...config, parser: "markdown" });

mkdirSync(join(ROOT, "memory"), { recursive: true });
writeFileSync(join(ROOT, "memory/cards.csv"), `${rows.join("\n")}\n`, "utf8");
writeFileSync(join(ROOT, "memory/cheatsheet.md"), markdown, "utf8");

console.log(
	`wrote memory/cards.csv (${rows.length - 1} cards) and memory/cheatsheet.md (${chapters.length} chapters)`
);
