// ERPNext Functional Consultant — slide deck runtime.
//
// No framework: the course is JSON, the deck is a router plus a renderer. Everything is
// exported so the smoke test can drive the real UI in jsdom instead of re-implementing it.

const STORAGE_KEY = "erpnext-consultant/v1";
const COURSE_DIR = "course/";
const AUDIO_DIR = "audio/";

export const state = {
	manifest: null,
	chapters: [],
	chapterIndex: 0,
	slideIndex: 0,
	visited: {},
	quizAnswers: {},
	notesOpen: false,
	audioManifest: null,
	audio: { available: false, chapterId: null, playing: false, duration: 0 },
};

let dom = null;
let fetchImpl = null;

// ----------------------------------------------------------------------------- boot

export async function boot(options = {}) {
	fetchImpl = options.fetch ?? globalThis.fetch;
	dom = resolveDom();
	restore();

	const manifest = await getJson(`${COURSE_DIR}manifest.json`);
	state.manifest = manifest;
	state.chapters = await Promise.all(
		manifest.chapters.map(async (entry) => {
			const chapter = await getJson(`${COURSE_DIR}${entry.file}`);
			return { ...chapter, file: entry.file };
		})
	);

	state.audioManifest = await getJson(`${AUDIO_DIR}manifest.json`).catch(() => ({ chapters: {} }));

	bindEvents();
	renderSidebar();
	renderBrand();

	const [fromHashChapter, fromHashSlide] = parseHash();
	const startChapter = clamp(fromHashChapter ?? 0, 0, state.chapters.length - 1);
	const startSlide = clamp(fromHashSlide ?? 0, 0, slidesFor(state.chapters[startChapter]).length - 1);
	goTo(startChapter, startSlide, { push: false });
	return state;
}

function resolveDom() {
	return {
		sidebar: document.getElementById("sidebar"),
		chapterList: document.getElementById("chapter-list"),
		brandSub: document.getElementById("brand-sub"),
		progressText: document.getElementById("progress-text"),
		progressFill: document.getElementById("progress-fill"),
		crumbs: document.getElementById("crumbs"),
		slide: document.getElementById("slide"),
		notes: document.getElementById("notes"),
		stage: document.getElementById("stage"),
		deckbar: document.getElementById("counter"),
		counter: document.getElementById("counter"),
		btnPrev: document.getElementById("btn-prev"),
		btnNext: document.getElementById("btn-next"),
		btnMenu: document.getElementById("btn-menu"),
		btnGrid: document.getElementById("btn-grid"),
		btnNotes: document.getElementById("btn-notes"),
		btnSearch: document.getElementById("btn-search"),
		btnHelp: document.getElementById("btn-help"),
		btnPrint: document.getElementById("btn-print"),
		overlay: document.getElementById("overlay"),
		overlayTitle: document.getElementById("overlay-title"),
		overlayBody: document.getElementById("overlay-body"),
		overlayClose: document.getElementById("overlay-close"),
		printView: document.getElementById("print-view"),
		toast: document.getElementById("toast"),
		audioEl: document.getElementById("narration"),
		btnAudio: document.getElementById("btn-audio"),
		audioTitle: document.getElementById("audio-title"),
		audioTime: document.getElementById("audio-time"),
		audioSeek: document.getElementById("audio-seek"),
		btnTranscript: document.getElementById("btn-transcript"),
	};
}

async function getJson(path) {
	const response = await fetchImpl(path);
	if (!response.ok) {
		throw new Error(`Cannot load ${path} (HTTP ${response.status})`);
	}
	return response.json();
}

// ----------------------------------------------------------------------------- slide model

export function slidesFor(chapter) {
	return [
		{ type: "intro", chapter },
		...chapter.slides.map((slide) => ({ type: "content", slide, chapter })),
		{ type: "lab", lab: chapter.lab, chapter },
		{ type: "quiz", quiz: chapter.quiz, chapter },
	];
}

export function currentChapter() {
	return state.chapters[state.chapterIndex];
}

export function currentSlide() {
	const chapter = currentChapter();
	return chapter ? slidesFor(chapter)[state.slideIndex] : null;
}

export function totalSlides() {
	return state.chapters.reduce((sum, chapter) => sum + slidesFor(chapter).length, 0);
}

