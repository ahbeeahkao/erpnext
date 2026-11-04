# Recall sheet — ERPNext Functional Consultant

Ten laws in three buckets, then one device per chapter. Print this page, or import
`cards.csv` into Anki or Quizlet for spaced repetition.

## The ten laws

### What is true

_Four laws about state: when a record exists, where its numbers live, and why a balanced book can still be wrong._

1. **Nothing exists until it is submitted.** A draft writes no ledger row, no stock row and no number in the series. Treat drafts as unfinished work, not as records.
2. **Quantity lives in the stock ledger, value in the general ledger, and one voucher writes both.** Every receipt, delivery or stock entry creates stock ledger entries and, at the same moment, the GL rows that carry their value.
3. **A wrong posting still balances.** Double entry proves that debits equal credits, not that they landed in the right accounts. Only a report or a reconciliation proves correctness.
4. **History is append-only: cancel and amend, never edit.** Submitted documents are evidence. The correction path is a reversal, a credit note or an amendment that keeps the original visible.

### Where it lives

_Three laws about structure: hierarchies, ownership of a field, and the order defaults resolve in._

5. **Masters go broad to narrow: company, then group, then item or party.** Item groups, territories, cost centres and account trees are hierarchies that reports roll up. A flat list works only until the first report.
6. **Greyed out means a setting upstream owns the field.** Batch fields appear when Has Batch No is on, tax fields when a template exists. A disabled field is a message about configuration, not a bug.
7. **Defaults cascade: global, company, party or item, then the transaction.** Each level may override the one above, which is why one wrong customer price list can look like a broken pricing rule.

### How it moves

_Three laws about action: one document per event, who may do or see what, and the close that ends a period._

8. **Exactly one document owns each event; skipping it leaves a permanent trace.** Skipping the receipt leaves interim stock uncleared, skipping the delivery leaves the order open. No shortcut leaves no trace.
9. **Roles decide what you can do; user permissions decide what you can see.** A role grants actions on a DocType, a user permission filters the rows. When a report looks wrong, check both before changing either.
10. **Close the period; do not edit the past.** The Period Closing Voucher posts the closing entries and locks the period, so later corrections belong to the current period with a note.

## One device per chapter

| #   | Chapter                                                                                | Device                                        | Kind    | Spine                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Primer · Accounting Concepts in ERPNext                                                | **DEAD CLIC**                                 | acronym | Every transaction has two sides, ERPNext posts both, and the trial balance only proves you entered it twice in the same place.          |
| 2   | Primer · Distribution Concepts in ERPNext                                              | **TRIC**                                      | acronym | Distribution is three flows, goods, money and information, and every ERPNext document moves exactly one of them at a time.              |
| 3   | Volume 0 · How ERPNext Thinks: The Document Lifecycle                                  | **Draft, commit, cancel, amend**              | phrase  | A document does nothing until it is submitted, and after that it is never deleted, only reversed or amended.                            |
| 4   | Volume 0 · Driving the Desk Like an Operator                                           | **Search, filter, save, share**               | path    | Search, filter, save, share: the Desk is navigated by one search box and made useful by saved views.                                    |
| 5   | Volume 0 · Standing Up the Company                                                     | **Broad to narrow, then prove it**            | phrase  | Setup runs broad to narrow, company then tree then defaults then dimensions, and every step is proved with a document afterwards.       |
| 6   | Volume 0 · Making the System Usable                                                    | **Master data before permissions**            | rule    | Master data comes before permissions, because a wrong UOM or warehouse produces a balance that looks right and is not.                  |
| 7   | Volume 1 · The Item Master                                                             | **GUST**                                      | acronym | One gate decides whether an item touches stock at all, then four decisions decide what every later document will ask for.               |
| 8   | Volume 1 · Parties and Pricing                                                         | **Party, address, terms, price**              | path    | A party is a set of defaults plus two controls, and pricing resolves in one direction: the item price is a fact, a rule is an override. |
| 9   | Volume 2 · Quote to Cash, Step by Step                                                 | **Four chases**                               | story   | Four documents chase each other from offer to cash, and only the last two of them touch the ledger and the stock.                       |
| 10  | Volume 2 · When Reality Intervenes                                                     | **One order, many documents**                 | rule    | Reality splits one order across many documents, and every remedy is a new document rather than an edit to the last one.                 |
| 11  | Volume 3 · Buying, Step by Step                                                        | **Buying is selling backwards**               | rule    | Buying is selling backwards, document for document, with one asymmetry that decides whether the interim stock account ever clears.      |
| 12  | Volume 3 · Supplier Reality: Returns, Advances and Landed Cost                         | **Reverse in the order you posted**           | rule    | Reverse in the order you posted, put freight into the stock rather than the expense column, and let the allocation do the work.         |
| 13  | Volume 4 · Warehouses, Transfers and Stock Counts                                      | **One voucher, two rows**                     | phrase  | A transfer is a receipt and an issue wearing one voucher, so the total never moves while the location does.                             |
| 14  | Volume 4 · FIFO, Landed Cost and Valuation Reports                                     | **Value in equals value out plus value left** | rule    | Value in equals value out plus value left, and under FIFO the cost of a sale belongs to the oldest layer, not to the item.              |
| 15  | Volume 4 · Scanning on the Floor: Barcode Capture and Mobile Counting                  | **Scan, confirm, recount, sign**              | phrase  | A scan is only evidence when the label, the count and the voucher agree, and the difference has a signature.                            |
| 16  | Volume 5 · Journals, Accruals and the Bank                                             | **Accrue, prepay, reconcile, reverse**        | rule    | Four journal situations recur every month, and each one has a reversal date that decides whether the next period is clean.              |
| 17  | Volume 5 · Month-End and Year-End Close                                                | **Move, judge, calculate, lock**              | phrase  | Close in one order: fix what moves, then judge, then calculate, and only then lock the period so nobody can edit it.                    |
| 18  | Volume 6 · HR Foundation: Employees, Leave, Attendance and Claims                      | **The employee record is the payroll input**  | rule    | The employee record is the payroll input, so build the calendar, the identifiers and the approvals before the first slip.               |
| 19  | Volume 6 · Payroll and Malaysian Statutory Deductions                                  | **Gross, statutory, net, remit**              | phrase  | Gross is expense, deductions are liabilities, employer shares are cost, and every liability must clear to zero by its deadline.         |
| 20  | Volume 7 · Bills of Materials and Work Orders                                          | **Recipe, promise, reserve, issue, complete** | phrase  | A recipe, a promise, a reservation, an issue and a completion: five steps from demand to finished goods, each with its own document.    |
| 21  | Volume 7 · Production Costing, Scrap and Subcontracting                                | **Good units carry the bad ones**             | rule    | Total production cost is fixed; the only question is how many good units must carry it, and scrap never answers that with a journal.    |
| 22  | Volume 8 · Projects, Timesheets and Billable Work                                      | **Every entry names the project**             | rule    | A project is a collector, and it only collects what names it, so every hour and every invoice must carry the project field.             |
| 23  | Volume 8 · Assets, Quality and CRM                                                     | **Capitalise, depreciate, inspect, qualify**  | phrase  | Capitalise, depreciate, inspect and qualify: four modules, one habit of proving each of them against a register and a report.           |
| 24  | Volume 8 · The Service Desk: Issues, SLAs and Warranty Claims                          | **Priority before promise**                   | rule    | Log the issue against the serial, measure the clock, decide warranty with evidence, and bill what the agreement allows.                 |
| 25  | Volume 9 · Print Formats, Naming and Notifications                                     | **Readable, numbered, said once**             | phrase  | Documents customers can read, numbers an auditor can follow and messages that arrive once: three controls, all configuration, no code.  |
| 26  | Volume 9 · Customise Without Code: Property Setters, Custom Fields and Custom DocTypes | **Setters first, code last**                  | rule    | Configuration is what you can reverse in the browser; everything else is development, and it is somebody else's promise.                |
| 27  | Volume 9 · Permissions, Workflows and Automation                                       | **Roles do, permissions see**                 | rule    | A role says what a job may do, a user permission says which rows it may see, and the only test that counts is the restricted login.     |
| 28  | Volume 10 · Malaysian Tax and Statutory Setup                                          | **One template per rate per direction**       | rule    | One tax template per rate per direction, an item category that follows the product, and a return that is the ledger seen three ways.    |
| 29  | Volume 10 · e-Invoice (MyInvois) End to End                                            | **Validate, submit, read, cancel inside 72**  | phrase  | Master data validates before anything is submitted, a submission returns two lists, and cancellation lives inside 72 hours only.        |
| 30  | Volume 11 · Migration: Mapping, Opening Balances and Import                            | **Agree, then parents before children**       | phrase  | Agree the mapping on paper, then import parents before children, and let one dated journal carry every opening balance.                 |
| 31  | Volume 11 · UAT, Cut-Over and Go-Live                                                  | **Script, sequence, numbers, hand over**      | phrase  | A script the client signs, a weekend in dependency order, a fortnight measured in numbers, and a pack that outlives the consultant.     |
| 32  | Volume 11 · Continuity: Backups, Staging and Upgrades                                  | **Backup, prove, stage, pin**                 | rule    | Pin the versions, prove the restore, test on staging, and let one named person approve the upgrade.                                     |
| 33  | Volume 11 · Site Security and Hardening: Protecting the Company's Money                | **Least privilege, then prove it**            | rule    | One person one account, two factors, the smallest privilege, the fewest open doors, and every key with an owner and a date.             |
| 34  | Volume 11 · The First Ninety Days: Health Checks and Handing Over                      | **Week, month, quarter, exit**                | path    | Rhythm for the first week, triage by consequence, prove adoption with numbers, and leave a named owner who never needs you.             |

