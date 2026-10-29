# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Map a submitted Sales Invoice onto the MyInvois :class:`InvoiceData` value object.

Everything that needs a database lives here; the actual UBL JSON is produced by
``services.ubl`` from the value object, so the tricky part stays testable.

Malaysian tax model (SST, in force since 2018)
----------------------------------------------
* Sales Tax and Service Tax are **single-stage** taxes charged by the supplier, reported with
  MyInvois tax type ``01`` and ``02`` respectively; exempt supplies use ``E``, out-of-scope
  supplies use ``06``.
* The rates that apply to a line come from ERPNext itself: the item's ``Item Tax Template``
  (snapshotted in ``Sales Invoice Item.item_tax_rate``) or, for single-rate invoices, the
  invoice's ``On Net Total`` tax row. The e-Invoice is therefore never taxed differently from
  the Sales Invoice the customer received.
"""

from __future__ import annotations

import json
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

import frappe
from frappe.utils import cint, flt, getdate

from .codes import (
	CREDIT_NOTE_TYPE,
	DEBIT_NOTE_TYPE,
	GENERAL_PUBLIC,
	INVOICE_TYPES,
	REFUND_NOTE_TYPE,
	TAXABLE_TAX_TYPES,
	to_unit_code,
)
from .models import InvoiceData, Line, Party, money
from .validation import InvoiceValidationError

SETTINGS_DOCTYPE = "Malaysia E-Invoice Settings"
ZERO_RATED_TAX_TYPE = "06"

ADDRESS_QUERY = """
	select a.address_line1, a.address_line2, a.address_line3, a.city, a.state,
		a.pincode, a.country, a.phone, a.email_id
	from `tabAddress` a
	inner join `tabDynamic Link` dl
		on dl.parent = a.name and dl.parenttype = 'Address'
	where dl.link_doctype = %(party_type)s and dl.link_name = %(party_name)s
	order by a.is_primary_address desc, a.modified desc
	limit 1
