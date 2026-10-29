// Content gate for the course. These tests fail the build when a chapter is thin, a quiz
// answer points at nothing, or the narration and its audio manifest disagree.

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const exists = (path) => existsSync(join(ROOT, path));

const manifest = read("course/manifest.json");
const chapters = manifest.chapters.map((entry) => ({ ...read(`course/${entry.file}`), file: entry.file }));

const CALLOUT_TONES = new Set(["tip", "warn", "malaysia"]);
const MAX_NARRATION = 1500;

describe("course manifest", () => {
	it("describes a ten chapter course", () => {
		assert.equal(manifest.chapters.length, 10);
		assert.match(manifest.title, /ERPNext/);
		assert.ok(manifest.subtitle.length > 20);
	});

	it("lists chapters in order with sequential ids", () => {
		manifest.chapters.forEach((entry, index) => {
			assert.equal(entry.id, `ch${String(index + 1).padStart(2, "0")}`);
			assert.equal(entry.file, `${entry.id}.json`);
			assert.ok(exists(`course/${entry.file}`), `${entry.file} is missing`);
		});
	});

	it("has unique chapter ids and titles", () => {
		const ids = chapters.map((chapter) => chapter.id);
		const titles = chapters.map((chapter) => chapter.title);
		assert.equal(new Set(ids).size, ids.length);
		assert.equal(new Set(titles).size, titles.length);
	});
});

describe("chapter structure", () => {
	for (const chapter of chapters) {
		it(`${chapter.id} has complete metadata`, () => {
			assert.equal(chapter.number, Number(chapter.id.slice(2)));
			assert.ok(chapter.title.length >= 6, "title too short");
			assert.ok(chapter.subtitle.length >= 30, "subtitle too short");
			assert.ok(chapter.minutes >= 30, "chapter should budget at least 30 minutes");
			assert.ok(["Foundation", "Core", "Advanced", "Capstone"].includes(chapter.level));
			assert.ok(chapter.outcomes.length >= 4 && chapter.outcomes.length <= 6);
			chapter.outcomes.forEach((outcome) => assert.ok(outcome.length >= 25));
		});

		it(`${chapter.id} has 7-10 content slides with real teaching text`, () => {
			assert.ok(
				chapter.slides.length >= 7 && chapter.slides.length <= 10,
				`${chapter.slides.length} slides`
			);
			const titles = chapter.slides.map((slide) => slide.title);
			assert.equal(new Set(titles).size, titles.length, "duplicate slide title");

			for (const slide of chapter.slides) {
				assert.ok(slide.title.length >= 8, `weak title: ${slide.title}`);
				assert.ok(slide.kicker.length >= 3, `missing kicker on ${slide.title}`);
				assert.ok(
					slide.bullets.length >= 3 && slide.bullets.length <= 6,
					`bullets on ${slide.title}`
				);
				slide.bullets.forEach((bullet) => assert.ok(bullet.length >= 25, `thin bullet: ${bullet}`));
				assert.ok(slide.notes.length >= 150, `notes too short on ${slide.title}`);
			}
		});

		it(`${chapter.id} tables, callouts and paths are well formed`, () => {
			for (const slide of chapter.slides) {
				if (slide.table) {
					assert.ok(slide.table.headers.length >= 2);
					assert.ok(slide.table.rows.length >= 2);
					for (const row of slide.table.rows) {
						assert.equal(
							row.length,
							slide.table.headers.length,
							`ragged table on ${slide.title}`
						);
						row.forEach((cell) => assert.equal(typeof cell, "string"));
					}
				}
				if (slide.callout) {
					assert.ok(CALLOUT_TONES.has(slide.callout.tone), `bad tone on ${slide.title}`);
					assert.ok(slide.callout.title.length >= 4);
					assert.ok(slide.callout.text.length >= 25);
				}
				if (slide.paths) {
					assert.ok(slide.paths.length >= 1);
					slide.paths.forEach((path) => assert.ok(path.length >= 5));
				}
			}
		});

		it(`${chapter.id} has a lab you can actually run`, () => {
			assert.ok(chapter.lab.title.length >= 10);
			assert.ok(chapter.lab.minutes >= 20);
			assert.ok(chapter.lab.steps.length >= 5, "a lab needs at least five steps");
			chapter.lab.steps.forEach((step) => assert.ok(step.length >= 20));
			assert.ok(chapter.lab.done.length >= 30, "the lab needs a done criterion");
		});

		it(`${chapter.id} has five sound quiz questions`, () => {
			assert.ok(chapter.quiz.length >= 5, `${chapter.quiz.length} questions`);
			for (const question of chapter.quiz) {
				assert.ok(question.question.length >= 20);
				assert.equal(question.options.length, 4, `options: ${question.question}`);
				assert.equal(new Set(question.options).size, 4, "duplicate options");
				assert.ok(Number.isInteger(question.answer));
				assert.ok(question.answer >= 0 && question.answer < question.options.length);
				assert.ok(question.why.length >= 40, `explanation too short: ${question.question}`);
			}
			const questions = chapter.quiz.map((question) => question.question);
			assert.equal(new Set(questions).size, questions.length, "duplicate question");
		});
	}
});