## The cards

### 1. Primer · Accounting Concepts in ERPNext — DEAD CLIC

-   DEAD: debits increase Expenses, Assets and Drawings
-   CLIC: credits increase Liabilities, Income and Capital
-   Type first, sign second: the account type fixes the normal balance
-   A debit is not 'good' and a credit is not 'bad', they are directions

1. **A sale posts to which two accounts before any tax?** Debtors (asset) debit and Sales (income) credit; tax adds a liability, it is never income.
2. **You posted the same invoice twice. What does the trial balance show?** It still balances. A double posting is wrong but symmetric, so only the ledger or a report catches it.
3. **Why is SST a liability rather than a cost?** The customer paid it to you on the government's behalf, so you hold it until the return is filed.
4. **Which three books does one transaction touch?** General ledger for worth and profit, payment ledger for settlement, stock ledger for quantity and value.
5. **When is a Journal Entry the right document?** When no business document exists: accrual, depreciation, correction or opening balance. Never for a sale or a purchase.

_Trap:_ The receivable control account and the customer statement disagree at month end. The control account reads the general ledger while the statement reads the payment ledger, so unallocated cash shows a customer owing money they already paid.

### 2. Primer · Distribution Concepts in ERPNext — TRIC

-   Transfer: warehouse to warehouse, ownership unchanged
-   Receipt: goods in from a supplier or a return from a customer
-   Issue: goods out with no customer, such as scrap or internal use
-   Count: Stock Reconciliation posts the difference between shelf and system
-   Only a submitted document moves stock; a draft moves nothing

1. **Which documents change stock quantity?** Purchase Receipt, Delivery Note, Stock Entry and Stock Reconciliation, and only once submitted.
2. **Why does one product have four prices?** Four channels with different economics: each channel is a price list plus its own rules, not a reporting label.
3. **How is a reorder point calculated?** Average daily demand times lead time, plus safety stock for demand and supply variability.
4. **Gross margin or net margin, what is the difference?** Gross is selling price less landed cost; net also absorbs discounts, freight out and overheads.
5. **What breaks when a partial delivery becomes a second order?** The order book doubles, fill rate collapses and the same stock is promised twice.

_Trap:_ Freight is booked as an expense line instead of being allocated into stock. The cost hits the profit and loss once, every later sale reports a margin that is too high, and the margin stack can never be reconciled.

### 3. Volume 0 · How ERPNext Thinks: The Document Lifecycle — Draft, commit, cancel, amend

-   Draft does nothing at all: no stock, no ledger, no report row
-   Submit is the commit: one click writes the stock ledger and the general ledger
-   Cancel reverses with offsetting rows and keeps the document for the record
-   Amend only follows a cancel and links back through amended_from
-   References block a cancel, so a chain unwinds from the invoice down to the delivery

1. **What does saving a draft change in the stock and the books?** Nothing. No stock ledger entry and no general ledger row exists until the document is submitted, so drafts are invisible to reports.
2. **Why can a submitted document not simply be deleted?** Its stock and ledger rows are already posted. Cancelling writes offsetting rows and keeps the record, which is what an auditor needs to see.
3. **What must happen before a document can be amended?** It must be cancelled first. Amend then creates a new document carrying amended_from, while the original stays cancelled and untouched.
4. **What does the error Active Referencing Documents tell you to do?** A submitted document points at this one, so cancel from the bottom of the chain upwards: invoice first, then delivery note.
5. **Which single report check proves a posting really happened?** Open the Stock Ledger and the General Ledger filtered by the voucher. If the rows are there, the document posted; if not, it is still a draft.