"""


def get_settings():
	"""Return the (cached) Malaysia E-Invoice Settings singleton."""
	return frappe.get_cached_doc(SETTINGS_DOCTYPE)


# --------------------------------------------------------------------------- helpers


def clean(value) -> str:
	return str(value or "").strip()


def get_party_address(party_type: str, party_name: str) -> dict:
	"""Primary address of a Customer/Company, or an empty dict when none is set."""
	if not party_name:
		return {}
	rows = frappe.db.sql(ADDRESS_QUERY, {"party_type": party_type, "party_name": party_name}, as_dict=True)
	return rows[0] if rows else {}


def _party_from_doc(
	*,
	party_type: str,
	party_name: str,
	defaults: dict,
	general_public: bool = False,
) -> Party:
	"""Build a :class:`Party` from the party master plus its primary address."""
	if general_public:
		address = defaults["address"]
		return Party(
			tin=GENERAL_PUBLIC["tin"],
			registration=GENERAL_PUBLIC["registration"],
			registration_type=GENERAL_PUBLIC["registration_type"],
			name=GENERAL_PUBLIC["name"],
			address_line1="General Public",
			address_line2=clean(address.get("address_line2")),
			address_line3=clean(address.get("address_line3")),
			city=clean(address.get("city")) or defaults["city"],
			state=clean(address.get("state")) or defaults["state"],
			postal_code=clean(address.get("pincode")) or defaults["postal_code"],
			phone="",
			email="",
		)

	if party_type == "Company":
		tin = clean(defaults.get("tin"))
		registration = clean(defaults.get("registration"))
		registration_type = clean(defaults.get("registration_type")) or "BRN"
		sst_registration = clean(defaults.get("sst_registration"))
		email = clean(frappe.db.get_value("Company", party_name, "email"))
	else:
		tin, registration, registration_type, sst_registration = frappe.db.get_value(
			party_type,
			party_name,
			[
				"custom_malaysia_tin",
				"custom_malaysia_registration_no",
				"custom_malaysia_registration_type",
				"custom_malaysia_sst_no",
			],
		) or ("", "", "", "")
		email = clean(frappe.db.get_value(party_type, party_name, "email_id"))

	address = get_party_address(party_type, party_name)

	if not tin:
		raise InvoiceValidationError(
			[
				f"{party_type} {party_name} has no Malaysian TIN. Set 'Malaysia TIN' on the "
				f"{party_type} (or enable 'General Public buyer' on the invoice for B2C sales)."
			]
		)

	if not address:
		raise InvoiceValidationError(
			[f"{party_type} {party_name} has no address. MyInvois requires a full postal address."]
		)

	name_field = "customer_name" if party_type == "Customer" else "company_name"
	return Party(
		tin=tin,
		registration=clean(registration),
		registration_type=registration_type or "BRN",
		name=clean(frappe.db.get_value(party_type, party_name, name_field)) or party_name,
		address_line1=clean(address.get("address_line1")),
		address_line2=clean(address.get("address_line2")),
		address_line3=clean(address.get("address_line3")),
		city=clean(address.get("city")),
		state=clean(address.get("state")),
		postal_code=clean(address.get("pincode")),
		country_code="MYS"
		if clean(address.get("country")) in ("", "Malaysia")
		else clean(address.get("country")),
		phone=clean(address.get("phone")),
		email=email or clean(address.get("email_id")),
		sst_registration=sst_registration,
	)


def get_company_defaults(company: str) -> dict:
	"""TIN/BRN/SST defaults from the Company plus a fallback address for B2C invoices."""
	values = (
		frappe.db.get_value(
			"Company",
			company,
			[
				"custom_malaysia_tin",
				"custom_malaysia_registration_no",
				"custom_malaysia_registration_type",
				"custom_malaysia_sst_no",
			],
			as_dict=True,
		)
		or {}
	)
	address = get_party_address("Company", company)
	return {
		"tin": values.get("custom_malaysia_tin"),
		"registration": values.get("custom_malaysia_registration_no"),
		"registration_type": values.get("custom_malaysia_registration_type"),
		"sst_registration": values.get("custom_malaysia_sst_no"),
		"address": address,
		"city": clean(address.get("city")),
		"state": clean(address.get("state")),
		"postal_code": clean(address.get("pincode")),
	}


def to_utc(issue_date, issue_time, timezone_name: str) -> datetime:
	"""MyInvois wants ``IssueTime`` in UTC; ERPNext stores posting time in the site timezone."""
	zone_name = timezone_name or "Asia/Kuala_Lumpur"
	try:
		from zoneinfo import ZoneInfo

		local = datetime.combine(getdate(issue_date), issue_time).replace(tzinfo=ZoneInfo(zone_name))
	except Exception:
		# Zoneinfo database missing: Malaysia has had a fixed +08:00 offset for decades.
		local = datetime.combine(getdate(issue_date), issue_time).replace(tzinfo=timezone(timedelta(hours=8)))
	return local.astimezone(timezone.utc)


def resolve_invoice_type(doc, settings) -> str:
	"""Document type: refund/credit note for returns, debit note when flagged, else invoice."""
	explicit = clean(doc.get("custom_malaysia_invoice_type"))
	if explicit in INVOICE_TYPES:
		return explicit
	if cint(doc.get("is_debit_note")):
		return DEBIT_NOTE_TYPE
	if cint(doc.get("is_return")):
		return CREDIT_NOTE_TYPE if clean(doc.get("return_against")) else REFUND_NOTE_TYPE
	return "01"


def billing_reference(doc) -> str:
	"""UUID of the original e-Invoice that a credit/debit note refers to."""
	explicit = clean(doc.get("custom_malaysia_billing_reference"))
	if explicit:
		return explicit
	return clean(
		frappe.db.get_value("Sales Invoice", doc.get("return_against"), "custom_malaysia_einvoice_uuid")
		if doc.get("return_against")
		else None
	)


def tax_row_types(doc, settings) -> dict[str, str]:
	"""Map each tax account on the invoice to a MyInvois tax type via the settings table."""
	mapping = {
		row.account: (clean(row.tax_type), flt(row.rate))
		for row in (settings.get("tax_accounts") or [])
		if row.account
	}
	resolved: dict[str, str] = {}
	for tax in doc.get("taxes") or []:
		account = tax.get("account_head")
		if not account:
			continue
		if account in mapping:
			resolved[account] = mapping[account][0]
		elif clean(settings.default_tax_type):
			resolved[account] = clean(settings.default_tax_type)
	return resolved


def line_tax_type(item, doc, settings) -> str:
	override = clean(item.get("custom_malaysia_tax_type")) or clean(
		frappe.db.get_value("Item", item.get("item_code"), "custom_malaysia_tax_type")
	)
	if override:
		return override
	types = {value for value in tax_row_types(doc, settings).values() if value}
	if len(types) == 1:
		return types.pop()
	return clean(settings.default_tax_type) or ZERO_RATED_TAX_TYPE


def line_tax_rate(item) -> Decimal:
	"""Effective SST rate for an item, straight from ERPNext's own tax snapshot."""
	raw = item.get("item_tax_rate")
	if raw:
		try:
			rates = json.loads(raw)
		except (TypeError, ValueError):
			rates = {}
		if isinstance(rates, dict) and rates:
			return money(sum(flt(rate) for rate in rates.values()))
	return Decimal("0.00")


