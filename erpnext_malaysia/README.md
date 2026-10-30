# ERPNext Malaysia — LHDN MyInvois e-Invoicing

A Frappe/ERPNext app that submits Sales Invoices to **MyInvois**, LHDN's e-Invoicing platform, as
**UBL 2.1 JSON**, then tracks their validation status and supports cancellation.

It is deliberately small: no LHDN SDK, no `requests`, no new background infrastructure. The only
runtime dependencies are Frappe, ERPNext and the Python standard library.

```
Sales Invoice ──on_submit──► background job ──► mapping ──► UBL 2.1 JSON ──► POST documentsubmissions
                                    │                                              │
                                    └──── E Invoice Submission Log ◄──── accepted/rejected + UUID
                                                    ▲
                                     scheduled poll │ (every 10 min)
                                                    └──── GET documents/{uuid}/details
```

---

## What is in the box

| Piece | Path | What it does |
| --- | --- | --- |
| Value objects | `malaysia_einvoice/services/models.py` | `Party`, `Line`, `InvoiceData` — plain dataclasses |
| Reference codes | `malaysia_einvoice/services/codes.py` | e-Invoice types, SST tax types, state codes, UN/ECE unit codes, General Public buyer |
| UBL builder | `malaysia_einvoice/services/ubl.py` | `InvoiceData` → UBL 2.1 JSON (`{"_": …}` wrappers), SHA-256, base64, submission body |
| Validation | `malaysia_einvoice/services/validation.py` | Mandatory fields, MSIC format, TIN format, arithmetic reconciliation, dates |
| REST client | `malaysia_einvoice/services/client.py` | OAuth2 token cache, submit, submission/document status, cancel/reject, TIN validation, search, retries |
| Mapping | `malaysia_einvoice/services/mapping.py` | Sales Invoice → `InvoiceData`, SST rate resolution, UTC issue time |
| Orchestration | `malaysia_einvoice/services/submission.py` | Idempotency, background queue, retries, lost-response recovery, polling, cancellation |
| Desk / API | `malaysia_einvoice/api.py` | Preview, submit, status, refresh, cancel, TIN validation |
| Masters | `malaysia_einvoice/doctype/` | Settings (Single), LHDN Classification Code, Tax Account Mapping, Submission Log |
| Custom fields | `malaysia_einvoice/setup/install.py` | Company/Customer/Item/Sales Invoice fields — never patches ERPNext JSON |
| Sample payload | `samples/sample-einvoice.json` | Golden UBL document (regenerate with `scripts/render_sample.py`) |
| Self-check | `scripts/check_app.py` | 225 static assertions: DocType JSON, controllers, Link targets, hook paths, custom fields |

---

## Installation

The app assumes an existing site with ERPNext installed.

```bash
# from the bench directory
bench get-app erpnext_malaysia <path-or-git-url>
bench --site your-site install-app erpnext_malaysia
bench --site your-site migrate
bench restart
```

While this app lives inside the ERPNext repository (see *Repository note* below):

```bash
cd frappe-bench
bench get-app /path/to/erpnext/erpnext_malaysia
# or simply add the folder to your bench apps and `pip install -e apps/erpnext_malaysia`
```

`after_install` creates the custom fields and seeds ~20 MSIC codes; `after_migrate` re-asserts the
custom fields so an ERPNext upgrade cannot drop them.

### Repository note

This directory is a **standalone Frappe app that currently lives inside the ERPNext repository**
(`erpnext_malaysia/`), so that it travels with the branch it was written on. Move it to its own
repository (or `bench/apps/`) to install it. Nothing in ERPNext itself was modified.

---

## Configuration

**Malaysia E-Invoice Settings** (search "Malaysia E-Invoice Settings"):

| Section | Field | Notes |
| --- | --- | --- |
| General | Enable Malaysia e-Invoicing | Off by default; the hooks do nothing while off |
| | Environment | `Sandbox` → `preprod-api.myinvois.hasil.gov.my`, `Production` → `api.myinvois.hasil.gov.my` |
| | Submit automatically on Sales Invoice submit | If off, submit from the invoice's *Malaysia e-Invoice* button |
| | Use short queue | Queue background submissions on `short` instead of `long` |
| | Allow General Public buyer | Needed for B2C / consolidated e-Invoices |
| Credentials | Client ID / Client Secret | From the MyInvois portal (Taxpayer System → Integration). Stored as a Frappe `Password` field |
| | On Behalf Of | Intermediary TIN only; becomes `onbehalfof` in the token request |
| | Request timeout / Max retries | HTTP timeout (default 30 s) and retry budget for HTTP 429/5xx |
| Defaults | Default Classification (MSIC) Code | Used when the item and line have no code |
| | Default Tax Type | `06 Not Applicable` unless you are SST registered |
| Tax mapping | Tax Accounts | `Account → MyInvois tax type (+ rate)` — see *SST handling* |

Then set the taxpayer identity once, on the masters:

* **Company** → Malaysia TIN, registration type/number, SST registration number.
* **Company/Customer** → a **primary Address** (line 1, city, state, postcode). MyInvois requires one.
* **Customer** → Malaysia TIN, registration type/number, SST number (blank for B2C).
* **Item** → MSIC classification code and (optionally) the MyInvois tax type.

---

## Training

A narrated, hands-on course for this app lives in
[`erpnext_tutorial_malaysia`](../erpnext_tutorial_malaysia): eight chapters, eight sandbox labs and a
production readiness gate, covering the mandate, installation, credentials, mapping, the payload,
submission failures, corrections, and go-live.

## Field mapping (Sales Invoice → UBL)

| UBL element | Source |
| --- | --- |
| `ID` (`cbc:ID`) | Sales Invoice name |
| `IssueDate` | `posting_date` |
| `IssueTime` | `posting_time`, converted from the site timezone to **UTC** (`…Z`) |
| `InvoiceTypeCode` | `custom_malaysia_invoice_type`, else derived: `01`; `03` for debit notes; `02` for returns with `return_against`, `04` otherwise |
| `DocumentCurrencyCode` | `currency` — must be `MYR` |
| `BillingReference` | UUID of the original e-Invoice (`custom_malaysia_billing_reference`, else the referenced invoice's stored UUID) — required for `02`/`03`/`04` |
| `AccountingSupplierParty` | Company + its primary Address + Company custom fields |
| `AccountingCustomerParty` | Customer + its primary Address; LHDN's General Public (`EI00000000010` / `NRIC 000000000000`) when *General Public buyer* is ticked |
| `InvoiceLine/InvoicedQuantity` | `qty`, with the UOM mapped to a UN/ECE unit code (`Nos` → `C62`, `kg` → `KGM`, …) |
| `InvoiceLine/LineExtensionAmount` | `net_amount` |
| `InvoiceLine/Price/PriceAmount` | `rate` |
| `InvoiceLine/AllowanceCharge` | `qty × rate − net_amount`, when positive |
| `InvoiceLine/Item/CommodityClassification` | `Item.custom_malaysia_classification_code` (MSIC, `listID="CLASS"`) |
| `InvoiceLine/Description` | line description, else item name |
| `TaxTotal` (header and per line) | see below |
| `LegalMonetaryTotal` | sum of line extensions, tax total, `PayableAmount` |

Every scalar is wrapped as `{"_": value}` as the UBL-JSON mapping requires, `InvoiceTypeCode`
carries `listVersionID: "1.1"`, quantities drop trailing zeros (`2`, not `2.0000`).

### SST handling

Malaysia charges **SST**, not GST (GST was repealed in 2018), so nothing here relies on ERPNext's
GST fields. Each line's rate comes from ERPNext's own calculation, in this order:

1. `Sales Invoice Item.item_tax_rate` — the snapshot ERPNext writes from the item's **Item Tax
   Template**. This is what makes mixed-rate invoices (5 % sales tax, 8 % service tax, 0 % exempt)
   report correctly per line.
2. The invoice's tax rows, resolved through **Tax Accounts** (`account_head → tax type, rate`).
3. The **Default Tax Type** with a zero rate.

Tax types used: `01` Sales Tax, `02` Service Tax, `03` Tourism Tax, `04` High-Value Goods Tax,
`05` Sales Tax on LVG, `06` Not Applicable, `E` Tax Exemption. Lines whose tax type is not
`01`–`05` are forced to a zero rate, and the per-line tax amounts are reconciled (to the sen)
against `total_taxes_and_charges`, so the document LHDN receives always adds up.

`PayableAmount` is the tax-inclusive total of the e-Invoice itself. If ERPNext's `grand_total`
differs by more than 5 sen (rounding adjustments, non-tax charges), the submission is still made
and a warning is recorded on the log row.

### B2C and consolidated e-Invoices

Tick **General Public buyer** on the invoice to bill LHDN's General Public. LHDN allows B2C
consolidation only within the window it publishes for the period (historically seven days after
month end) — this app submits whenever you submit, so schedule consolidated runs accordingly and
check the current LHDN guidance before relying on it.

---

## Submission lifecycle

1. `Sales Invoice.on_submit` → if enabled and *Submit automatically*, `frappe.enqueue(...,
   enqueue_after_commit=True)`; the user's transaction never waits for LHDN.
2. The job builds the document, validates it locally, writes an **E Invoice Submission Log** row
   (including the exact JSON sent and its SHA-256), then `POST /api/v1.0/documentsubmissions/`.
3. LHDN answers `202` with `submissionUid`, `acceptedDocuments` and `rejectedDocuments`.
   *Rejected at this stage* usually means a duplicate invoice number or a malformed payload.
4. Validation is asynchronous: a cron job polls `GET /api/v1.0/documents/{uuid}/details` every
   ten minutes for documents still `Submitted`, and writes `Valid` / `Invalid` (+
   `validationResults`) back to the log and to the Sales Invoice.
5. Local errors (HTTP 429/5xx/timeout) are retried with exponential backoff (honouring
   `Retry-After`); after `Max Retries` attempts the row is marked `Error`.
6. **Lost-response recovery**: if the network failed mid-submit, the retry first searches LHDN by
   invoice number and adopts the document it already holds instead of submitting a duplicate.
7. Idempotency: a Sales Invoice whose document hash already appears on an accepted log row is
   never submitted twice.

### Cancellation

`PUT /api/v1.0/documents/state/{uuid}/state` with `{"status": "cancelled", "reason": …}` — LHDN
only accepts this **within 72 hours** of validation, requires a reason of at most **300
characters**, and refuses while a referencing credit/debit note is still active. Enable *Cancel
e-Invoice when Sales Invoice is Cancelled* to mirror ERPNext cancellations (failures are logged
and shown, never blocking the ERPNext cancellation).

Rejection (`{"status": "rejected"}`) is the *buyer's* action and only requests cancellation; the
supplier still has to cancel. The client supports it (`reject_document`) for integrations.

---

## API endpoints

Desk buttons use these (all `@frappe.whitelist()`, all permission-checked):

| Method | Purpose |
| --- | --- |
| `malaysia_einvoice.api.preview_document` | UBL JSON + validation errors/warnings + hash, without submitting |
| `malaysia_einvoice.api.submit_now` | Submit one Sales Invoice synchronously |
| `malaysia_einvoice.api.get_status` | Local status/UUID/error for a Sales Invoice |
| `malaysia_einvoice.api.refresh_status` | Poll MyInvois for a submission log |
| `malaysia_einvoice.api.cancel` | Cancel the e-Invoice with a reason |
| `malaysia_einvoice.api.resubmit` | Retry a failed/rejected submission |
| `malaysia_einvoice.api.validate_tin` | TIN validation against LHDN (System Manager / Accounts Manager) |
| `malaysia_einvoice.api.settings_status` | Small "is it configured?" health check |

MyInvois calls implemented by the client:

| Call | Endpoint |
| --- | --- |
| Token | `POST {identity}/connect/token` (`client_credentials`, scope `InvoicingAPI`) |
| Submit | `POST {api}/api/v1.0/documentsubmissions/` |
| Submission status | `GET {api}/api/v1.0/documentsubmissions/{uid}` |
| Document details / raw | `GET {api}/api/v1.0/documents/{uuid}/details`, `…/raw` |
| Cancel / reject | `PUT {api}/api/v1.0/documents/state/{uuid}/state` |
| TIN validate / search | `GET {api}/api/v1.0/taxpayer/validate/{tin}`, `…/taxpayer/search/tin` |
| Document search | `GET {api}/api/v1.0/documents/search` |
| Document types | `GET {api}/api/v1.0/documenttypes/` |

Access tokens are cached per (identity server, client id, on-behalf-of) with a 60-second safety
margin; a `401` triggers exactly one refresh and retry.

---

## Testing

The whole non-Frappe layer is unit tested, so most of the risk is covered without a bench:

```bash
cd erpnext_malaysia
python3 -m unittest discover -s malaysia_einvoice/tests -t . -v
```

76 tests cover: UBL element wrapping and structure, `{"_": …}` rule, per-line and grouped tax,
discounts → `AllowanceCharge`, billing references, General Public buyer, deterministic
serialisation and SHA-256, every validation rule, the client's token caching/refresh, retry and
`Retry-After` behaviour, 401 refresh, submit payload shape, cancel/reject verbs and bodies, TIN
validation including 404 → `False`, and status normalisation.

```bash
# style (repo settings: line-length 110, tabs, double quotes)
ruff check malaysia_einvoice scripts
ruff format --check malaysia_einvoice scripts

# static app check: DocType JSON structure, controller names, Link targets, hook paths,
# custom fields and their insert_after anchors — 225 assertions, no Frappe needed
python3 scripts/check_app.py
```

**Not verified here:** anything that needs a running site — custom field creation, DocType
migration, `frappe.enqueue`, the scheduler, the Desk buttons, and of course a real MyInvois
sandbox round trip. No Frappe/ERPNext installation (and no database) was available in the
development sandbox, so this app has never been executed against a bench. Run it on a sandbox
site with MyInvois preprod credentials before trusting it with production invoices; the
`sdk.myinvois.hasil.gov.my` playground is the authority on payload shape.

A rendered sample lives in `samples/sample-einvoice.json`; regenerate it with
`python3 scripts/render_sample.py --write` after an intentional payload change, and the golden
file test will fail until you do.

---

## Operational notes

* **Keep the log rows.** They hold the exact document bytes, the hash and LHDN's answer — the
  audit trail LHDN can ask for. Rows in `Submitted`/`Valid`/`Cancelled`/`Rejected` cannot be
  deleted from the UI.
* **Invoice numbers must be unique.** LHDN rejects duplicates; submit each Sales Invoice once
  (the app enforces this per document hash).
* **Secrets**: the client secret is stored in a `Password` field; grant Settings write access to
  System Manager only (the app's permissions already do this).
* **Scheduler**: `poll_pending_documents` (every 10 min) and `retry_pending` (every 15 min) need
  `bench --site … enable-scheduler`, otherwise statuses stay at `Submitted`.

## Licence

GPL-3.0, the same as ERPNext.
