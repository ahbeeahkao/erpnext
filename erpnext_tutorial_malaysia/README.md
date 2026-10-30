# Malaysia e-Invoicing with ERPNext — a complete course

A narrated, eight-chapter course for finance teams and ERPNext implementers who have to make
**LHDN MyInvois e-Invoicing** work in a real Malaysian company, using the
[`erpnext_malaysia`](../erpnext_malaysia) app that ships in this repository.

It is a slide deck, not a screen recording: 64 teaching slides, 8 labs, 40 explained quiz
questions, 8 speaker narrations (~13 minutes of audio), speaker notes on every slide, and a
print/PDF workbook. No build step, no framework, no network calls.

```bash
cd erpnext_tutorial_malaysia
npm install          # dev tooling only: eslint, prettier, jsdom
npm run dev          # → http://localhost:8080
```

Press play for the chapter narration, `P` for speaker notes, `/` to search all 88 slides.

> **Companion course.** If your team is new to ERPNext itself, start with
> [`erpnext_tutorial`](../erpnext_tutorial) — _Mastering ERPNext_, ten chapters from first login to a
> Malaysian go-live. This course assumes you can create a customer, submit a Sales Invoice and read a
> ledger.

---

## Syllabus

| #   | Chapter                                        | Level      | Time   | What it settles                                                                                |
| --- | ---------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| 1   | **The Malaysian e-Invoice Mandate**            | Foundation | 45 min | What an e-Invoice is, the four document types, 72-hour corrections, B2C and self-billing       |
| 2   | **Inside the e-Invoicing App**                 | Foundation | 50 min | The four DocTypes, custom fields instead of forks, the submit hook, what the app refuses to do |
| 3   | **Sandbox Setup and Credentials**              | Foundation | 45 min | Hosts, portal credentials, settings defaults, token behaviour, TIN validation                  |
| 4   | **Master Data and the Document Mapping**       | Core       | 55 min | TIN, BRN, addresses and state codes, MSIC, UN units, tax types, the rejection shortlist        |
| 5   | **Tax, Totals and the UBL Document**           | Core       | 55 min | UBL 2.1 JSON, per-line tax, allowances, 5-sen reconciliation, the document hash                |
| 6   | **Submission, Status and Failure**             | Advanced   | 60 min | Queue → submit → poll, every status, retries, lost-response recovery, duplicates               |
| 7   | **Credit Notes, Cancellation and Corrections** | Advanced   | 55 min | Cancel vs credit, billing references, 72 hours and 300 characters, half-cancelled states       |
| 8   | **Go Live, Reconcile and Audit**               | Capstone   | 60 min | Readiness gate, cutover, three-way reconciliation, monitoring, retention, first 90 days        |

Every chapter: five outcomes, eight teaching slides (tables, tip/warn/Malaysia callouts, menu
paths), a lab with a **done when** criterion, five quiz questions with explanations, and a speaker
narration you can play or read.

**Total:** 64 teaching slides, 88 slides including intro/lab/quiz, 62 lab steps, 40 quiz questions,
735 minutes of syllabus (about 12 hours), 8 narrations.

---

## What makes this course different from a product demo

-   **It teaches the failure modes.** Rejections, duplicates, lost responses, half-cancelled
    invoices, invalid storms and LHDN outages each get their own treatment.
-   **It says what the app does not do.** Self-billed e-Invoices, currency conversion, automatic
    credit notes and consolidated batches are out of scope, and the course explains the process gap
    rather than pretending the feature exists.
-   **It separates compliance from accounting.** Your books must close when LHDN is down, and the
    course shows the queue-and-retry pattern that makes that true.
-   **It ends with evidence.** Chapter 8 produces a signed readiness gate, a three-way reconciliation
    sheet, a monitoring checklist with named owners and a tested restore time.

## Design of the labs

The labs run on a **MyInvois sandbox site**, not on production. They are written to be executable by
two people in an afternoon per chapter, and each one ends with an artefact you keep: a mandate map,
a settings screenshot set, a compliant customer dataset, a hash comparison, a status-transition log,
an unwind runbook and a signed twenty-document matrix.

Sandbox credentials, host names and portal navigation change over time. Where they do, the course
teaches the shape of the step (taxpayer → integration → credentials) rather than a pixel path.

---

## Course layout