def line_tax_percentage(item, doc, default_rate: Decimal) -> Decimal:
	"""Pick the rate for a line: item tax snapshot, else the invoice's effective rate."""
	rate = line_tax_rate(item)
	if rate:
		return rate

	net_total = flt(doc.get("net_total"))
	tax_total = flt(doc.get("total_taxes_and_charges"))
	if net_total and tax_total:
		return money(Decimal(str(tax_total)) / Decimal(str(net_total)) * 100)

	return money(default_rate)


def default_rate(doc, settings) -> Decimal:
	tax_total = flt(doc.get("total_taxes_and_charges"))
	net_total = flt(doc.get("net_total"))
	if net_total:
		return money(Decimal(str(tax_total)) / Decimal(str(net_total)) * 100)
	return money(0)


def classification_code_for(item, settings) -> str:
	code = clean(item.get("custom_malaysia_classification_code"))
	if code:
		return code
	item_default = clean(
		frappe.db.get_value("Item", item.get("item_code"), "custom_malaysia_classification_code")
	)
	return item_default or clean(settings.default_classification_code)


# --------------------------------------------------------------------------- builder


def build_invoice_data(doc, settings=None) -> tuple[InvoiceData, list[str]]:
	"""Build the value object for ``doc``; returns ``(data, warnings)``."""
	settings = settings or get_settings()
	warnings: list[str] = []

	company = doc.get("company")
	company_defaults = get_company_defaults(company)
	general_public = bool(cint(doc.get("custom_malaysia_general_public")))
	if general_public and not cint(settings.get("allow_general_public")):
		raise InvoiceValidationError(
			[
				"The invoice is flagged as a General Public (B2C) sale but 'Allow General Public "
				"Buyer' is off in Malaysia E-Invoice Settings."
			]
		)

	supplier = _party_from_doc(
		party_type="Company",
		party_name=company,
		defaults=company_defaults,
	)
	buyer = _party_from_doc(
		party_type="Customer",
		party_name=doc.get("customer"),
		defaults=company_defaults,
		general_public=general_public,
	)

	invoice_default_rate = default_rate(doc, settings)
	lines: list[Line] = []

	for index, item in enumerate(doc.get("items") or [], start=1):
		quantity = Decimal(str(flt(item.get("qty"))))
		unit_price = money(item.get("rate"))
		line_extension = money(item.get("net_amount"))
		discount = money(quantity * unit_price - line_extension)
		if discount < 0:
			warnings.append(
				f"Line {index} ({item.get('item_code')}): net amount exceeds quantity x rate; "
				"check additional discounts."
			)
			discount = Decimal("0.00")
			line_extension = money(quantity * unit_price)

		tax_type = line_tax_type(item, doc, settings)
		rate = line_tax_percentage(item, doc, invoice_default_rate)
		if tax_type not in TAXABLE_TAX_TYPES:
			rate = Decimal("0.00")

		lines.append(
			Line(
				line_id=str(index),
				description=clean(item.get("description"))
				or clean(item.get("item_name"))
				or clean(item.get("item_code")),
				quantity=quantity,
				unit_price=unit_price,
				unit_code=to_unit_code(item.get("uom") or item.get("stock_uom")),
				classification_code=classification_code_for(item, settings),
				tax_type=tax_type,
				tax_rate=rate,
				tax_amount=money(line_extension * rate / 100),
				line_extension=line_extension,
				discount=discount,
			)
		)

	lines = _reconcile_tax(lines, flt(doc.get("total_taxes_and_charges")), warnings)

	total_excluding = money(sum((line.line_extension for line in lines), Decimal("0.00")))
	tax_total = money(sum((line.tax_amount for line in lines), Decimal("0.00")))
	total_including = money(total_excluding + tax_total)

	grand_total = money(doc.get("grand_total"))
	if abs(grand_total - total_including) > Decimal("0.05"):
		warnings.append(
			f"e-Invoice total {total_including} differs from the Sales Invoice grand total "
			f"{grand_total} (rounding or non-tax charges); the e-Invoice is submitted with its own "
			"consistent totals."
		)

	issue_datetime = to_utc(
		doc.get("posting_date") or doc.get("creation"),
		doc.get("posting_time") or time(0, 0, 0),
		site_timezone(),
	)

	notes = clean(doc.get("remarks"))
	po_no = clean(doc.get("po_no"))
	if po_no:
		notes = f"PO {po_no}" + (f" | {notes}" if notes else "")

	data = InvoiceData(
		code_number=clean(doc.get("name")),
		issue_date=issue_datetime.date(),
		issue_time=issue_datetime.time().replace(microsecond=0),
		invoice_type=resolve_invoice_type(doc, settings),
		currency=clean(doc.get("currency")) or "MYR",
		supplier=supplier,
		buyer=buyer,
		lines=lines,
		tax_total=tax_total,
		total_excluding_tax=total_excluding,
		total_including_tax=total_including,
		payable=total_including,
		notes=notes[:1000],
		billing_reference_uuid=billing_reference(doc),
	)

	return data, warnings


