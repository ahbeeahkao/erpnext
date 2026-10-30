# ERPNext Functional Consultant — setup and transaction walkthroughs

A training course for people who **configure and demonstrate ERPNext for a living**. Not a developer
course, not a feature tour: every lesson tells you which screen to open, which value to enter, and
exactly what you should see afterwards.

It runs against one sample company — **Seri Murni Sdn Bhd**, a Malaysian distributor with a small
assembly operation — so the numbers in the deck are the numbers you should see on your own site.

```bash
cd erpnext_consultant_training
npm install          # dev tooling only: eslint, prettier, jsdom
npm run dev          # → http://localhost:8080
```

Press `→` to advance, `P` for the consultant note on each slide, `A` for the narration, `/` to search,
`F` to print the whole workbook.

---

## What makes this consultant-grade

| Ordinary training                  | This course                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| "Create a company"                 | **Step / Do this / Enter / Expect to see** — seven numbered steps, with the value to type      |
| "You should see the ledger update" | **Check / Expected value / Where to look** — `Dr Debtors 1,320.00`, General Ledger, by voucher |
| Feature explanations               | Arithmetic you predict before pressing submit: 1,200 + 120 = 1,320, cost 600, gross profit 600 |
| Happy path only                    | Partial delivery, discounts, returns, credit-limit blocks, and the message each one produces   |
| Nothing to hand over               | Consultant notes per slide, a sample data pack, and an exception-list discipline at month end  |

Every teaching slide carries a table. Every chapter ends in a lab with a **done when** criterion and
five quiz questions with explanations.

## Volumes built so far

| Volume                      | Chapters   | Lessons | Time    |
| --------------------------- | ---------- | ------- | ------- |
| **0 · Foundations**         | ch01, ch02 | 10      | 155 min |
| **1 · Masters and Pricing** | ch03, ch04 | 8       | 145 min |
| **2 · Quote to Cash**       | ch05, ch06 | 10      | 175 min |

### Chapters

1. **Volume 0 · Standing Up the Company** — Lessons 1–5: the company record, chart of accounts, company defaults, cost centres, Malaysian SST templates.
2. **Volume 0 · Making the System Usable** — Lessons 6–10: units and conversions, warehouses, users and roles, permissions and naming series, stock and selling settings, the handover check.
3. **Volume 1 · The Item Master** — Lessons 1–4: item groups, a complete stock item, serial and batch tracking, prices and reorder rules.
4. **Volume 1 · Parties and Pricing** — Lessons 5–8: customers, addresses and contacts, suppliers, price lists and pricing rules.
5. **Volume 2 · Quote to Cash, Step by Step** — Lessons 1–5: quotation → sales order → delivery note → sales invoice → payment, with the four numbers that must be exact.
6. **Volume 2 · When Reality Intervenes** — Lessons 6–10: partial delivery, discounts, returns and credit notes, credit limits, closing the sales month.

**Totals:** 55 teaching slides, 73 slides including intros, labs and quizzes,
55 lab steps, 30 quiz questions, 6 narrations, 830 minutes of syllabus (about 14 hours),
and a walkthrough table on every teaching slide.

### Planned volumes (declared, not yet written)

Volume 3 · Procure to Pay, Volume 4 · Stock Accuracy and Valuation, Volume 5 · Accounting and the
Close, Volume 6 · Manufacturing, Volume 7 · Projects, Assets, Quality and CRM, Volume 8 · Automation,
Print and Permissions, Volume 9 · Malaysia Compliance, Volume 10 · Migration, UAT and Go-Live.

The roadmap lives in `course/manifest.json`, and the test suite fails if a built volume references a
chapter that does not exist — so a half-finished volume cannot hide.

---

## The sample company

