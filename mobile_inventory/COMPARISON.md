# The app beside the Desk

ERPNext's web interface is built around **documents**: you open Stock Entry, choose a purpose, add
rows, set warehouses, save, submit. That is the right shape for the person who owns the document. It
is the wrong shape for the person holding a carton at the receiving door, because they first have to
translate "what I am doing" into "which doctype, which purpose, which fields".

This app starts from the other end. There are six things a warehouse does in a day, and each one is a
screen:

| The job | What it posts |
|---|---|
| Receive a delivery | `Purchase Receipt` (submitted) — against a purchase order, with rejects |
| Count a rack | one `Stock Reconciliation` for the whole shelf, zero counts included |
| Put away | `Stock Entry` · Material Transfer, from the door to a shelf |
| Issue for consumption | `Stock Entry` · Material Issue — source only, no target |
| Pick for a work order | `Stock Entry` · Material Transfer for Manufacture |
| Pick for delivery | **draft** `Delivery Note`, for dispatch to check and submit |

The item sheet is a lookup, not a form: search or scan, see the balances, and one action — transfer.
The old ad-hoc *Receive / Issue / Count* buttons that lived there are gone, because each of them was
a Desk form with the fields renamed.

Nothing about the ERPNext side changes: same doctypes, same fields, same Stock Ledger Entries, same
permissions, same reports. The app is a different door into the same room.

---

## Job by job

### 1. Receive a delivery — `Purchase Receipt`

**In the Desk today:** Stock → Purchase Receipt → New, or open the Purchase Order and press
*Create → Purchase Receipt*. Then *Get Items From → Purchase Order*, pick the order, set the
receiving warehouse on every row, set `Rejected Qty` and `Rejected Warehouse` where goods came
damaged, type or scan a batch into `Batch No` per row, add serial numbers in a dialog, save, submit.
Thirteen purpose options sit in a dropdown on the neighbouring Stock Entry form for the person who
is not sure which document they need.

**In the app:** *Receive a delivery* → the purchase orders that are still open are already listed →
tap the one the driver names → scan the cartons. Each scan adds a line or counts up an existing one,
capped at the ordered quantity. Rejects, serials and the batch number sit on the line you are
standing in front of, not in a table 40 rows long. One button posts the receipt.

| | Desk | App |
|---|---|---|
| Finding the order | search by PO number | orders pending receipt, with supplier and date |
| Identifying the goods | type item code or use the barcode field per row | scan; unknown codes are refused with the reason |
| Over-receipt | blocked on submit unless Buying Settings allows a percentage | blocked while scanning, at the ordered quantity (tolerance 0) |
| Rejects | `Rejected Qty` + `Rejected Warehouse` columns | a rejects field on the line, written to the same columns |
| A lot that arrived without a batch | create the `Batch` first in another tab, then come back | type the lot, tap *Create batch* — the `Batch` is posted and the row gets its document name |
| Mistakes | editable until submit; after submit, a cancellation | editable until posted; after posting, correct in the Desk |
| Offline in a dead zone | not possible | queues in the phone; posts with the same idempotency marker |

### 2. Count a rack — `Stock Reconciliation`

**In the Desk today:** Stock → Stock Reconciliation → New, choose the warehouse, then *Get Items
From → Stock Balance* or scan the barcode field row by row, and type the counted quantity on every
row. The document is built around *items*, so counting a shelf means constructing a list of the
items someone believes are on it — and anything you do not think to add is invisible.

**In the app:** *Count a rack* → warehouse, then the shelf → scan what is actually there. The list
**grows** as you find things: an item that should not be on that shelf is a finding, not a mistake.
Counts below the system figure post as the counted number, zeros included, because zero is an
answer. When the count is revealed, every line shows its `+`/`−` against the system figure and the
footer states the net variance and how many lines ran over and under.

| | Desk | App |
|---|---|---|
| What you start with | the items you think are there | nothing — the shelf tells you |
| Blind counting | not a concept | blind until you reveal; the variance is withheld while you count |
| Zero stock | delete the row or type 0 | type 0; it posts as a real count |
| The result | a reconciliation you then read | one reconciliation for the whole rack, with the variance on screen |

### 3. Put away — `Stock Entry` · Material Transfer

**In the Desk today:** Stock Entry → New → purpose *Material Transfer*, source and target warehouse
on every row; a shelf is either a separate warehouse (hundreds of them, and reports nobody can read)
or an Inventory Dimension field you have to remember to fill.

**In the app:** *Put away* → the deliveries waiting at the door → pick the one → choose the shelf.
When an Inventory Dimension exists for locations (`Location|Shelf|Rack|Bin|Aisle|Slot`) the shelf is
written on every row, and a put-away without a shelf is refused rather than silently landing in the
warehouse's default bin.