def _reconcile_tax(lines: list[Line], invoice_tax_total: float, warnings: list[str]) -> list[Line]:
	"""Force the sum of line tax to equal the invoice's tax total (to the sen)."""
	if not lines or not invoice_tax_total:
		return lines

	target = money(invoice_tax_total)
	current = money(sum((line.tax_amount for line in lines), Decimal("0.00")))
	delta = target - current
	if delta == 0:
		return lines

	taxable = [line for line in lines if line.tax_amount > 0]
	if not taxable:
		warnings.append(
			f"Invoice charges {target} of tax but no line is mapped to a taxable tax type; "
			"set the MyInvois tax type on the item or in Malaysia tax accounts."
		)
		return lines

	last = taxable[-1]
	adjusted = money(last.tax_amount + delta)
	if adjusted < 0:
		return lines

	lines[lines.index(last)] = Line(
		line_id=last.line_id,
		description=last.description,
		quantity=last.quantity,
		unit_price=last.unit_price,
		unit_code=last.unit_code,
		classification_code=last.classification_code,
		tax_type=last.tax_type,
		tax_rate=last.tax_rate,
		tax_amount=adjusted,
		line_extension=last.line_extension,
		discount=last.discount,
	)
	return lines


def site_timezone() -> str:
	return frappe.db.get_single_value("System Settings", "timezone") or "Asia/Kuala_Lumpur"