export function visitedCount() {
	return Object.values(state.visited).reduce((sum, list) => sum + new Set(list).size, 0);
}

export function progressPercent() {
	const total = totalSlides();
	return total ? Math.round((visitedCount() / total) * 100) : 0;
}

// ----------------------------------------------------------------------------- navigation

export function goTo(chapterIndex, slideIndex, { push = true } = {}) {
	if (!state.chapters.length) {
		return;
	}
	const chapter = state.chapters[clamp(chapterIndex, 0, state.chapters.length - 1)];
	const slides = slidesFor(chapter);
	const index = clamp(slideIndex, 0, slides.length - 1);

	const sameChapter = state.chapters[state.chapterIndex] === chapter;
	state.chapterIndex = state.chapters.indexOf(chapter);
	state.slideIndex = index;

	markVisited(chapter.id, index);
	renderSlide();
	renderSidebar();
	renderChrome();
	loadChapterAudio(chapter, { keepPlaying: sameChapter });

	if (push) {
		const hash = `#${chapter.id}/${index}`;
		if (globalThis.history?.replaceState) {
			globalThis.history.replaceState(null, "", hash);
		}
	}
	save();
	if (dom?.slide) {
		dom.slide.scrollTop = 0;
		dom.slide.focus({ preventScroll: true });
	}
}

export function next() {
	const slides = slidesFor(currentChapter());
	if (state.slideIndex < slides.length - 1) {
		goTo(state.chapterIndex, state.slideIndex + 1);
	} else if (state.chapterIndex < state.chapters.length - 1) {
		goTo(state.chapterIndex + 1, 0);
	}
}

export function prev() {
	if (state.slideIndex > 0) {
		goTo(state.chapterIndex, state.slideIndex - 1);
	} else if (state.chapterIndex > 0) {
		const previous = state.chapters[state.chapterIndex - 1];
		goTo(state.chapterIndex - 1, slidesFor(previous).length - 1);
	}
}

function parseHash() {
	const match = /#(ch\d+)\/(\d+)/.exec(globalThis.location?.hash ?? "");
	if (!match) {
		return [null, null];
	}
	const chapterIndex = state.chapters.findIndex((chapter) => chapter.id === match[1]);
	return chapterIndex >= 0 ? [chapterIndex, Number(match[2])] : [null, null];
}

// ----------------------------------------------------------------------------- rendering

function renderBrand() {
	const { manifest } = state;
	dom.brandSub.textContent = `${state.chapters.length} chapters · ${totalSlides()} slides · narrated`;
	document.title = `${manifest.title} — ${manifest.subtitle}`;
}

function renderSidebar() {
	dom.chapterList.textContent = "";
	state.chapters.forEach((chapter, index) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "chapter-item";
		button.dataset.chapter = chapter.id;
		if (index === state.chapterIndex) {
			button.setAttribute("aria-current", "true");
		}
		if (chapterVisited(chapter)) {
			button.classList.add("done");
		}

		const number = el("span", "chapter-num", String(chapter.number).padStart(2, "0"));
		const name = el("span", "chapter-name", chapter.title);
		const meta = el("span", "chapter-meta", chapterVisited(chapter) ? "done" : `${chapter.minutes}m`);
		button.append(number, name, meta);
		button.addEventListener("click", () => {
			goTo(index, 0);
			dom.sidebar.classList.remove("open");
		});
		dom.chapterList.append(button);
	});

	const percent = progressPercent();
	dom.progressText.textContent = `${percent}%`;
	dom.progressFill.style.width = `${percent}%`;
}

function renderChrome() {
	const chapter = currentChapter();
	const slides = slidesFor(chapter);
	dom.crumbs.textContent = `Chapter ${chapter.number} · ${chapter.title} · slide ${
		state.slideIndex + 1
	} of ${slides.length}`;
	dom.counter.textContent = `${state.slideIndex + 1} / ${slides.length}`;
	dom.btnPrev.disabled = state.chapterIndex === 0 && state.slideIndex === 0;
	dom.btnNext.disabled =
		state.chapterIndex === state.chapters.length - 1 && state.slideIndex === slides.length - 1;
	dom.btnNotes.setAttribute("aria-pressed", String(state.notesOpen));
	dom.stage.classList.toggle("with-notes", state.notesOpen);
	dom.notes.hidden = !state.notesOpen;
}