_Trap:_ The client asks you to 'just delete' a wrongly submitted invoice so the ageing report looks right. Submitted documents cannot be deleted because their ledger rows already exist. Cancel it, then amend or re-raise, and show the Version log so the correction is visible rather than erased.

### 4. Volume 0 · Driving the Desk Like an Operator — Search, filter, save, share

-   Search: two letters in the awesome bar beats any menu path you can memorise
-   Filter: stack conditions in a list view until the question is answered
-   Save: name the view for the job and make it the default for that role
-   Share: permissions narrow the rows, so test the view as the restricted user
-   Export last: a filtered export is a snapshot, never a report to reconcile against

1. **Which control reaches every DocType, document and report from one field?** The awesome bar at the top of the Desk. Two letters and Enter open a doctype list; a document name jumps straight to the record.
2. **What makes a saved filter more useful than a custom report?** It is configuration, so it survives upgrades, respects user permissions and can be changed by the client without a developer.
3. **Why will the same saved view show different rows to two users?** Saved filters are shared, but user permissions restrict which records each person may see, so the row count differs by role.
4. **When is Report Builder the wrong tool?** When the question needs joins across DocTypes or logic that SQL cannot express. That is a Query or Script Report, and you will maintain it.
5. **What is the fastest way to prove a report total is right?** Reproduce the same filter in the list view and compare the record count and the total. The list shows its filters; the report hides them.

_Trap:_ You build a perfect default view as administrator, demo it, and the dispatch clerk says it is empty on their login. User permissions filter the rows inside a saved view. Always sign in as the restricted user, or create one, before declaring the view finished.

### 5. Volume 0 · Standing Up the Company — Broad to narrow, then prove it

-   Company first: abbreviation, currency and fiscal year, because everything else hangs off it
-   Then the tree: keep the template, add leaf accounts, never rename the standard tree
-   Then defaults: round off and write off accounts that every document silently inherits
-   Then dimensions: cost centres split a posting for analysis, never the total
-   Then tax: SST templates and accounts, and no GST anywhere

1. **Which five root groups must a new company show?** Application of Funds, Sources of Funds, Equity, Income and Expenses. A missing group means the template did not load.
2. **Why never rename the standard account tree?** Reports and tax templates look accounts up by name, so renaming breaks every report the client will ever ask for.
3. **Where do rounding differences land?** The Round Off account set in company defaults, never in the customer's receivable.
4. **Do cost centres change the trial balance?** No. A dimension splits a posting for analysis while the total stays exactly the same.
5. **A 1,200.00 net invoice at SST 10 per cent, what are tax and total?** 120.00 tax and 1,320.00 grand total. Predict it before the invoice is saved.

_Trap:_ The company abbreviation is changed after documents have been posted. The abbreviation is baked into every account name and series prefix already used, so changing it orphans history instead of renaming it.

### 6. Volume 0 · Making the System Usable — Master data before permissions

-   UOM and warehouses are masters: a typo becomes a plausible wrong balance
-   A user is a login, a role is a bundle of DocType permissions, a role profile bundles roles
-   Role permissions say what you may do, user permissions say which rows you may see
-   Naming series and valuation method are chosen once and changed only by reposting

1. **One box equals twelve pieces. What does a receipt of 1 Box post?** A stock balance of 12 Nos, because every stock row and valuation runs in the stock UOM.
2. **What must every warehouse point at?** A stock account through the company defaults, so valuation has somewhere to post.
3. **Role permission or user permission, which one wins?** The narrower of the two: the role grants the action, the user permission filters the rows.
4. **The valuation method was wrong since go live. What is the honest fix?** Repost Item Valuation, not an edit. The method itself is set per company and is not a per document choice.
5. **Which three things are verified before anyone is allowed to transact?** Company and abbreviation against registration documents, currency and fiscal year, then the chart of accounts.

_Trap:_ The storekeeper is given the Stock Manager role just to be safe. That role also opens Accounts and Buying, and the user permissions then look broken when the real problem was the grant nobody needed.

### 7. Volume 1 · The Item Master — GUST

-   Gate: Maintain Stock. Switched off, the item never reaches the stock ledger
-   G: Group and brand, the reporting tree rather than a folder
-   U: UOM, the stock UOM plus the conversions that valuation runs on
-   S: Serial or batch, decided once because later documents will demand it
-   T: Tax, the item tax template that can override the customer default

1. **What does Maintain Stock switched off mean?** The item never touches the stock ledger, though it can still be bought and sold as a service.
2. **Serial or batch, and when?** Serial for units traced individually such as warranty appliances, batch for quantities made or received together with expiry.
3. **An item has no Item Price record for the list. What rate loads?** Zero, and the document will post at zero unless someone reads the rate before submitting.
4. **Which mechanism turns 216.00 into 205.20?** A pricing rule applying five per cent, resolved after the item price sets the base rate.
5. **Why is the stock UOM special?** Every stock ledger row, Bin and valuation figure is kept in it, and other UOMs are only conversions of it.

_Trap:_ Batch tracking is switched on for an item that already holds stock. The existing quantity has no batch, so the next issue cannot choose one. Opening batches or a reconciliation must come first.

### 8. Volume 1 · Parties and Pricing — Party, address, terms, price

-   Customer: group and territory for reporting, price list and payment terms for behaviour
-   Address is its own record linked to the party, not a field typed on the customer
-   Supplier: group drives purchase reporting, payment terms drive the payment run
-   Price resolves as item price, then pricing rule, then the transaction default

1. **Where does a quotation's price list come from?** The customer's default price list, after which a pricing rule may override the rate on the line.
2. **Why is an address a separate document?** One party can hold billing, shipping and contact addresses, and each document picks the one it needs.
3. **Item Price or Pricing Rule?** An item price states this item on this list at this rate from this date; a rule tests conditions and overrides it.
4. **Ten units for a dealer at 216.00 less five per cent?** 205.20 per unit, so 2,052.00 net before tax.
5. **What do supplier payment terms actually drive?** The payment schedule on the bill, and therefore the payment run and the ageing buckets.

