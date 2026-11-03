# Mobile Inventory (PWA for ERPNext)

An installable, offline-first web app for warehouse work on a phone:

- **Scan** any item barcode (camera or keyboard/Bluetooth scanner) and see live stock by warehouse.
- **Receive / Issue / Transfer** stock, with batch and serial support and a unit cost for receipts.
- **Count** stock — posts a Stock Reconciliation (zero counts included).
- **Works offline**: transactions are queued in IndexedDB and posted automatically when the
  connection returns, oldest first, never twice.
- **Installable**: web manifest + service worker, so it opens full-screen from the home screen
  like a native app.

It talks to plain ERPNext over the standard REST API — no custom app, no server patches, no
extra DocTypes. Point it at any ERPNext v14+ site that has stock enabled.

---

## Quick start

```bash
cd mobile_inventory
npm install

npm run dev          # http://localhost:5173  (choose “Demo” to explore without a server)
npm test             # unit tests for payloads/validation/queue/error handling
npm run lint
npm run build        # type-check + production build into dist/
npm run smoke        # mounts the built app in jsdom and drives the real UI (needs a build)
npm run serve        # static server for dist/ on :8080
npm run check        # lint + unit tests + build + smoke
```

Open the app and pick **Demo** — it ships with sample warehouses, items, batch/serial items and
a working stock ledger held in memory. Nothing in demo mode ever touches a server.

## Connecting to a real site

### Option A — serve it from the ERPNext site (recommended)

The browser session cookie is used, so there are no long-lived credentials on the phone.

1. `npm run build`
2. Copy `dist/` to your site, e.g. `sites/<site>/public/inventory/` (or to
   `<bench>/apps/erpnext/erpnext/public/inventory/` if you are shipping it inside the ERPNext app).
3. Make the page inject the CSRF token — a tiny `www` page is enough:

    ```python
    # <app>/<app>/www/inventory.py
    import frappe

    def get_context(context):
        if frappe.session.user == "Guest":
            frappe.throw("Please sign in", frappe.PermissionError)
        context.no_cache = 1
    ```

    ```html
    <!-- <app>/<app>/www/inventory.html -->
    <script>
    	window.csrf_token = "{{ frappe.session.csrf_token }}";
    </script>
    <div id="root"></div>
    <script type="module" src="/assets/<app>/inventory/assets/index-<hash>.js"></script>
    ```

    Serving it as a www page also means the 40x redirect to `/login` handles re-authentication.

4. In the app choose **This site** and connect.

### Option B — host it anywhere, authenticate with API keys

1. In ERPNext: **User → API Access → Generate Keys**. Use a dedicated integration user with a
   role that can create/submit Stock Entry and Stock Reconciliation (e.g. _Stock Manager_,
   _Item Manager_).
2. Serve `dist/` from any static host (or `npm run serve`).
3. Open the app, choose **API key**, and enter the site URL, key and secret.

> Cross-origin hosting requires CORS on the ERPNext side:
> `bench --site <site> set-config allow_cors "https://your-app.example.com"`
> Prefer Option A: API keys in a browser are long-lived and stored on the device.

## What the app calls

| Action             | Endpoint                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| Verify session     | `GET /api/method/frappe.auth.get_logged_user`                                          |
| Warehouses         | `GET /api/resource/Warehouse`                                                          |
| Scan lookup        | `GET /api/method/erpnext.stock.utils.scan_barcode?search_value=…`                      |
| Item details       | `GET /api/resource/Item/<code>`                                                        |
| Item search        | `GET /api/resource/Item` (`or_filters` on code/name)                                   |
| Stock by warehouse | `GET /api/resource/Bin`                                                                |
| Post a movement    | `POST /api/resource/Stock Entry` then `POST /api/method/frappe.client.submit`          |
| Post a count       | `POST /api/resource/Stock Reconciliation` then `POST /api/method/frappe.client.submit` |
| Deliveries due     | `GET /api/resource/Purchase Order` (`docstatus = 1`, `per_received < 100`)             |
| Order lines        | `GET /api/resource/Purchase Order Item` filtered on `parent`                           |
| Post a delivery    | `POST /api/resource/Purchase Receipt` then `POST /api/method/frappe.client.submit`     |
| Duplicate check    | `GET /api/resource/<doctype>` filtered on `remarks`, returning `name` + `docstatus`    |

Reads use `GET` on purpose: whitelisted methods accept query parameters, so reads work even in
cookie mode where a CSRF token may not be available yet. Writes always send
`X-Frappe-CSRF-Token` when the page provides one (`window.csrf_token`), and rely on token auth
otherwise.

## Jobs, not doctypes

The app is built around the jobs a storekeeper actually has, not around the documents those jobs
produce. Nothing here duplicates the Desk: item masters, prices, taxes, UOM conversions, reports
and permissions stay in ERPNext, and the phone captures what happened on the floor.

| Job                    | What the operator does                                   | What gets posted                                             |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **Receive a delivery** | Pick the order that arrived, scan each carton, post once | One `Purchase Receipt`, rows linked to `purchase_order_item` |
| Move one item          | Scan an item, choose in / out / transfer                 | `Stock Entry` (Material Receipt, Issue or Transfer)          |
| Count one item         | Scan an item, type the counted quantity                  | `Stock Reconciliation`                                       |

Receiving is the flagship flow, and it is deliberately not a form:

- **Continuous scan.** The scan box keeps focus; a scan is just keystrokes and `Enter`. Scanning the
  same carton twice is how you count, so the second scan is the second unit.
- **Nothing is typed twice.** The order line already knows the item, UOM, conversion factor and
  warehouse, and the receipt carries `purchase_order` + `purchase_order_item`, so the order's
  `per_received`, the three-way match and any return against it keep working.
- **Blind by default on request.** "Blind receiving" hides the expected quantity while counting, so
  the count is what is on the pallet rather than what the paperwork promised. The toggle only
  hides a number; it never changes the document.
- **Refusals happen on the device.** Over-receipt, a missing batch number, or too few serial
  numbers are caught before the document leaves the phone, not hours later in the queue.
- **One receipt per delivery.** Only the lines you touched are posted, so a 40-line order produces
  a receipt for what actually arrived.

Batch and serial flags come from the `Item` when a line is first scanned, because the purchase
order row does not carry them; the batch field then appears for that line only.

Rejects are captured on the same screen: a rejected quantity with a quarantine warehouse goes onto
the receipt row as `rejected_qty` / `rejected_warehouse`, so the accepted stock never includes it.

## Locations without a warehouse for every shelf

A warehouse per shelf is how stock systems rot: hundreds of warehouses, and reports nobody can read.
ERPNext already has the right tool — an **Inventory Dimension** — so the app uses it and adds
nothing of its own:

1. In the Desk, create an Inventory Dimension called `Location` (or `Shelf`, `Rack`, `Bin` — the app
   recognises those names) with `Stock Entry Detail` as the document type.
2. The app asks the site for its dimensions when a put-away or a count starts.
3. The value the operator types or scans (e.g. `A1-03`) goes onto each document row as the
   dimension's own field name, so the stock ledger carries the shelf.

With no dimension configured, put-away and counting fall back to the warehouse alone: nothing is
hidden and nothing breaks. Per-line overrides exist because a mixed pallet is normal.

## The other jobs share one engine

Counting a rack, putting away and picking are the same interaction — a set of lines you work
through with a scanner — so they are one screen (`screens/TaskFlow.tsx`) over one pure module
(`lib/taskflow.ts`). The task carries the differences: where its lines come from, and which
document it becomes.

- **Count a rack** starts empty and blind, and *grows* as you scan; there is no ceiling, because
  finding more than the system knows is the answer you were looking for. Every scanned line goes on
  the reconciliation, **including a zero count** — zero is a real answer.
- **Put away** starts empty with a source and a target warehouse; each line can be sent somewhere
  else from its detail panel.
- **Pick for a work order** starts from the work order's material lines, minus what is already
  issued. A **short pick is allowed** — what you could not find is information, not an error — but
  an over-pick is refused on the device.
- **Pick for delivery** starts from the sales order lines that still have quantity to deliver, and
  produces a **draft** `Delivery Note`: the picker hands the goods over, dispatch checks the gate
  pass and submits. The queue understands drafts, so `submit: false` means "create, do not submit".

Scanning is barcode-aware: a scan goes through `scan_barcode`, so either a barcode or an item code
finds the item.

## Offline queue and idempotency

Every transaction is built into a complete ERPNext document **on the device** and stored in
IndexedDB before it is sent. Each document's `remarks` ends with a marker:

```
Mobile Inventory · Material Receipt · [MOBILE-INV:8f14e45f-…] · GRN 8821
```

Before posting, the sync engine searches the same doctype for that marker and reads back
`docstatus`. A **submitted** document means the retry is a no-op. A **draft** — what a failed
submit leaves behind — is submitted rather than recreated, which used to look "posted" on the phone
while the stock never moved. The
queue posts oldest-first, stops on authentication or connectivity failures, and leaves
validation errors visible for a human to fix. Documents keep the date they were captured, so the
audit trail matches when the work actually happened.

Limits worth knowing:

- Web Stock Entries one row at a time (fast enough for phone work; the desk is the tool for bulk).
- Batch-tracked **counts** post at item/warehouse level; count batches individually in the desk.
- Receipts need a unit cost, or an explicit “zero value receipt” (only appropriate for free
  goods — it posts no stock value).

## Layout

```
src/
  lib/payloads.ts     stock entry + count builders and validation (pure, unit tested)
  lib/receiving.ts    purchase-order receiving task: scan counting, validation, receipt builder
  lib/taskflow.ts     shared engine for count / put away / pick tasks (pure, unit tested)
  lib/api.ts          ERPNext REST client (site-session or API-key auth)
  lib/demo.ts         in-memory adapter used by demo mode
  lib/queue.ts        queue persistence, ordering, back-off
  lib/sync.ts         drain loop with idempotency + failure policy
  lib/storage.ts      IndexedDB wrapper (kv + queue stores)
  hooks/              camera scanning, online state, queue, toasts
  screens/            Connect, Home, Receive, TaskFlow, Jobs, Item, Move, Count, Queue, Settings
  components/         UI kit, icons, scanner overlay
public/
  sw.js               offline shell (never caches /api/*)
  manifest.webmanifest
```

## Roadmap

- **Batch picker** that lists existing batches with expiry, and creates new ones explicitly.
- **Short-pick reasons** on the pick screen, so a short pick can be explained, not just recorded.
- Label printing (CUPS/Bluetooth).