function renderSlide() {
	const slide = currentSlide();
	dom.slide.textContent = "";
	if (!slide) {
		return;
	}

	if (slide.type === "intro") {
		renderIntro(slide.chapter);
	} else if (slide.type === "content") {
		renderContent(slide.slide);
	} else if (slide.type === "lab") {
		renderLab(slide.lab, slide.chapter);
	} else {
		renderQuiz(slide.quiz, slide.chapter);
	}

	renderNotes(slide);
}

function renderIntro(chapter) {
	dom.slide.append(
		el("p", "kicker", `Chapter ${chapter.number} · ${chapter.level} · ${chapter.minutes} min`)
	);
	dom.slide.append(el("h1", "wide", chapter.title));
	dom.slide.append(el("p", "lede", chapter.subtitle));

	const meta = document.createElement("div");
	meta.className = "meta-row";
	meta.append(
		el("span", "chip", `${chapter.slides.length} slides`),
		el("span", "chip", `Lab · ${chapter.lab.minutes} min`),
		el("span", "chip", `${chapter.quiz.length} quiz questions`),
		el("span", "chip", chapter.level)
	);
	dom.slide.append(meta);

	dom.slide.append(el("p", "kicker", "You will be able to"));
	const outcomes = document.createElement("ul");
	outcomes.className = "outcomes";
	chapter.outcomes.forEach((outcome, index) => {
		const item = document.createElement("li");
		item.append(el("span", "", String(index + 1).padStart(2, "0")), el("span", "", outcome));
		outcomes.append(item);
	});
	dom.slide.append(outcomes, footnote());
}

function renderContent(slide) {
	dom.slide.append(el("p", "kicker", slide.kicker));
	dom.slide.append(el("h1", "", slide.title));

	if (slide.table) {
		dom.slide.append(buildTable(slide.table));
	}

	const bullets = document.createElement("ul");
	bullets.className = "bullets";
	slide.bullets.forEach((text) => bullets.append(el("li", "", text)));
	dom.slide.append(bullets);

	if (slide.callout) {
		dom.slide.append(buildCallout(slide.callout));
	}

	if (slide.paths?.length) {
		const chips = document.createElement("div");
		chips.className = "chips";
		slide.paths.forEach((path) => chips.append(el("span", "chip", path)));
		dom.slide.append(chips);
	}

	dom.slide.append(footnote());
}

function renderLab(lab, chapter) {
	dom.slide.append(el("p", "kicker", `Lab · chapter ${chapter.number} · ${lab.minutes} min`));
	dom.slide.append(el("h1", "wide", lab.title));

	const steps = document.createElement("ol");
	steps.className = "steps";
	lab.steps.forEach((step) => steps.append(el("li", "", step)));
	dom.slide.append(steps);

	dom.slide.append(buildCallout({ tone: "tip", title: "Done when", text: lab.done }));
	dom.slide.append(footnote());
}

function renderQuiz(quiz, chapter) {
	dom.slide.append(el("p", "kicker", `Check yourself · chapter ${chapter.number}`));
	dom.slide.append(el("h1", "", "Quiz"));
	dom.slide.append(el("p", "lede", "Answer to check your understanding. Every answer explains itself."));

	const wrapper = document.createElement("div");
	wrapper.className = "quiz";

	quiz.forEach((question, questionIndex) => {
		const card = document.createElement("section");
		card.className = "quiz-card";
		card.append(el("p", "quiz-index", `Question ${questionIndex + 1} of ${quiz.length}`));
		card.append(el("p", "quiz-q", question.question));

		const options = document.createElement("ul");
		options.className = "quiz-options";
		const answered = state.quizAnswers[chapter.id]?.[questionIndex];

		question.options.forEach((option, optionIndex) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "quiz-option";
			button.dataset.question = String(questionIndex);
			button.dataset.option = String(optionIndex);
			button.append(
				el("span", "letter", String.fromCharCode(65 + optionIndex)),
				el("span", "", option)
			);

			if (answered !== undefined) {
				button.disabled = true;
				if (optionIndex === question.answer) {
					button.classList.add("correct");
				}
				if (answered === optionIndex && optionIndex !== question.answer) {
					button.classList.add("wrong");
				}
			}

			button.addEventListener("click", () => answerQuiz(chapter.id, questionIndex, optionIndex));
			options.append(button);
		});

		card.append(options);
		if (answered !== undefined) {
			card.append(el("p", "quiz-why", question.why));
		}
		wrapper.append(card);
	});

	const score = quizScore(chapter.id);
	if (score.answered) {
		const banner = document.createElement("div");
		banner.className = "quiz-score";
		banner.append(el("strong", "", `${score.correct} / ${quiz.length}`));
		banner.append(
			el("span", "", score.answered === quiz.length ? "All questions answered." : "In progress.")
		);
		const reset = document.createElement("button");
		reset.type = "button";
		reset.className = "ghost";
		reset.textContent = "Reset answers";
		reset.addEventListener("click", () => resetQuiz(chapter.id));
		banner.append(reset);
		wrapper.append(banner);
	}

	dom.slide.append(wrapper, footnote());
}