describe("narration", () => {
	for (const chapter of chapters) {
		it(`${chapter.id} narration fits one speech clip`, () => {
			const text = chapter.narration;
			assert.ok(text.length >= 700, `${text.length} characters is too short for a 3-minute chapter`);
			assert.ok(
				text.length <= MAX_NARRATION,
				`${text.length} characters exceeds the ${MAX_NARRATION} limit`
			);
			assert.match(text, /[.!?]$/, "narration should end with punctuation");
			assert.doesNotMatch(text, /\n/, "narration should be a single paragraph");
			assert.doesNotMatch(text, /TODO|TBD|lorem/i);
		});
	}

	it("covers the chapter's own subject in the narration", () => {
		for (const chapter of chapters) {
			const words = chapter.title.toLowerCase().match(/[a-z]{5,}/g) ?? [];
			const narration = chapter.narration.toLowerCase();
			assert.ok(
				words.some((word) => narration.includes(word)),
				`${chapter.id} narration never mentions any of ${words.join(", ")}`
			);
		}
	});
});

describe("audio", () => {
	const audio = read("audio/manifest.json");

	it("has an entry for every chapter, with the exact narration text", () => {
		for (const chapter of chapters) {
			const entry = audio.chapters[chapter.id];
			assert.ok(entry, `${chapter.id} has no audio entry`);
			assert.equal(entry.file, `${chapter.id}.mp3`);
			assert.equal(
				entry.text,
				chapter.narration,
				`${chapter.id} transcript drifted from the narration`
			);
			assert.equal(entry.chars, chapter.narration.length);
			assert.equal(entry.voice, audio.voice);
		}
	});

	it("points at audio files that exist and are not empty", () => {
		for (const chapter of chapters) {
			const entry = audio.chapters[chapter.id];
			const path = join(ROOT, "audio", entry.file);
			assert.ok(existsSync(path), `${entry.file} is missing`);
			assert.ok(statSync(path).size > 20_000, `${entry.file} looks truncated`);
		}
	});
});

describe("course as a whole", () => {
	it("is substantial enough to be called complete", () => {
		const slides = chapters.reduce((sum, chapter) => sum + chapter.slides.length, 0);
		const quizQuestions = chapters.reduce((sum, chapter) => sum + chapter.quiz.length, 0);
		const labSteps = chapters.reduce((sum, chapter) => sum + chapter.lab.steps.length, 0);
		const minutes = chapters.reduce((sum, chapter) => sum + chapter.minutes + chapter.lab.minutes, 0);
		assert.ok(slides >= 75, `${slides} content slides`);
		assert.ok(quizQuestions >= 50, `${quizQuestions} quiz questions`);
		assert.ok(labSteps >= 50, `${labSteps} lab steps`);
		assert.ok(minutes >= 800, `${minutes} minutes of syllabus`);
	});

	it("touches every major ERPNext module", () => {
		const corpus = JSON.stringify(chapters).toLowerCase();
		for (const term of [
			"quotation",
			"sales order",
			"delivery note",
			"purchase order",
			"purchase receipt",
			"stock ledger",
			"journal entry",
			"work order",
			"bill of materials",
			"asset",
			"quality inspection",
			"opportunity",
			"workflow",
			"myinvois",
			"sst",
		]) {
			assert.ok(corpus.includes(term), `the course never mentions ${term}`);
		}
	});

	it("documents the course in the README", () => {
		const readme = readFileSync(join(ROOT, "README.md"), "utf8");
		assert.ok(readme.length > 3000, "README is too thin");
		for (const chapter of chapters) {
			assert.ok(readme.includes(chapter.title), `README does not mention ${chapter.title}`);
		}
		assert.match(readme, /npm run dev/);
	});
});