_Trap:_ A pricing rule is created without a priority or a validity window. Two rules then match the same line and the winner depends on evaluation order, so one customer is charged differently on different days.

### 9. Volume 2 · Quote to Cash, Step by Step — Four chases

-   Quote chases Order: the offer becomes a commitment with dates and warehouses
-   Order chases Delivery: the physical event that moves stock and posts cost of goods sold
-   Delivery chases Invoice: revenue, receivable and tax in one posting
-   Invoice chases Payment: cash in, allocated, outstanding at zero
-   Quote and order are promises, delivery and invoice are facts

1. **What does submitting a quotation change?** Nothing in the ledger and nothing in stock. It is an offer with a validity date.
2. **Which document posts cost of goods sold?** The Delivery Note, using the valuation the stock ledger already holds, not the invoice.
3. **Five units leave Main Warehouse at 120.00. What is cost of goods sold?** 600.00, and Stock Balance then shows zero with no negative quantity anywhere.
4. **Why convert the invoice from the delivery note?** So billed quantity equals dispatched quantity and the order does not stay open as to bill.
5. **What makes a payment entry clear an invoice?** Allocation. Cash without allocation leaves the invoice open and the customer looking like a debtor.

_Trap:_ The invoice is raised before the goods leave and the delivery note is then forgotten. Revenue and receivable rise while stock and cost of goods sold never move, so the margin looks perfect and the warehouse is wrong.

### 10. Volume 2 · When Reality Intervenes — One order, many documents

-   A partial delivery edits the delivery note against the order and never creates a second order
-   A discount reduces the line, and tax recalculates on the reduced net
-   A return is created against the original invoice, so three things reverse at once
-   Credit checking is switched on once in selling settings, then enforced per customer

1. **Two of five units are delivered. What does the order show?** Partly delivered with three pending, while stock falls by two and the remaining three stay in the warehouse.
2. **Ten per cent off 1,200.00 gives which three numbers?** 1,080.00 net, 108.00 SST and 1,188.00 total.
3. **How is a credit note created?** As a return against the original invoice, so stock, revenue and tax all reverse together.
4. **Where is credit checking switched on?** Selling Settings once, after which the limit itself lives on the customer record.
5. **Which three reports close a sales month?** General ledger by party, payment ledger and aged receivables, and they must agree before anyone says done.

_Trap:_ A credit note is raised as a new invoice carrying negative quantities. Revenue reverses but the original invoice stays open, so the customer balance is overstated and the ageing report lies.

### 11. Volume 3 · Buying, Step by Step — Buying is selling backwards

-   Purchase order mirrors the sales order: the commitment
-   Purchase receipt mirrors the delivery note: the goods move, profit does not
-   Purchase invoice mirrors the sales invoice: the creditor appears and interim stock clears
-   Payment entry mirrors payment entry: cash out, allocated
-   The asymmetry: the receipt may be skipped on paper, but then interim stock never clears

1. **Which purchase document moves stock?** The Purchase Receipt. It debits stock and credits an interim stock account, so no profit appears yet.
2. **What does the three way match compare?** Quantity, rate and total across order, receipt and bill, and a mismatch is what blocks or flags the bill.
3. **What goes wrong when you bill without receiving?** The interim stock account never clears and no stock arrives, yet the liability exists for goods you do not hold.
4. **Which three numbers are read before a purchase order is submitted?** Net total, tax and grand total, each equal to the sum of the lines.
5. **What makes a supplier payment settle the bill?** Allocation against the purchase invoice. The payment entry alone only moves cash.

_Trap:_ The purchase invoice is entered at a rate that differs from the order and the receipt. The mismatch surfaces late, after stock has been valued at the receipt rate, and the difference becomes a price variance nobody owns.

### 12. Volume 3 · Supplier Reality: Returns, Advances and Landed Cost — Reverse in the order you posted

-   A return reverses the receipt first and the bill second, which is the order auditors expect
-   An advance is a payment with no invoice, so it is a liability until it is allocated
-   Landed cost allocates freight, duty and clearing into the stock valuation, not the profit and loss
-   A payment order groups invoices due on one date so the bank sees one instruction
-   Every remedy is a new document with a number, and history is never edited

1. **One damaged unit goes back to the supplier. In what order?** The goods return first, then the bill adjustment, so stock and tax reverse together.
2. **How is an advance to a supplier recorded?** A payment entry with no allocation against an invoice, so it stays a liability rather than an expense.
3. **Where does inbound freight belong?** In a Landed Cost Voucher, allocated across the received units and revaluing the stock they sit in.
4. **What must be true after a landed cost allocation?** The downstream margin reports actually use the new valuation, otherwise the allocation is decoration.
5. **What do ageing buckets tell you?** When money leaves, not whether the bill is correct. Correctness is the three way match.

_Trap:_ Freight is booked straight to an expense because the landed cost voucher looks like extra work. The cost lands once, stock stays under valued, and every later sale reports a margin that cannot be defended.

### 13. Volume 4 · Warehouses, Transfers and Stock Counts — One voucher, two rows

-   A warehouse is a location with its own ledger, so each one must earn its place
-   A transfer moves quantity between warehouses and leaves the total and ownership untouched
-   Two stock ledger rows, same rate, one voucher: one outgoing and one incoming
-   Stock Reconciliation is the only honest correction after a physical count
-   Reorder level is the trigger, reorder quantity is the batch it suggests

1. **How many stock ledger rows does a transfer create?** Two, an outgoing and an incoming row at the same rate, written by one voucher.
2. **What corrects a count difference?** A Stock Reconciliation with the counted quantity, including counts that are zero.
3. **Which three numbers must agree after any movement?** Bin quantity, the stock ledger running total and the Stock Balance report.
4. **Reorder level or reorder quantity?** The level triggers the alert, the quantity is how much the suggestion orders.
5. **Does reserving stock for a work order move the ledger?** No. Reserved quantity is planning only, and only a Stock Entry moves stock.

_Trap:_ A transfer is posted to fix a count difference between two warehouses. The total is unchanged, so the system now agrees with itself and disagrees with the shelf, and the error only moves.

### 14. Volume 4 · FIFO, Landed Cost and Valuation Reports — Value in equals value out plus value left

-   Every receipt creates a valuation layer at its own rate
-   Issues consume the oldest layer first, so cost follows the queue rather than the item
-   Repost Item Valuation recalculates layers from history and rewrites downstream cost
-   Negative stock keeps operations moving and leaves valuation guessing
-   Three reports must agree before any stock number is presented