function renderNotes(slide) {
	if (!state.notesOpen) {
		return;
	}
	dom.notes.textContent = "";
	dom.notes.append(el("h3", "", "Speaker notes"));
	dom.notes.append(el("p", "", slideNotes(slide)));
	if (slide.type === "content" && slide.slide.paths?.length) {
		dom.notes.append(el("h3", "", "Where to find it"));
		const list = document.createElement("ul");
		list.className = "help-list";
		slide.slide.paths.forEach((path) => list.append(el("li", "", path)));
		dom.notes.append(list);
	}
}

export function slideNotes(slide) {
	if (!slide) {
		return "";
	}
	if (slide.type === "content") {
		const { bullets, callout } = slide.slide;
		const lines = [slide.slide.notes];
		if (callout) {
			lines.push(`\n${callout.title}: ${callout.text}`);
		}
		lines.push(`\nKey points: ${bullets.map((bullet) => bullet.replace(/\.$/, "")).join("; ")}.`);
		return lines.join("\n");
	}
	if (slide.type === "intro") {
		return `Open the chapter by reading the outcomes aloud. The chapter takes about ${slide.chapter.minutes} minutes plus a ${slide.chapter.lab.minutes}-minute lab. Ask each learner to state which outcome they expect to struggle with; revisit that answer at the quiz.`;
	}
	if (slide.type === "lab") {
		return `Give the lab ${slide.lab.minutes} minutes, then debrief. Ask two people to show their screen and explain one step. The lab is written for a site you can break — never run it on production.`;
	}
	return `Let learners answer before revealing the explanation. Wrong answers on questions about document state and ledger behaviour are the most common; re-teach those from chapter 1.`;
}

function footnote() {
	const foot = document.createElement("div");
	foot.className = "slide-foot";

	const copy = document.createElement("button");
	copy.type = "button";
	copy.className = "ghost";
	copy.textContent = "Copy notes";
	copy.addEventListener("click", () => copyNotes());

	const hint = el("span", "chip", "P = notes · ← → = move · / = search");
	foot.append(copy, hint);
	return foot;
}

function buildTable(table) {
	const wrap = document.createElement("div");
	wrap.className = "table-wrap";
	const element = document.createElement("table");
	const head = document.createElement("thead");
	const headRow = document.createElement("tr");
	table.headers.forEach((header) => headRow.append(el("th", "", header)));
	head.append(headRow);
	const body = document.createElement("tbody");
	table.rows.forEach((row) => {
		const tr = document.createElement("tr");
		row.forEach((cell) => tr.append(el("td", "", cell)));
		body.append(tr);
	});
	element.append(head, body);
	wrap.append(element);
	return wrap;
}

function buildCallout({ tone = "tip", title, text }) {
	const box = document.createElement("div");
	box.className = `callout ${tone}`;
	box.append(el("p", "callout-label", title));
	box.append(el("p", "", text));
	return box;
}

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) {
		node.className = className;
	}
	if (text !== undefined) {
		node.textContent = text;
	}
	return node;
}

// ----------------------------------------------------------------------------- quiz

export function answerQuiz(chapterId, questionIndex, optionIndex) {
	const chapter = state.chapters.find((item) => item.id === chapterId);
	if (!chapter) {
		return null;
	}
	const question = chapter.quiz[questionIndex];
	if (!question) {
		return null;
	}
	state.quizAnswers[chapterId] = state.quizAnswers[chapterId] ?? {};
	state.quizAnswers[chapterId][questionIndex] = optionIndex;
	save();
	renderSlide();
	if (state.notesOpen) {
		renderNotes(currentSlide());
	}
	return {
		correct: optionIndex === question.answer,
		score: quizScore(chapterId),
		explanation: question.why,
	};
}