```
erpnext_tutorial_malaysia/
├── index.html                 deck shell (no build step)
├── styles.css                 print styles, dark-on-light deck theme
├── src/app.js                 router, renderer, quizzes, search, notes, print, audio
├── course/
│   ├── manifest.json          title, audience, chapter order
│   └── ch01.json … ch08.json  the course content (source of truth)
├── audio/
│   ├── manifest.json          generated: file, characters, bytes, transcript, voice
│   └── ch01.mp3 … ch08.mp3    chapter narrations
├── scripts/
│   ├── serve.mjs              zero-dependency static server (range requests for audio)
│   └── audio-manifest.mjs     rebuilds audio/manifest.json, errors if an mp3 is missing
└── tests/
    ├── course.test.mjs        content gate (structure, totals, audio ↔ transcript)
    └── smoke.mjs              jsdom checks driving the real UI
```

Chapter JSON shape: `id`, `number`, `title`, `subtitle`, `level`, `minutes`, `outcomes[]`,
`slides[]` (`kicker`, `title`, `bullets[]`, `notes`, optional `table{headers,rows}`,
`callout{tone,title,text}`, `paths[]`), `lab{title,minutes,steps[],done}`, `quiz[]`, `narration`.

## Editing and regenerating

```bash
npm run dev            # serve on :8080 (PORT=8090 to change)
npm test               # 57 content assertions
npm run smoke          # 21 jsdom UI checks
npm run lint           # eslint 9 flat config
npm run format:check   # prettier, repo-pinned version
npm run check          # lint + format + test + smoke
node scripts/audio-manifest.mjs   # rebuild audio manifest from JSON + mp3s
```

If you edit a `narration`, regenerate the manifest **and** re-record that chapter's audio. The content
test fails when the transcript in `audio/manifest.json` no longer equals the narration, which is the
mechanism that keeps text and speech in sync.

## Keyboard

| Key           | Action            | Key   | Action                 |
| ------------- | ----------------- | ----- | ---------------------- |
| `→` / `Space` | Next slide        | `A`   | Play / pause narration |
| `←`           | Previous slide    | `T`   | Transcript             |
| `G`           | Slide grid        | `P`   | Speaker notes          |
| `/`           | Search the course | `F`   | Print / PDF            |
| `?`           | Help              | `Esc` | Close overlay          |

Progress and quiz answers are stored in `localStorage` under `myinvois-course/v1`; **Reset progress**
in the help overlay clears them.

---

## Instructor notes

-   **Chapter 1 first, always.** Teams that skip the mandate argue about features they do not need.
-   **Run chapter 3 live.** Watching a token fail and then succeed teaches more than any slide.
-   **Use a real customer for the chapter 4 lab.** The errors will be genuine and memorable.
-   **Break things in chapter 6.** Deliberate failures in sandbox build the confidence to work in
    production.
-   **Do not skip chapter 7's ordering drill.** Most month-end e-Invoice pain is a correction done in
    the wrong order.
-   **Chapter 8 is a workshop, not a lecture.** Book half a day with finance and sign the gate.

---

## Honest limitations

-   **Nothing here was rehearsed against a live LHDN sandbox.** The companion app was written without a
    Frappe bench, a database or network access to `sdk.myinvois.hasil.gov.my`; it is unit-tested and
    statically checked, and the course is written from its source and the published API documentation.
    Run a sandbox pilot before production.
-   **There are no screen recordings.** Producing one requires a running bench and a site, neither of
    which existed in the environment where this course was written. The deck, the labs and the
    narration are the substitute.
-   **Portal navigation and phase dates change.** The course teaches the stable shape of the process and
    tells learners where to confirm the current rules; it does not claim to be a substitute for LHDN's
    own guidance or your tax advisor.
-   **The app's scope is supplier-issued Sales Invoices.** Self-billed documents, consolidation runs
    and foreign currency conversion are explicitly out of scope.

## Tests, at a glance

| Gate                    | What it protects                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/course.test.mjs` | Chapter structure, five quiz questions with valid answers, tables, narration length and limit, audio ↔ transcript equality, mp3 presence, coverage of mandate vocabulary, README completeness |
| `tests/smoke.mjs`       | The real UI in jsdom: boot, navigation, tables, lab, quiz scoring and reset, search, notes, transcript, narration wiring, keyboard, print view, progress                                      |

The smoke test asserts the deck's _graceful_ behaviour under jsdom, where audio playback is not
implemented: the app must toast instead of throwing, and must still show the correct audio source.