1. **Which layer does a sale consume under FIFO?** The oldest remaining layer, at that layer's own rate.
2. **Receipts at 100 and 120, then one unit sold. What is the cost?** 100, because the oldest layer leaves first and 120 stays in stock.
3. **How is a wrong valuation corrected?** Repost Item Valuation. A journal would create a second version of the truth beside the ledger.
4. **What does negative stock do to valuation?** It guesses a rate, usually the last known, so cost of goods sold and stock value both drift.
5. **Which three figures must agree?** Stock Balance quantity, the stock ledger value and the stock account in the general ledger.

_Trap:_ Landed cost is added after the stock it belongs to has already been sold. The sale consumed a layer without the freight, so cost of goods sold is understated and the revaluation creates profit from nothing.

### 15. Volume 4 · Scanning on the Floor: Barcode Capture and Mobile Counting — Scan, confirm, recount, sign

-   Scan to capture, but read the totals back before anything is submitted
-   Confirm the barcode is unique to one item and converts the carton correctly
-   Recount above the money threshold before a difference is posted
-   Sign the sheet, attach it to the reconciliation, and keep the device export
-   Prove the sync once by sending it twice, and confirm the duplicate is refused

1. **What is the measurable business case for scanning on the warehouse floor?** Variance and write-off value, measured before and after. Speed is nice; a distributor that stops writing off stock has a number finance will defend.
2. **Why must the barcode list be checked for duplicates before go-live?** A code pointing at two items resolves silently to one of them, so both count wrong and no error is raised at the scanner.
3. **What turns a count difference into an auditable event?** The signed count sheet, the device export with user and timestamp, and the reconciliation voucher that carries both as attachments.
4. **What must be proved about a device that queues scans offline?** That the voucher total equals the device total, and that a repeated sync with the same reference is refused rather than posted twice.
5. **How is a recount threshold best expressed?** In money per line, with a second counter above it and a named approver, because value is what the write-off costs.

_Trap:_ The pilot scans beautifully in the meeting room, so go-live is declared and the SOP is never written. Label stock runs out, a batch refuses to scan and one trained person is on leave, so the floor reverts to paper. Hand over a kit list, a four-page SOP, two trained people per shift and an exception register.

### 16. Volume 5 · Journals, Accruals and the Bank — Accrue, prepay, reconcile, reverse

-   Accrual: the cost belongs to this month, the invoice arrives next month, and a reversal is set now
-   Prepayment: an asset until the cover it buys is consumed, released month by month
-   Reconciliation proves every statement line exists in the ledger and every ledger line on the statement
-   Corrections are reversals or amendments with a trail, never edits to a submitted entry

1. **When does an accrual reverse?** On the reversal date set when it was posted, so the actual invoice lands cleanly in the next period.
2. **What is a prepayment before it is consumed?** An asset: cover that has been paid for but not yet used.
3. **What does a clean bank reconciliation prove?** That every statement line is matched to the ledger, so cash for the period is fully explained with no plug.
4. **How is a submitted journal corrected?** Reverse it, or cancel and amend, because the trail is the whole point.
5. **Which four journal situations recur monthly?** Accrual, prepayment release, depreciation and correction.

_Trap:_ A suspense account absorbs whatever the bank reconciliation cannot explain. Cash is then explained by an account nobody owns, and the balance grows every month until the close cannot be defended.

### 17. Volume 5 · Month-End and Year-End Close — Move, judge, calculate, lock

-   Cash: reconcile the bank statement to the ledger before anything else
-   Count: reconcile stock and clear negative quantities
-   Judge: accruals and prepayments for costs incurred but not yet billed
-   Calculate: depreciation and any valuation repost
-   Lock: the Period Closing Voucher posts the closing entries and marks the period reported

1. **What is the most common month end failure?** Closing with unposted documents: drafts, unallocated payments and negative stock.
2. **What does the Period Closing Voucher actually do?** It zeroes income and expense accounts into the closing account and leaves balance sheet accounts alone.
3. **Can a document be edited in a closed period?** Not without reopening or correcting in the next period. The close is a lock, not a label.
4. **At year end, what carries forward?** Every balance sheet balance, while the profit and loss closes into equity.
5. **Who signs a close off?** Every row of the close calendar needs an owner and a proof, and the pack must read without the system.

_Trap:_ The period is closed to stop people posting, before anything is reconciled. The voucher locks in whatever was wrong and every later report inherits it, so the correction costs twice the work.

### 18. Volume 6 · HR Foundation: Employees, Leave, Attendance and Claims — The employee record is the payroll input

-   Install the HR app in a maintenance window, after a backup, and record the versions either side
-   Holiday lists and shifts decide what leave and attendance mean, so build them first
-   Joining date, department, statutory identifiers and bank details are the four payroll inputs
-   Leave without pay and overtime must reach payroll, or the first salary is wrong
-   Salary fields belong to HR and finance only, recorded in the access review

1. **What has to exist before anyone applies for leave?** The holiday list for the current and next year, the leave types with their entitlement, and the approver rule. Otherwise the first public holiday eats an entitlement.
2. **Which four employee fields does payroll actually read?** Joining date, department, the statutory identifiers (EPF, SOCSO, EIS, tax number) and bank details. Everything else is context.
3. **Why does leave without pay have to reach payroll?** Because an unpaid day that never becomes a deduction is a salary overpayment the employee spots before the consultant does.
4. **What do the four pre-payroll checks cover?** Headcount name by name against the payroll list, record completeness, leave balances against policy, and advances cleared or explained.
5. **How should the HR app installation be handled?** As a maintenance change: backup first, ask the host to fetch and install the app, migrate, open every new document, then record the versions.

_Trap:_ HR is configured but the client's real employee list lives in a spreadsheet, so payroll runs from the spreadsheet and the system becomes a museum. Payroll must read the employee records or the system is decoration. Reconcile headcount name by name before the first run, and make the spreadsheet read-only the week payroll goes live.

### 19. Volume 6 · Payroll and Malaysian Statutory Deductions — Gross, statutory, net, remit

-   Gross wages are expense, split by cost centre where labour cost is measured
-   Employee deductions are four liabilities owed to four authorities, never a reduction in expense
-   Employer shares are extra cost on top of gross, with their own liabilities
-   Net pay is a payable to employees until the bank transfer clears it
-   Every liability clears to zero at remittance, and the month is filed with acknowledgements