export function quizScore(chapterId) {
	const chapter = state.chapters.find((item) => item.id === chapterId);
	const answers = state.quizAnswers[chapterId] ?? {};
	const answered = Object.keys(answers).length;
	const correct = chapter
		? chapter.quiz.filter((question, index) => answers[index] === question.answer).length
		: 0;
	return { answered, correct, total: chapter ? chapter.quiz.length : 0 };
}

export function resetQuiz(chapterId) {
	delete state.quizAnswers[chapterId];
	save();
	renderSlide();
	return quizScore(chapterId);
}

// ----------------------------------------------------------------------------- search

export function searchSlides(query) {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return [];
	}
	const results = [];
	state.chapters.forEach((chapter, chapterIndex) => {
		slidesFor(chapter).forEach((slide, slideIndex) => {
			const haystack = slideSearchText(slide).toLowerCase();
			if (haystack.includes(needle)) {
				results.push({
					chapterId: chapter.id,
					chapterTitle: chapter.title,
					chapterIndex,
					slideIndex,
					title: slideTitle(slide),
					preview: previewText(slide),
				});
			}
		});
	});
	return results;
}

export function slideTitle(slide) {
	if (slide.type === "intro") return slide.chapter.title;
	if (slide.type === "content") return slide.slide.title;
	if (slide.type === "lab") return `Lab: ${slide.lab.title}`;
	return `Quiz: chapter ${slide.chapter.number}`;
}

function slideSearchText(slide) {
	if (slide.type === "intro") {
		return [slide.chapter.title, slide.chapter.subtitle, ...slide.chapter.outcomes].join(" ");
	}
	if (slide.type === "content") {
		const parts = [slide.slide.title, slide.slide.kicker, ...slide.slide.bullets, slide.slide.notes];
		if (slide.slide.callout) {
			parts.push(slide.slide.callout.title, slide.slide.callout.text);
		}
		if (slide.slide.table) {
			parts.push(...slide.slide.table.headers, ...slide.slide.table.rows.flat());
		}
		if (slide.slide.paths) {
			parts.push(...slide.slide.paths);
		}
		return parts.join(" ");
	}
	if (slide.type === "lab") {
		return [slide.lab.title, ...slide.lab.steps, slide.lab.done].join(" ");
	}
	return slide.quiz.map((question) => `${question.question} ${question.why}`).join(" ");
}

function previewText(slide) {
	if (slide.type === "content") {
		return slide.slide.bullets[0] ?? "";
	}
	if (slide.type === "intro") {
		return slide.chapter.subtitle;
	}
	if (slide.type === "lab") {
		return slide.lab.steps[0] ?? "";
	}
	return `${slide.quiz.length} questions`;
}

// ----------------------------------------------------------------------------- overlays

