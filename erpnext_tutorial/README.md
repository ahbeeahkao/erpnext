# Mastering ERPNext — a complete narrated course

Ten chapters, 80 teaching slides, ten hands-on labs, fifty quiz questions with explanations, and
chapter-by-chapter narration you can play while you read. It runs from a folder: no build step, no
account, no internet connection once the audio is local.

Built for people who will actually run an ERPNext site: implementers, finance leads, operations
managers and power users who are tired of feature tours and want to know what a transaction does to
the ledgers.

```bash
cd erpnext_tutorial
npm install
npm run dev          # http://localhost:8080
npm run check        # lint + format + content tests + jsdom smoke
```

---

## Why a narrated deck and not screen recordings

This course was written inside a sandbox with **no Frappe bench, no database and no browser** — so
recording a real ERPNext session was impossible. Rather than ship an inferior "slides only" product
or fake a screencast, the course is a self-contained deck with:

-   a **full speaker script** on every slide (`P`),
-   **generated narration** per chapter (`A`), with the transcript in the deck (`T`),
-   **labs** that tell you exactly what to click and what to check,
-   **quizzes** that explain why the wrong answers are wrong.

Every instruction is written against ERPNext v15/v16 DocTypes and field names, and the Malaysian
chapter is written against the apps in this repository. Where something must be verified on a live
site (API payloads, LHDN responses), the course says so rather than guessing.

---

## The syllabus

| #   | Chapter                               | Level      | Time   | What you can do afterwards                                                   |
| --- | ------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------- |
| 1   | How ERPNext Thinks                    | Foundation | 40 min | Explain DocTypes, document states and the three ledgers; bootstrap a company |
| 2   | Masters That Decide Everything        | Foundation | 45 min | Model items, parties, prices and SST-correct tax templates                   |
| 3   | Selling: Order to Cash                | Core       | 50 min | Run quote → order → delivery → invoice → payment, with returns               |
| 4   | Buying: Procure to Pay                | Core       | 45 min | Run requisition → order → receipt → bill → payment, with three-way matching  |
| 5   | Stock Accuracy and Valuation          | Core       | 50 min | Read the stock ledger, choose a valuation method, count safely               |
| 6   | Accounting Mastery and the Close      | Advanced   | 55 min | Design a chart of accounts, post the six journal patterns, close a month     |
| 7   | Manufacturing                         | Advanced   | 50 min | Build a BOM, run work orders, prove a unit cost, subcontract                 |
| 8   | Projects, Assets, Quality and CRM     | Advanced   | 45 min | Bill projects, run a fixed-asset register, gate quality, forecast a pipeline |
| 9   | Automation, Customisation and Control | Advanced   | 50 min | Customise safely, build approvals, decide script vs app, keep it fast        |
| 10  | Going Live in Malaysia                | Capstone   | 60 min | Cut over, load opening balances, configure SST and MyInvois, run hypercare   |

Total syllabus: **17 hours**, of which about 9 hours is lab time. The deck itself is 110 slides
(80 teaching slides plus a chapter intro, a lab and a quiz per chapter).

Each chapter follows the same shape: outcomes → 8 teaching slides (with field maps, callouts and
"where to find it" menu paths) → a lab with a done-criterion → five quiz questions with
explanations.

---

## Running the deck