1. **What are the five outputs a payroll month must produce?** Payslips, a payroll register, the salary journal, the statutory remittances, and data sufficient for the annual earnings statement.
2. **Why is the journal larger than net pay?** Because gross includes employer EPF, SOCSO and EIS shares as extra expense, while net pay is gross minus the employee's deductions only.
3. **What belongs in the income tax setup, and what must be dated?** The published brackets, reliefs and rebates from the current schedule — and a dated note of the source and who confirmed it.
4. **What proves a payroll month is finished?** Register equals journal, four statutory liabilities at zero after remittance, salary payable cleared, headcount agreed, and the month filed.
5. **How is a leaver's final month assembled?** Prorate from the relieving date, encash remaining leave, clear advances, then pay — and close the employee record with a date.

_Trap:_ The first payroll runs, the payslips look right, and nobody checks the journal — so the statutory liabilities sit in one account and go unpaid until a penalty arrives. A correct slip is not a correct month. Four separate liability accounts, a remittance calendar with owners, and four month-end checks make the compliance visible before an authority asks.

### 20. Volume 7 · Bills of Materials and Work Orders — Recipe, promise, reserve, issue, complete

-   BOM: quantities and operations, with the cost of both, written so the floor can follow it
-   Work order: this item, this quantity, this date, a promise to the floor
-   Reservation: planning only, because quantities reserved never move the ledger
-   Material Transfer for Manufacture: components move to the work in progress warehouse
-   Manufacture: components consumed and finished goods produced in one document

1. **Does a work order move stock?** No, it reserves. Only the transfer and the manufacture entry move quantity.
2. **What is work in progress?** The value of components consumed but not yet finished, sitting in the work in progress warehouse.
3. **What does a BOM cost roll up contain?** Material cost plus operating cost per unit, at the BOM's own rates and operations.
4. **Where are components actually consumed?** In the Manufacture stock entry, which also produces and values the finished item.
5. **Why must the finished valuation be explainable?** It becomes the cost of every later sale, so an unexplainable BOM cost is an unexplainable margin.

_Trap:_ Components are issued straight out of the main warehouse and the work in progress step is skipped. Nothing is ever in process, so a half finished order looks like a stock loss and the finished goods value cannot be rebuilt.

### 21. Volume 7 · Production Costing, Scrap and Subcontracting — Good units carry the bad ones

-   Finished cost is materials consumed plus operations recorded, divided by good units
-   Scrap is a quantity decision on the document, never a cost typed into a journal
-   Total production cost is unchanged by scrap, so the good units absorb it
-   Subcontracting is material out, service in and material back: three movements, one valuation
-   Every ringgit of production cost lands in inventory, not in an expense account

1. **How is cost per finished unit calculated?** Materials plus operations, divided by good units, with scrap in the numerator and never quietly subtracted.
2. **One of ten units is scrapped. What happens to total cost?** It stays the same and the nine good units carry it, so unit cost rises.
3. **How is scrap recorded?** As a quantity on the manufacture entry or a separate scrap entry, not as a journal.
4. **How many movements does subcontracting create?** Three: material out to the subcontractor, the service received, and the finished material back.
5. **Where must production cost land?** In inventory value. An expense account here means the stock was under costed.

_Trap:_ Scrap is written off to an expense account at the end of the month instead of on the document. Finished units then carry a cost that excludes the loss, the true unit cost is understated, and the expense appears where nobody looks.

### 22. Volume 8 · Projects, Timesheets and Billable Work — Every entry names the project

-   A project is a cost collector whose profit and loss exists only if postings name it
-   Four fields before work starts: rate, cost centre, dates and customer
-   A timesheet records hours against project and activity and carries both a billing and a costing rate
-   Invoice from the timesheet so hours, rate and project travel together
-   Closing stops time and cost, and does not reverse revenue already billed

1. **Why is a project profit and loss empty?** Something was posted without the project field, because the collector only sees postings that name it.
2. **Where does project revenue come from?** Sales invoices that name the project, not quotations and not orders.
3. **What does a timesheet carry besides hours?** A billing rate and a costing rate, so one hour is both revenue and cost.
4. **Why invoice from the timesheet?** Hours, rate and project land on the invoice without retyping, so the margin stays traceable.
5. **What does closing a project do?** It stops further time and cost postings, and it does not reverse revenue already billed.

_Trap:_ Hours are captured on the timesheet but the invoice is raised by hand at a different rate. Revenue and cost no longer share a rate, so project margin is fiction and the timesheet becomes paperwork nobody trusts.

### 23. Volume 8 · Assets, Quality and CRM — Capitalise, depreciate, inspect, qualify

-   Capitalise: a purchase invoice with an asset item creates the Asset record
-   Depreciate: a journal generated from the schedule, monthly, not once in a December panic
-   Inspect: Quality Inspection sits between the receipt and the warehouse when configured
-   Qualify: lead, then opportunity, then a priced quotation
-   Asset register, ledger and schedule must show the same accumulated amount

1. **How is a van capitalised rather than expensed?** With a purchase invoice whose item is marked as a fixed asset, which creates the Asset record.
2. **Where does accumulated depreciation have to agree?** In three places: the asset register, the depreciation account in the ledger and the schedule.
3. **Lead or opportunity?** A lead is an unqualified contact, an opportunity is a deal with a value, a date and a probability.
4. **How is weighted pipeline calculated?** Sum of value times probability across all open opportunities.
5. **When does a quality inspection happen?** On receipt, before the goods become available stock, when the item is configured that way.

_Trap:_ Depreciation is posted once a year as a single large journal in December. Eleven months of the profit and loss are wrong and the register never matched the ledger in between, so nobody could catch it early.

### 24. Volume 8 · The Service Desk: Issues, SLAs and Warranty Claims — Priority before promise

-   Priority is set by impact at logging, and the SLA clock follows the priority
-   Promises are made in a calendar, so working hours and holidays decide the measurement
-   Warranty is decided from the serial's delivery date and recorded with its reason
-   Repair, replace or credit is chosen before work starts, because each needs different documents
-   Every closed issue carries a resolution note and, if billable, an invoice that names it

1. **Which five fields make an issue defensible later?** Asset, symptom, reporter, priority and promised response, plus the resolution note on close. Everything else is optional.
2. **Why do service levels breach themselves over a long weekend?** Because the clock runs on the service calendar. If working hours and holidays are not configured, a Friday evening issue breaches by Monday morning.
3. **What decides whether a repair is free of charge?** The serial's delivery date against the warranty period, the exclusions in the agreement, and the evidence attached at logging. The decision and its reason are recorded.
4. **Why is a replacement the riskiest of the three service outcomes?** Because it needs a delivery out and the old unit back in. If the return is forgotten, a serial that no longer exists stays in stock forever.
5. **Which four numbers belong in the monthly service pack?** Open issues by priority, median response and resolution per priority, warranty cost versus revenue per model, and billable versus absorbed hours.