export function openOverlay(kind = "search") {
	if (!dom?.overlay) {
		return;
	}
	dom.overlayBody.textContent = "";

	if (kind === "search") {
		dom.overlayTitle.textContent = "Search the course";
		const input = document.createElement("input");
		input.className = "search-input";
		input.type = "search";
		input.placeholder = "Try: pricing rule, FIFO, payment ledger, landed cost…";
		input.setAttribute("aria-label", "Search the course");
		const list = document.createElement("ul");
		list.className = "result-list";
		const run = () => {
			list.textContent = "";
			const results = searchSlides(input.value).slice(0, 40);
			if (!results.length) {
				list.append(el("li", "result", input.value ? "No matching slide." : "Type to search."));
				return;
			}
			results.forEach((result) => {
				const item = document.createElement("li");
				const button = document.createElement("button");
				button.type = "button";
				button.className = "result";
				button.append(el("span", "", result.title));
				button.append(el("small", "", `Ch ${result.chapterIndex + 1} · ${result.chapterTitle}`));
				button.addEventListener("click", () => {
					closeOverlay();
					goTo(result.chapterIndex, result.slideIndex);
				});
				item.append(button);
				list.append(item);
			});
		};
		input.addEventListener("input", run);
		run();
		dom.overlayBody.append(input, list);
		openDialog();
		input.focus();
		return;
	}

	if (kind === "grid") {
		dom.overlayTitle.textContent = `Chapter ${currentChapter().number} · all slides`;
		const grid = document.createElement("div");
		grid.className = "grid-list";
		slidesFor(currentChapter()).forEach((slide, index) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "grid-item";
			if (index === state.slideIndex) {
				button.setAttribute("aria-current", "true");
			}
			button.append(el("span", "", String(index + 1).padStart(2, "0")));
			button.append(el("span", "", slideTitle(slide)));
			button.addEventListener("click", () => {
				closeOverlay();
				goTo(state.chapterIndex, index);
			});
			grid.append(button);
		});
		dom.overlayBody.append(grid);
		openDialog();
		return;
	}

	dom.overlayTitle.textContent = "Keyboard & course";
	const list = document.createElement("ul");
	list.className = "help-list";
	const shortcuts = [
		["→ Space", "Next slide (and next chapter)"],
		["←", "Previous slide"],
		["G", "Grid of slides in this chapter"],
		["P", "Toggle speaker notes"],
		["/", "Search every slide"],
		["A", "Play or pause chapter narration"],
		["T", "Transcript of the narration"],
		["F", "Fullscreen"],
		["?", "This panel"],
	];
	shortcuts.forEach(([keys, description]) => {
		const item = document.createElement("li");
		item.append(el("kbd", "", keys), el("span", "", description));
		list.append(item);
	});
	dom.overlayBody.append(list);
	dom.overlayBody.append(
		el(
			"p",
			"lede",
			`${state.chapters.length} chapters · ${totalSlides()} slides · progress is saved in this browser.`
		)
	);
	openDialog();
}

function openDialog() {
	if (!dom?.overlay) {
		return;
	}
	if (typeof dom.overlay.showModal === "function") {
		dom.overlay.showModal();
	} else {
		dom.overlay.setAttribute("open", "");
	}
}

export function closeOverlay() {
	if (!dom?.overlay) {
		return;
	}
	if (typeof dom.overlay.close === "function" && dom.overlay.open) {
		dom.overlay.close();
	} else {
		dom.overlay.removeAttribute("open");
	}
}

// ----------------------------------------------------------------------------- audio

function loadChapterAudio(chapter, { keepPlaying = false } = {}) {
	const entry = state.audioManifest?.chapters?.[chapter.id];
	const audio = dom?.audioEl;
	if (!audio) {
		return;
	}

	if (!entry?.file) {
		state.audio = { available: false, chapterId: chapter.id, playing: false, duration: 0 };
		audio.removeAttribute("src");
		audio.load?.();
		dom.btnAudio.disabled = true;
		dom.btnAudio.textContent = "▶";
		dom.audioTitle.textContent = `Chapter ${chapter.number} · narration not in this build`;
		dom.audioTime.textContent = "--:--";
		dom.audioSeek.value = "0";
		dom.audioSeek.disabled = true;
		return;
	}

	dom.btnAudio.disabled = false;
	dom.audioSeek.disabled = false;
	dom.audioTitle.textContent = `Chapter ${chapter.number} · ${
		entry.seconds ? formatTime(entry.seconds) : "narration"
	}`;
	dom.audioTime.textContent = "0:00";

	if (state.audio.chapterId === chapter.id && keepPlaying) {
		return;
	}
	if (!keepPlaying && !audio.paused) {
		audio.pause();
	}
	audio.src = `${AUDIO_DIR}${entry.file}`;
	state.audio = {
		available: true,
		chapterId: chapter.id,
		playing: false,
		duration: entry.seconds ?? 0,
	};
	dom.btnAudio.textContent = "▶";
	dom.audioSeek.value = "0";
}

export function toggleAudio() {
	const audio = dom?.audioEl;
	if (!audio || !state.audio.available) {
		return false;
	}
	if (audio.paused) {
		try {
			const playing = audio.play?.();
			playing?.catch?.(() => showToast("Your browser blocked playback — press play again."));
		} catch {
			showToast("This browser cannot play the narration here.");
		}
		return true;
	}
	audio.pause();
	return false;
}

