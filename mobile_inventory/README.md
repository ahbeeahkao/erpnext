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
   <script>window.csrf_token = "{{ frappe.session.csrf_token }}";</script>
   <div id="root"></div>
   <script type="module" src="/assets/<app>/inventory/assets/index-<hash>.js"></script>
   ```

   Serving it as a www page also means the 40x redirect to `/login` handles re-authentication.
4. In the app choose **This site** and connect.

### Option B — host it anywhere, authenticate with API keys

1. In ERPNext: **User → API Access → Generate Keys**. Use a dedicated integration user with a
   role that can create/submit Stock Entry and Stock Reconciliation (e.g. *Stock Manager*,
   *Item Manager*).
2. Serve `dist/` from any static host (or `npm run serve`).
3. Open the app, choose **API key**, and enter the site URL, key and secret.

> Cross-origin hosting requires CORS on the ERPNext side:
> `bench --site <site> set-config allow_cors "https://your-app.example.com"`
> Prefer Option A: API keys in a browser are long-lived and stored on the device.

## What the app calls

| Action | Endpoint |
| --- | --- |
| Verify session | `GET /api/method/frappe.auth.get_logged_user` |
| Warehouses | `GET /api/resource/Warehouse` |
| Scan lookup | `GET /api/method/erpnext.stock.utils.scan_barcode?search_value=…` |
| Item details | `GET /api/resource/Item/<code>` |
| Item search | `GET /api/resource/Item` (`or_filters` on code/name) |
| Stock by warehouse | `GET /api/resource/Bin` |
| Post a movement | `POST /api/resource/Stock Entry` then `POST /api/method/frappe.client.submit` |
| Post a count | `POST /api/resource/Stock Reconciliation` then `POST /api/method/frappe.client.submit` |
| Duplicate check | `GET /api/resource/Stock Entry` filtered on `remarks` |

Reads use `GET` on purpose: whitelisted methods accept query parameters, so reads work even in
cookie mode where a CSRF token may not be available yet. Writes always send
`X-Frappe-CSRF-Token` when the page provides one (`window.csrf_token`), and rely on token auth
otherwise.

## Offline queue and idempotency

Every transaction is built into a complete ERPNext document **on the device** and stored in
IndexedDB before it is sent. Each document's `remarks` ends with a marker:

```
Mobile Inventory · Material Receipt · [MOBILE-INV:8f14e45f-…] · GRN 8821
```

Before posting, the sync engine searches `Stock Entry` for that marker. A retry after a lost
response therefore finds the already-posted document instead of posting the move twice. The
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
  lib/payloads.ts     document builders + validation (pure, unit tested)
  lib/api.ts          ERPNext REST client (site-session or API-key auth)
  lib/demo.ts         in-memory adapter used by demo mode
  lib/queue.ts        queue persistence, ordering, back-off
  lib/sync.ts         drain loop with idempotency + failure policy
  lib/storage.ts      IndexedDB wrapper (kv + queue stores)
  hooks/              camera scanning, online state, queue, toasts
  screens/            Connect, Home, Item, Move, Count, Queue, Settings
  components/         UI kit, icons, scanner overlay
public/
  sw.js               offline shell (never caches /api/*)
  manifest.webmanifest
```

## Roadmap

- Batch picker that lists existing batches with expiry, and creates new ones explicitly.
- Purchase-receipt style receipt against a PO.
- Multiple-item cart per transaction.
- Label printing (CUPS/Bluetooth) and putaway suggestions.