| Script          | What it does                                                                              |
| --------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`   | Static server on `0.0.0.0:8080` with range requests for audio                             |
| `npm run check` | lint → prettier check → content tests → jsdom smoke test                                  |
| `npm test`      | Content gate only (structure, quiz integrity, narration/audio agreement)                  |
| `npm run smoke` | Drives the real UI in jsdom: navigation, quiz scoring, search, notes, audio wiring, print |

### Keyboard

`→`/`Space` next · `←` previous · `G` slide grid · `P` speaker notes · `/` search · `A` narration ·
`T` transcript · `F` fullscreen · `?` help · `Esc` close.

### What is in the UI

-   **Progress** per chapter and course-wide, stored in `localStorage` (no account, no server).
-   **Speaker notes** panel with the script, the key points and the menu paths for the slide.
-   **Search** across every slide, lab step and quiz explanation — the fastest way to answer
    "where did the course say that?"
-   **Narration bar** with seek, per-chapter transcript, and a clear "not in this build" state if an
    audio file is missing.
-   **Print / PDF** builds a full workbook: outcomes, bullets, callouts, notes, lab steps and quiz
    answers with explanations, one chapter per section.

---

## Repository layout

```
erpnext_tutorial/
├── index.html                 # deck shell
├── styles.css                 # dark studio theme + print stylesheet
├── src/app.js                 # router, renderer, quiz, search, audio, print (no framework)
├── course/
│   ├── manifest.json          # chapter order
│   └── ch01.json … ch10.json  # slides, labs, quizzes, narration (single source of truth)
├── audio/
│   ├── manifest.json          # transcript + file per chapter (generated)
│   └── ch01.mp3 … ch10.mp3    # narration
├── scripts/
│   ├── serve.mjs              # zero-dependency static server (range requests)
│   └── audio-manifest.mjs     # rebuilds audio/manifest.json from course/*.json + mp3s
└── tests/
    ├── course.test.mjs        # 40+ content assertions
    └── smoke.mjs              # 20 UI checks in jsdom
```

**The JSON is the source of truth.** Slides, lab, quiz and narration live in `course/ch*.json`; the
deck, the print view and the audio transcript are all rendered from it. Change a narration paragraph
and the content test fails until the transcript and audio are regenerated — which is exactly the
behaviour you want from a course that will be updated as ERPNext changes.

---

## Regenerating narration

Audio is generated per chapter from the `narration` field (each chapter is one clip under 1,500
characters, roughly 1.5–2 minutes). After editing narration text:

1. Regenerate the mp3 for that chapter into `audio/chNN.mp3`.
2. `node scripts/audio-manifest.mjs` to rewrite `audio/manifest.json`.
3. `npm test` — the transcript-equals-narration assertion will fail if you skipped a step.

The narration is a spoken summary of the chapter, deliberately denser than a read-aloud of the
slides: it is the thing you can play in a car, while the slides carry the field-level detail.

---

## Using this as an instructor

-   **Two-day workshop**: chapters 1–2 and 6 on day one (setup and money), chapters 3–5 and 7 on day
    two (operations), with chapters 8–10 as pre-reading.
-   **Self-paced**: one chapter per sitting, lab included. The quiz is the gate: five out of five
    before moving on, since every wrong answer points back at the slide to re-read.
-   **Onboarding a team**: assign chapters by role — sales, purchasing, warehouse, accounts — then run
    the capstone lab together on a staging site.
-   **Print the workbook**: the print view is a complete handout with notes and answers; give learners
    the slides-only PDF and keep the answers.

---

## Verification

| Check                                                                                                                                       | Result     |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `npm test` — structure, 80 slides, quiz integrity, table shape, narration limits, audio/transcript agreement, README coverage               | see CI log |
| `npm run smoke` — boots the deck in jsdom and exercises navigation, quiz scoring, search, notes, transcript, print and progress persistence | 20 checks  |
| `ruff`/`pre-commit` — not applicable to this folder; JS is covered by the repo's pinned prettier 2.7.1 and eslint 9 config                  | pass       |

`npm run check` is the gate: it must be green before this folder is committed.

### Honest limitations

-   **No screen recording.** The course teaches by deck, script and lab; there are no product videos.
-   **Never executed against a live site.** Screens, labels and field names were written from the
    ERPNext source in this repository, but no chapter was rehearsed on a running bench, so any drift
    between this text and your installed version should be resolved in favour of your site.
-   **ERPNext moves.** Field names are stable but menus are not; each slide lists paths, and paths are
    the first thing to change between versions.
-   **Malaysian statutory details** (SST rates and categories, e-Invoice phases) are summarised with
    a "verify with RMCD/LHDN" instruction — they change, and the course should not be the authority.

---

## Licence

GPL-3.0, matching ERPNext.