### 4. Issue for consumption — `Stock Entry` · Material Issue

**In the Desk today:** Stock Entry → New → purpose *Material Issue*, add a row per item, set the
source warehouse on each one, save, submit. Which is fine until you are standing at the scrap bin.

**In the app:** *Issue for consumption* → warehouse → scan what is leaving. One Material Issue for
everything scanned, with the on-hand figure beside each line so taking the last of something is a
visible decision. No target warehouse, because nothing arrives anywhere.

### 5. Pick for a work order — `Stock Entry` · Material Transfer for Manufacture

**In the Desk today:** Manufacturing → Work Order → open it → *Create → Material Transfer* (or the
*Material Transfer* button), which builds a Stock Entry with the materials and required quantities;
then set the source warehouse per row, choose batches, save, submit. Short-issue means editing the
quantity and hoping somebody notices why.

**In the app:** *Pick for a work order* → the work orders with material still to transfer → the
components are listed with what is still needed. Scanning counts up to that figure and no further.
A short pick demands a reason (*Not on the shelf · Damaged · Reserved for another order · Quality
hold*) which is written into the document's remarks, so the office reads the same story the picker
told. Batch-tracked lines offer the batches the server says are on that shelf, oldest expiry first,
with quantity and expiry — and the quantity on hand is shown while you pick, with a warning (never a
refusal) if you go past it.

### 6. Pick for delivery — draft `Delivery Note`

**In the Desk today:** Selling → Delivery Note → New → *Get Items From → Sales Order*, set the
warehouse, handle batches, save, submit, print. Dispatch usually wants to check the pallet before the
stock leaves the building, which means either the picker has desk rights or someone re-does it.

**In the app:** *Pick for delivery* → the sales orders due, with what is still to deliver → pick, with
the same batch and short-pick behaviour → **create a draft Delivery Note**. Draft, not submitted, on
purpose: dispatch checks it against the gate pass and submits. Stock has not moved until someone at
the desk says so.

---

## Feature by feature

| Capability | ERPNext web (Desk) | This app |
|---|---|---|
| Barcode scanning | a `Scan Barcode` field at the top of the document; it needs the item to exist and the row to be in edit mode | the primary input everywhere: camera, hardware scanner, or typed code |
| Offline working | not possible — a browser form submission needs the server | queue of documents in the phone, posted when the signal returns, with idempotency markers so a retry cannot double-post |
| Item lookup | Item list, or search in a link field | offline catalogue of up to 2,000 items: code, name, barcodes, balances (marked stale), batch lists |
| Batches | `Serial and Batch Bundle` (or `batch_no` if `use_serial_batch_fields` is on); batches are typed or picked from a list | chips from `get_batches_by_oldest` (quantity + expiry), created on the phone when a lot is new, cached for offline picks |
| Batch master data | Batch list → New | *Create batch* on the line; the document name is linked, the lot number stays visible |
| Locations / shelves | Inventory Dimension fields, easy to leave blank | dimension read on connect, shelf on every row, put-away refused without one |
| Counting | one reconciliation per list of items you construct | blind, growing, whole-rack, zero counts, variance on screen |
| Rejects on receipt | `Rejected Qty` + `Rejected Warehouse` | same fields, on the line |
| Short picks | edit the quantity, add a remark if you remember | reason required, written into remarks as `Short pick: <item> <qty>/<reqd> (<reason>)` |
| Labels | Print Format, built by a developer or a print-format designer | label sheet at the shop's stock size, `.zpl` download, optional print bridge |
| What went wrong | a stack trace in the browser console | a sentence about the cause, and the queued document with its exact contents |
| Company scope | one site, all companies in whatever you can read | warehouses filtered to the active company |
| Readiness check | — | *Check this site*: sign-in, warehouses, dimensions, batch lists, serial/batch mode |

## What the Desk still owns

The app deliberately stops at the warehouse door. It does not do valuation, repacking,
subcontracting, stock returns, credit notes, pricing, taxes, serial-numbered **sales** returns, job
cards, quality inspections, or any report. Everything it posts is a document a normal ERPNext user
could have typed by hand, so the Desk keeps full control: cancel, amend, revalue, reconcile accounts,
and report exactly as before.

That boundary is the point. A warehouse app that tries to be the ERP is a second ERP.

## Notes on the numbers

- "Clicks" in the tables above are approximate and describe the shape of the work, not a benchmark.
- Everything the app posts was verified against the demo adapter and the built bundle (97 unit tests,
  49 smoke checks). A first run against a real site should start with *Check this site*, then one
  document of each type, checked in the Desk before the pilot widens.