| Element    | Value                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Company    | Seri Murni Sdn Bhd, abbreviation `SM`, Malaysia, MYR, FY 2026                                    |
| Products   | Blender (serial tracked), kettle, carton (batch tracked), motor assembly, delivery service       |
| Parties    | Aeon Big (distributor, RM 5,000 credit limit), Kedai Elektrik Jaya (dealer), two local suppliers |
| Pricing    | Retail 240.00, Dealer 216.00, a 5 % dealer rule above 10 units                                   |
| Tax        | SST 10 % on goods, service tax 8 % on delivery, separate liability accounts                      |
| Warehouses | Main, Retail Counter, Assembly Floor, Returns Quarantine                                         |

The machine-readable pack is in [`samples/`](samples): masters as CSV, a nine-document walkthrough
register, and `expected-outcomes.json`, which the test suite uses to prove the deck teaches the same
arithmetic the data pack declares.

**The one cycle worth memorising** — five blenders, retail, SST 10 %:

| Step | Document      | What it writes                                          |
| ---- | ------------- | ------------------------------------------------------- |
| 1    | Quotation     | nothing                                                 |
| 2    | Sales Order   | nothing, projected quantity −5                          |
| 3    | Delivery Note | stock −5 @ 120.00, Dr COGS 600.00 / Cr Stock 600.00     |
| 4    | Sales Invoice | Dr Debtors 1,320.00 / Cr Sales 1,200.00 / Cr SST 120.00 |
| 5    | Payment Entry | Dr Bank 1,320.00 / Cr Debtors 1,320.00, invoice Paid    |

---

## How to teach from it

1. **Build the sample company first.** Volumes 0–1 are prerequisites; a learner who jumps to Volume 2
   will not know why a rate or a tax row appeared.
2. **Predict, then check.** Ask for the total, the tax and the cost of goods before pressing submit.
   This is the single habit that separates a consultant from a typist.
3. **Break something in every session.** Remove an item price, blank a postcode, exceed a credit limit.
   The error message is the lesson.
4. **Keep an exception register.** Every lab ends with something a client would have to sign.
5. **Finish with the handover sheet** in chapter 2, then run the sample cycle end to end as a rehearsal.

## Repository layout

```
erpnext_consultant_training/
├── index.html                 deck shell, no build step
├── styles.css                 deck and print styling
├── src/app.js                 router, renderer, quizzes, search, notes, print, audio
├── course/                    manifest.json and ch01.json … ch06.json (source of truth)
├── audio/                     generated manifest and six chapter narrations
├── samples/                   Seri Murni data pack and expected outcomes
├── scripts/                   static server and audio manifest builder
└── tests/                     content gate and jsdom UI smoke test
```

## Editing and regenerating

```bash
npm run dev            # serve on :8080 (PORT=8090 to change)
npm test               # content, sample-pack and audio assertions
npm run smoke          # jsdom checks driving the real UI
npm run lint           # eslint 9 flat config
npm run format:check   # prettier, repo-pinned version
npm run check          # lint + format + test + smoke
node scripts/audio-manifest.mjs   # rebuild the audio manifest from JSON and mp3s
```

If you change a lesson's arithmetic, update `samples/expected-outcomes.json` **and**
`samples/documents.csv` in the same commit: the test suite fails when the deck and the data pack stop
agreeing. If you change a narration, re-record that chapter — the transcript is compared character by
character.

## Honest limitations

-   **Written without a running bench.** Field labels, tab positions and default values reflect ERPNext
    v15/v16 Desk behaviour as documented; a future release can rename or move a field. Treat the
    _values and expected outcomes_ as the stable part and the click path as version-sensitive.
-   **No screenshots or screen recordings**, because no site existed in the environment where this was
    written. Every step is described precisely enough to follow, and every result is stated as a number,
    a status or a report row you can verify.
-   **Three of eleven volumes are built.** The rest are declared in the roadmap and deliberately not
    faked with thin chapters.
-   **Not a tax or audit opinion.** Malaysian SST treatment here is a configuration exercise for the
    sample company; confirm rates and registration obligations with the client's tax advisor.