_Trap:_ The client handles complaints by phone and goodwill, so the desk is configured but never used, and warranty cost is invisible. Goodwill with no record is a subsidy nobody measures. Log every complaint against the serial, record each warranty decision with its reason, and put the four numbers in a monthly pack the purchasing lead reads.

### 25. Volume 9 · Print Formats, Naming and Notifications — Readable, numbered, said once

-   Print format: sections, fields and totals from the builder, with no code to maintain
-   A Malaysian tax invoice needs the company name, registration number and SST number
-   Naming series control the numbers, and gaps are the auditor's first question
-   A notification watches one event with one condition and one recipient list
-   Test print and notification changes on a real document in a real state

1. **What must a Malaysian tax invoice show?** Company name, registration number and SST number, plus the tax breakdown per line.
2. **What do auditors ask about numbering first?** Whether there are gaps or duplicates in the series, and who can edit the prefix.
3. **Why does a notification fire twice?** It is attached to more than one event, or its condition matches both a draft and a submit.
4. **What should never be customised with code in this volume?** Anything the print format builder or notification fields already do, because code does not survive an upgrade.
5. **How is a print format tested?** With a real submitted document carrying real tax and a real address, never with a blank form.

_Trap:_ A notification is configured to fire on save as well as on submit. Every draft edit emails the customer, people stop reading the messages, and the control that catches late invoices is gone.

### 26. Volume 9 · Customise Without Code: Property Setters, Custom Fields and Custom DocTypes — Setters first, code last

-   Property setters change labels, mandatory and read-only without touching the standard
-   Custom fields need a reporting question before they need a type
-   A custom DocType needs its naming series decided before the first record
-   Child tables are for anything the client will count, sum or report per row
-   Every change gets a register row with its reason and its reversal

1. **How do you tell whether a request is configuration or development?** If it can be made and reversed in the browser without a file or a deployment, it is configuration and it is yours. Otherwise it belongs to a developer.
2. **What does a property setter leave untouched underneath?** The standard DocType definition. The override sits on top, so a migration replaces the standard and keeps the setter.
3. **Which custom DocType decision is hardest to undo and why?** The naming series. Every record name is referenced by links, so renumbering later breaks them. Decide before the first save.
4. **When does a table field beat a long text field?** When somebody will count, sum or report per line, such as findings by severity. Rows can be reported; prose cannot.
5. **What must the change register carry besides the change itself?** The reason it was made, who asked for it, the date, and how to reverse it — plus a copy held outside the system.

_Trap:_ A promising sales demo ends with 'we can make it do anything', so three code changes are promised, none are priced, and go-live slips. Anything needing a file is development with its own testing and rollback. Offer the configuration path, price the code path, and record the gap as a decision the client owns.

### 27. Volume 9 · Permissions, Workflows and Automation — Roles do, permissions see

-   Name roles after the job function, never after a person
-   User permissions filter rows and outweigh what the role would otherwise show
-   A workflow adds states and allowed transitions, so a document cannot jump to submitted
-   Auto repeat copies a document on a schedule, which suits subscriptions and retainers only
-   Test the restricted login, not the administrator

1. **Role permission or user permission, what is the difference?** A role grants actions on a DocType, a user permission filters the records, and the narrower wins.
2. **How is a user kept to one warehouse?** With a user permission on Warehouse for that user, not with a new role.
3. **What makes a discount workflow correct?** A low discount flows straight to submitted while a high one waits at pending approval for the right role.
4. **When is auto repeat safe?** For genuinely recurring documents with a fixed shape, never for ones a human must judge.
5. **What does an access review check?** That every active login still matches a job, quarterly, including the ones nobody uses.

_Trap:_ A user permission is added to fix a report that looks wrong. The report was the symptom of an over broad role, so filtering rows hides the grant and the next report breaks differently.

### 28. Volume 10 · Malaysian Tax and Statutory Setup — One template per rate per direction

-   Sales tax out, service tax out and purchase tax in never share a template
-   Goods at ten per cent and services at eight per cent sit on separate lines and templates
-   Item tax category overrides the customer default, which must be intended rather than discovered
-   SST-02 comes from posted invoices, so drafts and cancellations are excluded
-   The return, the tax summary and the ledger are one number seen three ways

1. **Why one template per rate per direction?** The posting account and the return box differ by direction, and mixing them makes the return untraceable.
2. **Goods at ten per cent and services at eight per cent on one invoice?** Two lines on two templates, each rate posting to its own account.
3. **Item tax category or customer default, which applies?** The item's category wins, which is useful for exempt goods and dangerous when unintended.
4. **Which documents feed the SST-02 return?** Posted invoices only, because drafts, cancelled documents and unsubmitted returns are excluded.
5. **Which three numbers must agree?** The return figure, the tax summary by account and the ledger balance of the tax account.

_Trap:_ An exempt customer is handled by typing zero per cent into the rate field. No exemption category or certificate sits behind the zero, so the return cannot evidence why tax was not charged.

### 29. Volume 10 · e-Invoice (MyInvois) End to End — Validate, submit, read, cancel inside 72

-   Validate the masters first: TIN, registration number, MSIC code and SST number
-   Submit and read the answer: a submission ID, then accepted and rejected lists
-   Accepted, validated and cancelled are three different states, not one
-   Cancellation inside 72 hours with a reason, refused afterwards
-   Consolidate many small sales to the public, and self bill when you invoice yourself

1. **What does a submission return?** A submission ID, an accepted list carrying validation identifiers, and a rejected list with reasons.
2. **How long is the cancellation window?** 72 hours after validation, after which only a credit or debit note can correct the document.
3. **What are document types 01 to 04?** Invoice, credit note, debit note and refund note.
4. **When is consolidation allowed?** For many small sales to the general public grouped into one monthly e-Invoice, not for business buyers.
5. **What must the finance team be able to see?** One board showing pending, accepted, rejected and cancelled documents, with the reason for each rejection.

_Trap:_ A rejected document is resubmitted unchanged. The validator rejects it for exactly the same reason while the 72 hour clock keeps running, so the master data or tax code must be fixed first.

### 30. Volume 11 · Migration: Mapping, Opening Balances and Import — Agree, then parents before children

