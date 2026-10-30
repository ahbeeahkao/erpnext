// Drives the real deck in jsdom: boot, navigate, step tables, quiz, search, notes, audio, print.
// Run with `npm run smoke` (expects `npm install` to have produced jsdom).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = new URL("..", import.meta.url).pathname;
const failures = [];
let checks = 0;

function check(label, fn) {
	checks += 1;
	try {
		fn();
		console.log(`  ok   ${label}`);
	} catch (error) {
		failures.push(`${label}: ${error.message}`);
		console.log(`  FAIL ${label}\n       ${error.message}`);
	}
}

const html = readFileSync(join(ROOT, "index.html"), "utf8").replace(
	/<script[^>]*src="src\/app\.js"[^>]*><\/script>/,
	""
);

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
	if (!/Not implemented/.test(error.message)) {
		console.error("page error:", error.message);
	}
});

const dom = new JSDOM(html, {
	url: "http://localhost:8080/",
	pretendToBeVisual: true,
	virtualConsole,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.history = dom.window.history;
globalThis.localStorage = dom.window.localStorage;
for (const [key, value] of Object.entries({
	navigator: dom.window.navigator,
	location: dom.window.location,
	clearTimeout,
	setTimeout,
})) {
	Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
globalThis.__ERP_TUTORIAL_NO_AUTOBOOT__ = true;

const fetchFromDisk = async (path) => {
	try {
		const body = readFileSync(join(ROOT, path), "utf8");
		return { ok: true, status: 200, json: async () => JSON.parse(body) };
	} catch {
		return { ok: false, status: 404, json: async () => ({}) };
	}
};

const app = await import("../src/app.js");
const $ = (selector) => dom.window.document.querySelector(selector);
const $$ = (selector) => [...dom.window.document.querySelectorAll(selector)];

console.log("\nERPNext Functional Consultant — deck smoke test\n");

dom.window.localStorage.clear();
await app.boot({ fetch: fetchFromDisk });

const chapterOne = app.state.chapters[0];

check("boot loads all eight chapters", () => {
	assert.equal(app.state.chapters.length, 8);
	assert.equal(app.state.chapters[7].id, "ch08");
	assert.match(app.state.manifest.title, /Consultant/);
});

check("sidebar lists every chapter with its number", () => {
	const items = $$(".chapter-item");
	assert.equal(items.length, 8);
	assert.match(items[0].textContent, /01/);
	assert.match(items[7].textContent, /Reality|Volume 2/);
});

check("the first slide is the chapter intro", () => {
	assert.match($("#slide h1").textContent, new RegExp(chapterOne.title));
	assert.match($("#slide .kicker").textContent, /Chapter 1/);
	assert.ok($$(".outcomes li").length >= 4);
});

check("the primer opens with a concept table", () => {
	app.goTo(0, 1);
	const headers = $$("#slide table thead th").map((cell) => cell.textContent.trim());
	assert.deepEqual(headers, ["Idea", "What it means", "Where you meet it"]);
	assert.ok($$("#slide table tbody tr").length >= 4);
	assert.match($("#slide .kicker").textContent, /Concept 1/);
});

check("a volume lesson opens with a step table", () => {
	app.goTo(2, 1);
	const headers = $$("#slide table thead th").map((cell) => cell.textContent.trim());
	assert.deepEqual(headers, ["Step", "Do this", "Enter", "Expect to see"]);
	assert.ok($$("#slide table tbody tr").length >= 4);
	assert.match($("#slide .kicker").textContent, /Lesson 1/);
});

check("the following slide is the expected-outcome table", () => {
	app.goTo(2, 2);
	const headers = $$("#slide table thead th").map((cell) => cell.textContent.trim());
	assert.equal(headers[0], "Check");
	assert.equal(headers[1], "Expected value");
});

check("the counter knows the chapter length", () => {
	app.goTo(0, 0);
	const slides = app.slidesFor(chapterOne).length;
	assert.equal($("#counter").textContent, `1 / ${slides}`);
});

check("navigating to another chapter renders it and updates the hash", () => {
	app.goTo(6, 0);
	assert.match($("#crumbs").textContent, /Chapter 7/);
	assert.equal(dom.window.location.hash, "#ch07/0");
	assert.match($("#slide h1").textContent, /Quote to Cash/);
});

check("progress is recorded and persisted", () => {
	assert.ok(app.progressPercent() > 0);
	const stored = JSON.parse(dom.window.localStorage.getItem("erpnext-consultant/v1"));
	assert.ok(Object.keys(stored.visited).length >= 2);
});

check("the lab slide renders steps and a done criterion", () => {
	app.goTo(0, app.slidesFor(app.state.chapters[0]).length - 2);
	assert.ok($$(".steps li").length >= 6);
	assert.match($("#slide .callout").textContent, /Done when/i);
});

check("the quiz renders one card per question and marks answers", () => {
	app.goTo(0, app.slidesFor(app.state.chapters[0]).length - 1);
	const cards = $$(".quiz-card");
	assert.equal(cards.length, chapterOne.quiz.length);

	const firstQuestion = chapterOne.quiz[0];
	const clickedCorrect = [...cards[0].querySelectorAll(".quiz-option")][firstQuestion.answer];
	clickedCorrect.click();

	assert.match($$(".quiz-card")[0].textContent, /Question 1/);
	assert.ok($$(".quiz-card")[0].querySelector(".quiz-option.correct"));
	assert.ok($$(".quiz-why").length >= 1);
	assert.ok($(".quiz-score strong"));
});

check("answerQuiz reports correctness and score", () => {
	const result = app.answerQuiz("ch01", 1, chapterOne.quiz[1].answer);
	assert.equal(result.correct, true);
	assert.equal(result.score.answered, 2);
	assert.equal(result.score.correct, 2);
});

check("wrong answers are marked, not hidden", () => {
	const wrong = chapterOne.quiz[2].answer === 0 ? 1 : 0;
	app.answerQuiz("ch01", 2, wrong);
	const card = $$(".quiz-card")[2];
	assert.ok(card.querySelector(".quiz-option.wrong"));
	assert.ok(card.querySelector(".quiz-why"));
});

check("resetQuiz clears the chapter's answers", () => {
	const score = app.resetQuiz("ch01");
	assert.equal(score.answered, 0);
	assert.equal($$(".quiz-why").length, 0);
});

check("search finds steps by their content", () => {
	const results = app.searchSlides("credit limit");
	assert.ok(results.length >= 1);
	assert.ok(results.every((result) => typeof result.chapterIndex === "number"));
});

check("the search overlay lists results and navigates", () => {
	app.openOverlay("search");
	const input = $(".search-input");
	assert.ok(input);
	input.value = "credit limit";
	input.dispatchEvent(new dom.window.Event("input"));
	const results = $$(".result");
	assert.ok(results.length >= 1);
	const expected = app.searchSlides("credit limit")[0];
	results[0].click();
	assert.ok($("#overlay").open === false || !$("#overlay").hasAttribute("open"));
	assert.equal(app.state.chapterIndex, expected.chapterIndex);
	assert.equal(app.state.slideIndex, expected.slideIndex);
});

check("notes toggle reveals the speaker notes panel", () => {
	app.toggleNotes();
	assert.equal($("#notes").hidden, false);
	assert.match($("#notes").textContent, /Speaker notes/);
	app.toggleNotes();
	assert.equal($("#notes").hidden, true);
});

check("narration is wired to the chapter audio file", () => {
	assert.equal(app.state.audio.available, true);
	assert.match($("#narration").getAttribute("src"), /audio\/ch0\d\.mp3$/);
	assert.equal($("#btn-audio").disabled, false);
});

check("the transcript overlay shows the narration text", () => {
	app.goTo(0, 0);
	dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "t", bubbles: true }));
	assert.match($("#overlay-title").textContent, /Chapter 1 transcript/);
	const narration = app.currentChapter().narration.slice(0, 60);
	assert.ok($("#overlay-body").textContent.includes(narration));
	app.closeOverlay();
});

check("keyboard navigation moves the deck", () => {
	const before = app.state.slideIndex;
	dom.window.document.dispatchEvent(
		new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
	);
	assert.notEqual(app.state.slideIndex, before);
});

check("the print view contains every chapter, lab and quiz answer", () => {
	app.buildPrintView();
	const view = $("#print-view");
	assert.equal(view.querySelectorAll(".print-chapter").length, 8);
	assert.match(view.textContent, /Quiz with answers/);
	assert.match(view.textContent, /Answer:/);
});

check("resetProgress clears stored progress", () => {
	app.resetProgress();
	assert.equal(app.progressPercent(), 0);
});

console.log(`\n${checks - failures.length}/${checks} smoke checks passed`);
if (failures.length) {
	console.error("\nFailures:");
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}
