# Sample data pack — Seri Murni Sdn Bhd

Every lesson in this course uses the same company so that the numbers in the deck are the numbers
you should see on your own site. This folder is the machine-readable version of that dataset, and it
is the truth the deck is checked against.

| File                     | What it holds                                                                                        | Use it for                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------- |
| `items.csv`              | 5 items across stock, serial, batch and service types with valuation, tax template and reorder rules | Volume 1, lessons 1–4           |
| `customers.csv`          | 3 customers with price lists, credit limits, terms and tax IDs                                       | Volume 1, lessons 5–6           |
| `suppliers.csv`          | 2 suppliers with different payment terms                                                             | Volume 1, lesson 7              |
| `price-lists.csv`        | Retail and Dealer rates per item                                                                     | Volume 1, lesson 8              |
| `documents.csv`          | Every document in the quote-to-cash cycle with the totals, stock effect and status it must produce   | Volume 2, lessons 1–10          |
| `expected-outcomes.json` | Setup checks, cycle arithmetic and the cross-checks a learner should be able to explain              | All volumes, as a marking sheet |

## How to load them

You do not need an import tool to take this course: every lesson tells you which fields to type.
If you prefer to pre-load the masters, use **Data Import** in the Desk:

1. Download the CSV you need.
2. Open **Data Import → New**, choose the DocType (Item, Customer, Supplier, Item Price).
3. Upload the file, map the columns, and run the import on a **test company** first.

Import order matters, because of the links between records:

```
Company → Accounts → Cost Centres → UOMs → Warehouses → Item Groups
        → Items → Customers / Suppliers → Addresses → Price Lists → Item Prices
```

Item Prices reference price lists, and items reference tax templates, so a missing template turns an
import into a pile of skipped rows. Import masters before documents, always.

## The arithmetic, in one place

| Cycle                                   | Net      | Tax    | Total    | Cost of goods | Gross profit    |
| --------------------------------------- | -------- | ------ | -------- | ------------- | --------------- |
| Full sale, 5 units @ 240.00             | 1,200.00 | 120.00 | 1,320.00 | 600.00        | 600.00          |
| Partial delivery, 2 units               | 480.00   | 48.00  | 528.00   | 240.00        | 240.00          |
| 10 % line discount, 5 units             | 1,080.00 | 108.00 | 1,188.00 | 600.00        | 480.00          |
| Return of 1 unit                        | −240.00  | −24.00 | −264.00  | +120.00 stock | reverses 120.00 |
| Dealer rule, 10 units @ 216.00 less 5 % | 2,052.00 | 205.20 | 2,257.20 | —             | —               |

Tax follows taxable value, stock moves only on delivery and return, and the payment ledger clears
only when a receipt is allocated. Those three rules explain almost every number in the course.

## What this pack is not

It is not a migration template for a real client. It is deliberately small, contains no personal data,
and uses placeholder tax IDs. Real data brings duplicate customers, missing addresses, discontinued
items and prices nobody remembers agreeing to — which is exactly what the later volumes teach.
