// Content gate for the consultant course. These tests fail the build when a lesson stops being
// step-by-step, when a quiz answer points at nothing, when a narration drifts from its audio, or
// when the deck and the sample data pack stop agreeing on the arithmetic.

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const text = (path) => readFileSync(join(ROOT, path), "utf8");
const exists = (path) => existsSync(join(ROOT, path));
const digits = (value) => value.replace(/,/g, "");

const manifest = read("course/manifest.json");
const chapters = manifest.chapters.map((entry) => ({ ...read(`course/${entry.file}`), file: entry.file }));
const corpus = JSON.stringify(chapters);

describe("course manifest", () => {
	it("describes a consultant course with a volume roadmap", () => {
		assert.match(manifest.title, /Consultant/);
		assert.equal(manifest.chapters.length, 8);
		assert.ok(manifest.sample_company.includes("Seri Murni"));
		assert.ok(manifest.volumes.length >= 10, `${manifest.volumes.length} volumes listed`);
		const built = manifest.volumes.filter((volume) => volume.status === "built");
		const planned = manifest.volumes.filter((volume) => volume.status === "planned");
		assert.equal(built.length, 5, "two primers and three volumes are built");
		assert.ok(planned.length >= 8, "the remaining volumes are declared as planned");
		for (const volume of built) {
			assert.ok(volume.chapters.length >= 1, `${volume.id} needs chapters`);
			for (const id of volume.chapters) {
				assert.ok(
					manifest.chapters.some((entry) => entry.id === id),
					`${volume.id} references missing chapter ${id}`
				);
			}
		}
	});

	it("lists chapters in order with sequential ids", () => {
		manifest.chapters.forEach((entry, index) => {
			assert.equal(entry.id, `ch${String(index + 1).padStart(2, "0")}`);
			assert.equal(entry.file, `${entry.id}.json`);
			assert.ok(exists(`course/${entry.file}`), `${entry.file} is missing`);
		});
	});
});

describe("lesson structure", () => {
	for (const chapter of chapters) {
		it(`${chapter.id} has complete metadata`, () => {
			assert.equal(chapter.number, Number(chapter.id.slice(2)));
			assert.ok(chapter.title.length >= 6);
			assert.ok(chapter.subtitle.length >= 30);
			assert.ok(chapter.minutes >= 30);
			assert.ok(["Primer", "Foundation", "Core", "Advanced", "Capstone"].includes(chapter.level));
			assert.ok(chapter.outcomes.length >= 4 && chapter.outcomes.length <= 6);
			chapter.outcomes.forEach((outcome) => assert.ok(outcome.length >= 25));
		});

		it(`${chapter.id} is step-by-step, not prose`, () => {
			assert.ok(
				chapter.slides.length >= 7 && chapter.slides.length <= 10,
				`${chapter.slides.length} slides`
			);
			const titles = chapter.slides.map((slide) => slide.title);
			assert.equal(new Set(titles).size, titles.length, "duplicate slide title");

			for (const slide of chapter.slides) {
				assert.match(slide.kicker, /^Lesson \d+|^Concept \d+|^Volume/, `kicker on ${slide.title}`);
				assert.ok(
					slide.table,
					`${chapter.id} "${slide.title}" has no Do/Enter/Expect or Check table`
				);
				assert.ok(slide.table.headers.length >= 3, `thin table on ${slide.title}`);
				assert.ok(slide.table.rows.length >= 4, `short table on ${slide.title}`);
				for (const row of slide.table.rows) {
					assert.equal(row.length, slide.table.headers.length, `ragged table on ${slide.title}`);
					row.forEach((cell) => assert.equal(typeof cell, "string"));
				}
				// Checklist slides legitimately carry more than six items.
				assert.ok(slide.bullets.length >= 3 && slide.bullets.length <= 10, `bullets: ${slide.title}`);
				slide.bullets.forEach((bullet) => assert.ok(bullet.length >= 25, `thin bullet: ${bullet}`));
				assert.ok(slide.notes.length >= 150, `notes too short on ${slide.title}`);
			}
		});

		it(`${chapter.id} teaches a procedure then proves it`, () => {
			// Primers are concept-first: they carry one worked procedure and at least one proof table.
			const required = chapter.level === "Primer" ? 1 : 2;
			const setup = chapter.slides.filter((slide) => slide.table.headers[0] === "Step");
			const checks = chapter.slides.filter((slide) => slide.table.headers[0] === "Check");
			assert.ok(setup.length >= required, `${chapter.id} needs at least ${required} step tables`);
			assert.ok(checks.length >= required, `${chapter.id} needs at least ${required} check tables`);
			for (const slide of setup) {
				assert.ok(
					slide.table.headers.some((header) => header.startsWith("Expect")),
					`${slide.title} lacks an Expect column`
				);
			}
			for (const slide of checks) {
				assert.ok(
					slide.table.headers.includes("Expected value"),
					`${slide.title} lacks an expected value column`
				);
			}
		});

		it(`${chapter.id} has a lab with a done criterion`, () => {
			assert.ok(chapter.lab.title.length >= 10);
			assert.ok(chapter.lab.minutes >= 20);
			assert.ok(chapter.lab.steps.length >= 6, "a lab needs at least six steps");
			chapter.lab.steps.forEach((step) => assert.ok(step.length >= 20));
			assert.ok(chapter.lab.done.length >= 30);
		});

		it(`${chapter.id} has five sound quiz questions`, () => {
			assert.equal(chapter.quiz.length, 5);
			for (const question of chapter.quiz) {
				assert.equal(question.options.length, 4);
				assert.equal(new Set(question.options).size, 4);
				assert.ok(question.answer >= 0 && question.answer < 4);
				assert.ok(question.why.length >= 40);
			}
		});
	}
});

