# ERPNext Functional Consultant — setup and transaction walkthroughs

A training course for people who **configure and demonstrate ERPNext for a living**. Not a developer
course, not a feature tour: every lesson tells you which screen to open, which value to enter, and
exactly what you should see afterwards.

It starts with two concept primers — accounting, then distribution — because a consultant who cannot
explain the books or the commercial model loses the room before the first configuration screen. It
then runs against one sample company, **Seri Murni Sdn Bhd** (a Malaysian distributor with a small
assembly operation), so the numbers in the deck are the numbers you should see on your own site.

```bash
cd erpnext_consultant_training
npm install          # dev tooling only: eslint, prettier, jsdom
npm run dev          # → http://localhost:8080
```

Press `→` to advance, `P` for the consultant note on each slide, `A` for the narration, `/` to search,
`F` to print the whole workbook.

---

## Why the two primers come first

| Primer                    | What it fixes                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accounting concepts**   | Double entry, the five account types, accrual vs cash, the three ledgers, control accounts, journals, period close — each mapped to the ERPNext screen where it becomes real |
| **Distribution concepts** | Goods, money and information flows, channel pricing, the margin stack, reorder points, fulfilment, exceptions, reverse logistics, and the five KPIs a client will ask for    |

If a client's accountant asks "why is SST not revenue?" or their sales director asks "why is fill rate
94 per cent?", these chapters are where the answer lives — with the report you would open to prove it.

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

## What is built so far

| Volume                      | Chapters   | Lessons   | Time    |
| --------------------------- | ---------- | --------- | ------- |
| **Primers · Concepts**      | ch01, ch02 | 2 primers | 200 min |
| **0 · Foundations**         | ch03, ch04 | 10        | 270 min |
| **1 · Masters and Pricing** | ch05, ch06 | 8         | 250 min |
| **2 · Quote to Cash**       | ch07, ch08 | 10        | 310 min |

### Chapters

1. **Primer · Accounting Concepts in ERPNext** — double entry, account types, accrual, the three ledgers, control accounts, tracing a sale to the trial balance, when to use a journal, period close, and five questions before you trust a report.
2. **Primer · Distribution Concepts in ERPNext** — the three flows, channels and price lists, the margin stack, reorder points and safety stock, the fulfilment sequence, exceptions, reverse logistics, KPIs, and what a distribution configuration must settle.
3. **Volume 0 · Standing Up the Company** — Lessons 1–5: the company record, chart of accounts, company defaults, cost centres, Malaysian SST templates.
4. **Volume 0 · Making the System Usable** — Lessons 6–10: units and conversions, warehouses, users and roles, permissions and naming series, stock and selling settings, the handover check.
5. **Volume 1 · The Item Master** — Lessons 1–4: item groups, a complete stock item, serial and batch tracking, prices and reorder rules.
6. **Volume 1 · Parties and Pricing** — Lessons 5–8: customers, addresses and contacts, suppliers, price lists and pricing rules.
7. **Volume 2 · Quote to Cash, Step by Step** — Lessons 1–5: quotation → sales order → delivery note → sales invoice → payment, with the four numbers that must be exact.
8. **Volume 2 · When Reality Intervenes** — Lessons 6–10: partial delivery, discounts, returns and credit notes, credit limits, closing the sales month.

**Totals:** 75 teaching slides, 99 slides including intros, labs and quizzes, 71 lab steps,
40 quiz questions, 8 narrations, 1,030 minutes of syllabus (about 17 hours), and a walkthrough table on
every teaching slide.

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

1. **Run the two primers as a workshop, not a lecture.** Ask the client's accountant to explain one
   invoice's postings back to you; that conversation tells you whether the project will succeed.
2. **Build the sample company next.** Volumes 0–1 are prerequisites; a learner who jumps to Volume 2
   will not know why a rate or a tax row appeared.
3. **Predict, then check.** Ask for the total, the tax and the cost of goods before pressing submit.
   This is the single habit that separates a consultant from a typist.
4. **Break something in every session.** Remove an item price, blank a postcode, exceed a credit limit.
   The error message is the lesson.
5. **Keep an exception register.** Every lab ends with something a client would have to sign.
6. **Finish with the handover sheet** in chapter 4, then run the sample cycle end to end as a rehearsal.

## Repository layout

```
erpnext_consultant_training/
├── index.html                 deck shell, no build step
├── styles.css                 deck and print styling
├── src/app.js                 router, renderer, quizzes, search, notes, print, audio
├── course/                    manifest.json and ch01.json … ch08.json (source of truth)
├── audio/                     generated manifest and eight chapter narrations
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
-   **The primers are briefs, not accounting or distribution textbooks.** They cover the concepts a
    consultant needs in front of a client, not the full syllabus of a professional qualification.
-   **Five of eleven volumes are built** (two primers and three volumes). The rest are declared in the
    roadmap and deliberately not faked with thin chapters.
-   **Not a tax or audit opinion.** Malaysian SST treatment here is a configuration exercise for the
    sample company; confirm rates and registration obligations with the client's tax advisor.