-   The mapping workbook holds old value, new value, owner and decision date, signed before any import
-   Completeness means every old value has a target, including the ones nobody uses
-   Dependency order, not spreadsheet order: item groups before items, territories before customers
-   Opening balances are one journal dated the day before go live, not typed invoices
-   The import log is the evidence: attempted, created, updated and failed

1. **What must the mapping workbook contain?** Every old value with a new target, an owner and a decision date, signed before the import starts.
2. **Why import in dependency order?** ERPNext refuses children without parents, so the order is the data model rather than a preference.
3. **How are opening balances loaded?** As a single journal dated the day before go live, with a source document behind every figure.
4. **What proves an import is complete?** The log: rows attempted, created, updated and failed, plus a duplicate count.
5. **Which five checks come before anyone is allowed to transact?** Assets equal liabilities plus equity, the trial balance balances, stock ties to the count, debtors to statements, tax to returns.

_Trap:_ Opening balances are entered as dummy invoices so that ageing looks right. Revenue and tax are then overstated in the go live month and the auditor cannot separate history from opening figures.

### 31. Volume 11 · UAT, Cut-Over and Go-Live — Script, sequence, numbers, hand over

-   A test case states the action, the expected number and the evidence, and the client signs it
-   Pass means the expected figure appears, not that no error message was shown
-   Cut over in dependency order, because each step unblocks the next one
-   Hypercare is a fortnight of daily numbers: tickets, invoices, stock errors, close progress and logins
-   The handover pack must be usable without the consultant in the room

1. **What makes a UAT case pass?** The expected figure appears on screen, not merely that the screen did not produce an error.
2. **Why is cut over ordered rather than parallel?** Each step produces the input for the next, so reordering it creates work that must be redone.
3. **Which five numbers are measured daily in hypercare?** Tickets raised, invoices posted, stock errors, close progress and logins.
4. **What ends hypercare?** A go or no go decision on evidence where every criterion carries a number and someone signs it.
5. **What goes into the handover pack?** Configuration record, mapping workbook, UAT sign off, cut over log, open items and how to run the close.

_Trap:_ UAT is signed off because no errors were raised during the session. Nobody compared figures, so the first month end discovers the wrong tax template and the sign off protects the vendor, not the client.

### 32. Volume 11 · Continuity: Backups, Staging and Upgrades — Backup, prove, stage, pin

-   Backup, and store the encryption key somewhere the backup cannot reach
-   Prove it with a timed restore drill into a scratch site, logged with a date
-   Stage the upgrade on a site holding production-like data, never on production itself
-   Pin the versions, schedule the window, and review the changelog before the change
-   One named approver, one cut-off time, and a twenty-minute verification afterwards

1. **What two facts does a restore drill give the client?** That the backup actually restores, and how many minutes the business needs before it can trade again. Both belong in the handover pack.
2. **Why does staging need a copy of production data?** Upgrades break on custom fields, print formats and workflow states, which live in the data and configuration rather than in the code.
3. **What belongs in the version register?** The exact Frappe, ERPNext and custom app versions, pinned at go-live, with the date each was last confirmed and who confirmed it.
4. **Which five checks make up the post-upgrade verification?** Log in as a normal user, submit a test invoice, print it, run two saved reports, and submit one e-Invoice in sandbox.
5. **What makes a rollback plan usable rather than aspirational?** A backup taken minutes before the change, a named decision maker, a cut-off time, and a short recorded list of transactions to replay.

_Trap:_ The client says 'the hosting provider handles backups' and signs off go-live without a drill. Handled is not proven. Ask for the schedule in writing, run one timed restore into a scratch site, log the result, and make an unproven restore a go-live blocker rather than a footnote.

### 33. Volume 11 · Site Security and Hardening: Protecting the Company's Money — Least privilege, then prove it

-   Nobody shares a login, and the administrator account is not a workspace
-   Two-factor is enforced by role before anything else is discussed
-   Privilege is the smallest set that finishes today's work, tested by logging in as the user
-   Network and keys are restrictions with evidence, not assurances
-   The one-page review is dated and signed, and the encryption key has two named holders

1. **Why is a shared login worse than a weak password?** Because it destroys the audit trail and makes a departure impossible to unwind. You cannot disable one person without disabling everyone.
2. **What evidence proves a restriction actually restricts?** A second login that shows the difference, or a refused connection from outside the network. Configuration alone is not evidence.
3. **What must exist before two-factor is enforced for finance?** A tested recovery path and a second enrolled device, plus a recorded reset authority, so month end cannot be lost to a phone.
4. **How should integration keys and e-Invoice credentials be managed?** One key per integration, an owner and purpose in a register, storage outside documents, a rotation date, and a tested revocation.
5. **What are the first two moves in a suspected compromise?** Contain access — disable the account, revoke the key — then preserve the logs before anything is cleaned or restored.

_Trap:_ The client says the host handles security, so no account review is done and the encryption key lives only in the consultant's notes. The host protects the server; it cannot stop a shared login or a stale key. Write the split of responsibility, run the review quarterly, and drill key retrieval with two named holders.

### 34. Volume 11 · The First Ninety Days: Health Checks and Handing Over — Week, month, quarter, exit

-   Week one: morning check, same-day triage, one written update a day
-   Month one: numbers at day thirty, three agreed actions with owners
-   Month two: a second user completes a weekly cycle unaided while you watch
-   Month three: the internal owner configures a user, a warehouse and a print format
-   Exit: every item closed, keys handed back, your access revoked, one dated offer

1. **What three things shape a hypercare week?** A morning check with a name and time, same-day triage of anything wrong, and one written update per day. Everything else is optional.
2. **How should a fix list be split, and in what order?** Wrong numbers first, then blocked work, then cosmetic in one agreed batch — and publish the rule so volume does not decide.
3. **Why is the second-user test more valuable than a training record?** It measures capability: a non-champion completes a weekly cycle unaided while you watch in silence, exposing hesitations that training missed.
4. **Which five checks make up the weekly health routine?** Scheduled jobs ran, error log quiet, stock and ledger agree, aged drafts counted, backups completed — signed with a date and a name.
5. **What does a good exit actually deliver?** Every open item closed as fixed, accepted or transferred, keys handed back, your access revoked, a named successor, and one dated optional review.

_Trap:_ Hypercare drifts: response times lengthen quietly, the champion is the only user, and the consultant is still answering questions in month nine. Dependence feels like success and is the opposite. Set the exit date at the start, hand over to a named owner with a deputy, publish three numbers the client reads, and close every item explicitly when the date arrives.