function bindAudioEvents() {
	const audio = dom.audioEl;
	if (!audio) {
		return;
	}
	audio.addEventListener("play", () => {
		state.audio.playing = true;
		dom.btnAudio.textContent = "❙❙";
	});
	audio.addEventListener("pause", () => {
		state.audio.playing = false;
		dom.btnAudio.textContent = "▶";
	});
	audio.addEventListener("loadedmetadata", () => {
		state.audio.duration = Number.isFinite(audio.duration) ? audio.duration : state.audio.duration;
		dom.audioSeek.max = "100";
	});
	audio.addEventListener("timeupdate", () => {
		const duration = audio.duration || state.audio.duration || 0;
		dom.audioTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
		dom.audioSeek.value = duration ? String((audio.currentTime / duration) * 100) : "0";
	});
	audio.addEventListener("error", () => {
		state.audio.available = false;
		dom.btnAudio.disabled = true;
		dom.audioTitle.textContent = "Narration audio could not be loaded";
	});
	dom.btnAudio.addEventListener("click", toggleAudio);
	dom.audioSeek.addEventListener("input", () => {
		const duration = audio.duration || state.audio.duration;
		if (duration) {
			audio.currentTime = (Number(dom.audioSeek.value) / 100) * duration;
		}
	});
}

export function formatTime(seconds) {
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return "0:00";
	}
	const minutes = Math.floor(seconds / 60);
	const rest = Math.floor(seconds % 60);
	return `${minutes}:${String(rest).padStart(2, "0")}`;
}

// ----------------------------------------------------------------------------- print & export

export function buildPrintView() {
	if (!dom?.printView) {
		return;
	}
	dom.printView.textContent = "";
	state.chapters.forEach((chapter) => {
		const section = document.createElement("section");
		section.className = "print-chapter";
		section.append(el("h2", "", `Chapter ${chapter.number} · ${chapter.title}`));
		section.append(el("p", "", chapter.subtitle));

		const outcomes = document.createElement("ul");
		chapter.outcomes.forEach((outcome) => outcomes.append(el("li", "", outcome)));
		section.append(el("h3", "", "Learning outcomes"), outcomes);

		chapter.slides.forEach((slide) => {
			section.append(el("h3", "", slide.title));
			const bullets = document.createElement("ul");
			slide.bullets.forEach((bullet) => bullets.append(el("li", "", bullet)));
			section.append(bullets);
			if (slide.callout) {
				section.append(el("p", "", `${slide.callout.title}: ${slide.callout.text}`));
			}
			section.append(el("p", "", `Notes: ${slide.notes}`));
		});

		section.append(el("h3", "", `Lab · ${chapter.lab.minutes} minutes`), el("p", "", chapter.lab.title));
		const steps = document.createElement("ol");
		chapter.lab.steps.forEach((step) => steps.append(el("li", "", step)));
		section.append(steps, el("p", "", `Done when: ${chapter.lab.done}`));

		section.append(el("h3", "", "Quiz with answers"));
		const quiz = document.createElement("ol");
		chapter.quiz.forEach((question) => {
			const item = document.createElement("li");
			item.append(el("p", "", question.question));
			item.append(el("p", "", `Answer: ${question.options[question.answer]} — ${question.why}`));
			quiz.append(item);
		});
		section.append(quiz);

		dom.printView.append(section);
	});
}

export function printCourse() {
	buildPrintView();
	globalThis.print?.();
}

async function copyNotes() {
	const slide = currentSlide();
	const text = `# ${currentChapter().title}\n\n${slideTitle(slide)}\n\n${slideNotes(slide)}`;
	try {
		await globalThis.navigator?.clipboard?.writeText(text);
		showToast("Speaker notes copied.");
	} catch {
		showToast("Clipboard unavailable — open notes with P and select the text.");
	}
}

// ----------------------------------------------------------------------------- events & persistence

function bindEvents() {
	dom.btnNext.addEventListener("click", next);
	dom.btnPrev.addEventListener("click", prev);
	dom.btnNotes.addEventListener("click", toggleNotes);
	dom.btnGrid.addEventListener("click", () => openOverlay("grid"));
	dom.btnSearch.addEventListener("click", () => openOverlay("search"));
	dom.btnHelp.addEventListener("click", () => openOverlay("help"));
	dom.btnPrint.addEventListener("click", printCourse);
	dom.overlayClose.addEventListener("click", closeOverlay);
	dom.btnMenu.addEventListener("click", () => dom.sidebar.classList.toggle("open"));
	dom.btnTranscript.addEventListener("click", showTranscript);
	bindAudioEvents();

	document.addEventListener("keydown", onKeydown);
	const host = typeof globalThis.addEventListener === "function" ? globalThis : globalThis.window;
	host?.addEventListener?.("hashchange", () => {
		const [chapterIndex, slideIndex] = parseHash();
		if (chapterIndex !== null) {
			goTo(chapterIndex, slideIndex ?? 0, { push: false });
		}
	});
}

