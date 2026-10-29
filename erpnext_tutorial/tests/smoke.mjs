// Drives the real deck in jsdom: boot, navigate, quiz, search, notes, audio wiring, print.
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
	// Media playback is not implemented in jsdom; the deck must survive that, not crash.
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

console.log("\nMastering ERPNext — deck smoke test\n");

dom.window.localStorage.clear();
await app.boot({ fetch: fetchFromDisk });

const chapterOne = app.state.chapters[0];

check("boot loads all ten chapters", () => {
	assert.equal(app.state.chapters.length, 10);
	assert.equal(app.state.chapters[9].id, "ch10");
});

check("sidebar lists every chapter with its number", () => {
	const items = $$(".chapter-item");
	assert.equal(items.length, 10);
	assert.match(items[0].textContent, /01/);
	assert.match(items[9].textContent, /Capstone|Going Live/);
});

check("the first slide is the chapter intro", () => {
	assert.match($("#slide h1").textContent, new RegExp(chapterOne.title));
	assert.match($("#slide .kicker").textContent, /Chapter 1/);
	assert.ok($$(".outcomes li").length >= 4);
});

check("the counter knows the chapter length", () => {
	const slides = app.slidesFor(chapterOne).length;
	assert.equal($("#counter").textContent, `1 / ${slides}`);
});

check("next() advances to the first content slide", () => {
	app.next();
	assert.equal(app.state.slideIndex, 1);
	assert.match($("#slide .kicker").textContent, /Orientation|Anatomy|Setup|Navigation|Malaysia|Practice/);
	assert.ok($$(".bullets li").length >= 3);
});

check("navigating to another chapter renders it and updates the hash", () => {
	app.goTo(2, 0);
	assert.match($("#crumbs").textContent, /Chapter 3/);
	assert.equal(dom.window.location.hash, "#ch03/0");
	assert.match($("#slide h1").textContent, /Selling|Order to Cash/);
});

check("progress is recorded and persisted", () => {
	assert.ok(app.progressPercent() > 0);
	const stored = JSON.parse(dom.window.localStorage.getItem("erpnext-tutorial/v1"));
	assert.ok(Object.keys(stored.visited).length >= 2);
});

check("the lab slide renders steps and a done criterion", () => {
	app.goTo(0, app.slidesFor(app.state.chapters[0]).length - 2);
	assert.ok($$(".steps li").length >= 5);
	assert.match($("#slide .callout").textContent, /Done when/i);
});

check("the quiz renders one card per question and marks answers", () => {
	app.goTo(0, app.slidesFor(app.state.chapters[0]).length - 1);
	const cards = $$(".quiz-card");
	assert.equal(cards.length, chapterOne.quiz.length);

	const firstOption = cards[0].querySelector(".quiz-option");
	const firstQuestion = chapterOne.quiz[0];
	const clickedCorrect = [...cards[0].querySelectorAll(".quiz-option")][firstQuestion.answer];
	clickedCorrect.click();

	assert.match($$(".quiz-card")[0].textContent, new RegExp("Question 1"));
	assert.ok($$(".quiz-card")[0].querySelector(".quiz-option.correct"), "correct option highlighted");
	assert.ok($$(".quiz-why").length >= 1, "explanation shown");
	assert.ok($(".quiz-score strong"), "score banner rendered");
	assert.ok(firstOption);
});

check("answerQuiz reports correctness and score", () => {
	const result = app.answerQuiz("ch01", 1, chapterOne.quiz[1].answer);
	assert.equal(result.correct, true);
	assert.equal(result.score.answered, 2);
	assert.equal(result.score.correct, 2);
});

check("wrong answers are marked, not hidden", () => {
	app.answerQuiz("ch01", 2, 0);
	const card = $$(".quiz-card")[2];
	assert.ok(card.querySelector(".quiz-option.wrong") || chapterOne.quiz[2].answer === 0);
	assert.ok(card.querySelector(".quiz-why"));
});

check("resetQuiz clears the chapter's answers", () => {
	const score = app.resetQuiz("ch01");
	assert.equal(score.answered, 0);
	assert.equal($$(".quiz-why").length, 0);
});

check("search finds slides by their content", () => {
	const results = app.searchSlides("payment ledger");
	assert.ok(results.length >= 1);
	assert.ok(results.every((result) => typeof result.chapterIndex === "number"));
});

check("the search overlay lists results and navigates", () => {
	app.openOverlay("search");
	const input = $(".search-input");
	assert.ok(input, "search input rendered");
	input.value = "stock reconciliation";
	input.dispatchEvent(new dom.window.Event("input"));
	const results = $$(".result");
	assert.ok(results.length >= 1);
	const chapterBefore = app.state.chapterIndex;
	results[0].click();
	assert.ok($("#overlay").open === false || !$("#overlay").hasAttribute("open"));
	assert.notEqual(
		`${app.state.chapterIndex}:${chapterBefore}`,
		`${chapterBefore}:${app.state.chapterIndex}`
	);
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
	assert.ok($("#overlay-body").textContent.includes(narration), "transcript shows the chapter narration");
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
	assert.equal(view.querySelectorAll(".print-chapter").length, 10);
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