describe("narration", () => {
	for (const chapter of chapters) {
		it(`${chapter.id} narration fits one speech clip`, () => {
			const narration = chapter.narration;
			assert.ok(narration.length >= 900, `${narration.length} characters is too short`);
			assert.ok(narration.length <= 1500, `${narration.length} characters exceeds the clip limit`);
			assert.match(narration, /[.!?]$/);
			assert.doesNotMatch(narration, /\n/);
		});
	}
});

describe("audio", () => {
	const audioManifest = () => {
		assert.ok(
			exists("audio/manifest.json"),
			"audio/manifest.json is missing — run `node scripts/audio-manifest.mjs`"
		);
		return read("audio/manifest.json");
	};

	it("matches the narration text chapter by chapter", () => {
		const audio = audioManifest();
		for (const chapter of chapters) {
			const entry = audio.chapters[chapter.id];
			assert.ok(entry, `${chapter.id} has no audio entry`);
			assert.equal(entry.text, chapter.narration, `${chapter.id} transcript drifted`);
			assert.equal(entry.chars, chapter.narration.length);
		}
	});

	it("points at audio files that exist and are not truncated", () => {
		const audio = audioManifest();
		for (const chapter of chapters) {
			const path = join(ROOT, "audio", audio.chapters[chapter.id].file);
			assert.ok(existsSync(path), `${chapter.id}.mp3 is missing`);
			assert.ok(statSync(path).size > 20_000, `${chapter.id}.mp3 looks truncated`);
		}
	});
});

describe("sample data pack", () => {
	it("ships the masters, prices and the document register", () => {
		for (const file of [
			"items.csv",
			"customers.csv",
			"suppliers.csv",
			"price-lists.csv",
			"documents.csv",
		]) {
			assert.ok(exists(`samples/${file}`), `samples/${file} is missing`);
			const header = text(`samples/${file}`).split("\n")[0];
			assert.ok(header.split(",").length >= 5, `${file} needs real columns`);
		}
		assert.ok(exists("samples/expected-outcomes.json"));
		assert.ok(exists("samples/README.md"));
	});

	it("agrees with the arithmetic taught in the deck", () => {
		const expected = read("samples/expected-outcomes.json");
		const deck = digits(corpus);
		const figures = [
			expected.cycles.sale.amounts.total,
			expected.cycles.sale.amounts.tax,
			expected.cycles.sale.reports.gross_profit,
			expected.cycles.partial_delivery.amounts.total,
			expected.cycles.discount.amounts.total,
			expected.cycles.discount.amounts.tax,
			expected.cycles.return.amounts.net.replace("-", ""),
			expected.cycles.pricing_rule.expected_rate,
			expected.cycles.pricing_rule.expected_net_for_ten,
		];
		for (const figure of figures) {
			assert.ok(deck.includes(digits(figure)), `the deck never shows ${figure}`);
		}
	});

	it("keeps the document register consistent with the cycles", () => {
		const rows = text("samples/documents.csv").trim().split("\n").slice(1);
		const expected = read("samples/expected-outcomes.json");
		assert.equal(rows.length, 9, "nine walkthrough documents are registered");
		assert.ok(
			manifest.sample_company.startsWith(expected.company),
			"the manifest and the data pack describe the same sample company"
		);
		for (const row of rows) {
			assert.equal(row.split(",").length, 11, `column count in: ${row.slice(0, 40)}`);
		}
	});
});

describe("course as a whole", () => {
	it("is a consultant-grade volume set", () => {
		const slides = chapters.reduce((sum, chapter) => sum + chapter.slides.length, 0);
		const steps = chapters.reduce((sum, chapter) => sum + chapter.lab.steps.length, 0);
		const minutes = chapters.reduce((sum, chapter) => sum + chapter.minutes + chapter.lab.minutes, 0);
		const tables = chapters.reduce(
			(sum, chapter) => sum + chapter.slides.filter((slide) => slide.table).length,
			0
		);
		assert.ok(slides >= 70, `${slides} teaching slides`);
		assert.ok(steps >= 50, `${steps} lab steps`);
		assert.ok(minutes >= 900, `${minutes} minutes of syllabus`);
		assert.equal(tables, slides, "every teaching slide carries a table");
	});

	it("covers the functional consultant ground of volumes 0 to 2", () => {
		for (const term of [
			"chart of accounts",
			"cost center",
			"item tax template",
			"uom conversion",
			"user permission",
			"naming series",
			"quotation",
			"sales order",
			"delivery note",
			"sales invoice",
			"payment entry",
			"credit note",
			"pricing rule",
			"credit limit",
			"stock ledger",
			"general ledger",
			"payment ledger",
			"gross profit",
			"sst",
			"fifo",
		]) {
			assert.ok(corpus.toLowerCase().includes(term.toLowerCase()), `the course never mentions ${term}`);
		}
	});

	it("documents every chapter in the README", () => {
		const readme = text("README.md");
		assert.ok(readme.length > 3000);
		for (const chapter of chapters) {
			assert.ok(readme.includes(chapter.title), `README does not mention ${chapter.title}`);
		}
		assert.match(readme, /npm run dev/);
	});
});