function onKeydown(event) {
	const target = event.target;
	const typing =
		target instanceof HTMLElement &&
		(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

	if (event.key === "Escape") {
		closeOverlay();
		dom.sidebar.classList.remove("open");
		return;
	}
	if (typing) {
		return;
	}
	if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
		event.preventDefault();
		next();
	} else if (event.key === "ArrowLeft" || event.key === "PageUp") {
		event.preventDefault();
		prev();
	} else if (event.key === "p" || event.key === "P") {
		toggleNotes();
	} else if (event.key === "g" || event.key === "G") {
		openOverlay("grid");
	} else if (event.key === "/") {
		event.preventDefault();
		openOverlay("search");
	} else if (event.key === "?") {
		openOverlay("help");
	} else if (event.key === "a" || event.key === "A") {
		toggleAudio();
	} else if (event.key === "t" || event.key === "T") {
		showTranscript();
	} else if (event.key === "f" || event.key === "F") {
		toggleFullscreen();
	}
}

export function toggleNotes() {
	state.notesOpen = !state.notesOpen;
	renderChrome();
	renderNotes(currentSlide());
	return state.notesOpen;
}

function toggleFullscreen() {
	const root = document.documentElement;
	if (document.fullscreenElement) {
		document.exitFullscreen?.();
	} else {
		root.requestFullscreen?.().catch(() => showToast("Fullscreen is not available here."));
	}
}

function showTranscript() {
	const chapter = currentChapter();
	const entry = state.audioManifest?.chapters?.[chapter.id];
	openOverlay("transcript");
	dom.overlayTitle.textContent = `Chapter ${chapter.number} transcript`;
	dom.overlayBody.textContent = "";
	dom.overlayBody.append(el("p", "lede", chapter.subtitle));
	dom.overlayBody.append(el("p", "", entry?.text ?? chapter.narration ?? "No narration recorded."));
	openDialog();
}

let toastTimer = null;
export function showToast(message) {
	if (!dom?.toast) {
		return;
	}
	dom.toast.textContent = message;
	dom.toast.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		dom.toast.hidden = true;
	}, 2600);
}

function markVisited(chapterId, slideIndex) {
	const list = state.visited[chapterId] ?? [];
	if (!list.includes(slideIndex)) {
		list.push(slideIndex);
	}
	state.visited[chapterId] = list;
}

function chapterVisited(chapter) {
	const slides = slidesFor(chapter).length;
	return new Set(state.visited[chapter.id] ?? []).size >= slides;
}

function save() {
	try {
		globalThis.localStorage?.setItem(
			STORAGE_KEY,
			JSON.stringify({
				chapter: state.chapters[state.chapterIndex]?.id,
				slide: state.slideIndex,
				visited: state.visited,
				quizAnswers: state.quizAnswers,
				notesOpen: state.notesOpen,
			})
		);
	} catch {
		// Private browsing or a full quota: progress is a convenience, not a requirement.
	}
}

function restore() {
	let stored = null;
	try {
		stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "null");
	} catch {
		stored = null;
	}
	if (!stored) {
		return;
	}
	state.visited = stored.visited ?? {};
	state.quizAnswers = stored.quizAnswers ?? {};
	state.notesOpen = Boolean(stored.notesOpen);
}

export function resetProgress() {
	state.visited = {};
	state.quizAnswers = {};
	state.notesOpen = false;
	save();
	renderSidebar();
	renderChrome();
	renderSlide();
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function reportBootError(error) {
	console.error(error);
	const target = document.getElementById("slide");
	if (target) {
		target.textContent = `The course could not be loaded: ${error.message}. Serve this folder over HTTP (npm run dev) rather than opening index.html from disk.`;
	}
}

if (typeof document !== "undefined" && !globalThis.__ERP_TUTORIAL_NO_AUTOBOOT__) {
	boot().catch(reportBootError);
}
