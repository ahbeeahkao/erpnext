# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Builder for the MyInvois UBL 2.1 JSON invoice document.

MyInvois takes UBL 2.1 either as XML or as its UBL-JSON mapping. In the JSON mapping every
*value* is wrapped in a ``_`` key next to its attributes, and every element that can repeat is
an array, e.g.::

    "InvoiceTypeCode": [{"_": "01", "listVersionID": "1.1"}]

This module produces that structure from :class:`InvoiceData`. It performs no I/O and imports
no Frappe code, so the output can be snapshot-tested.

Reference: https://sdk.myinvois.hasil.gov.my/ (UBL JSON, e-Invoice v1.1)
"""

from __future__ import annotations

import base64
import hashlib
import json
from collections.abc import Iterable, Sequence
from decimal import Decimal

from .codes import (
	CLASSIFICATION_LIST_ID,
	DEFAULT_COUNTRY_CODE,
	INVOICE_VERSION,
	TAX_SCHEME_ID,
	to_state_code,
	to_unit_code,
)
from .models import InvoiceData, Line, Party, money


def _text(value: str) -> dict:
	return {"_": value}


def _amount(value: Decimal | float | int | str | None, currency: str) -> dict:
	return {"_": f"{money(value):.2f}", "currencyID": currency}


def _rate(value: Decimal | float | int | str | None) -> str:
	return f"{money(value):.2f}"


def format_quantity(value: Decimal | float | int | str | None) -> str:
	"""Quantities keep their precision but drop trailing zeros (``2`` not ``2.0000``)."""
	number = Decimal(str(value or 0))
	normalised = number.normalize()
	if normalised == normalised.to_integral():
		return str(int(normalised))
	return format(normalised, "f")


def format_issue_time(value) -> str:
	"""``IssueTime`` is UTC with a trailing ``Z`` — callers must pass UTC."""
	return f"{value.strftime('%H:%M:%S')}Z"


def build_party(party: Party) -> dict:
	"""Build the ``Party`` aggregate used for both supplier and buyer."""
	postal_address: dict = {
		"CityName": [_text(party.city)],
		"PostalZone": [_text(party.postal_code)],
		"CountrySubentityCode": [_text(to_state_code(party.state) or party.state)],
		"Country": [{"IdentificationCode": [_text(party.country_code or DEFAULT_COUNTRY_CODE)]}],
	}

	address_lines = [line for line in (party.address_line1, party.address_line2, party.address_line3) if line]
	if address_lines:
		postal_address["AddressLine"] = [{"Line": [_text(line)]} for line in address_lines]

	aggregate: dict = {
		"PartyIdentification": [
			{"ID": [{"_": party.tin, "schemeID": "TIN"}]},
		],
		"PartyName": [{"Name": [_text(party.name)]}],
		"PostalAddress": [postal_address],
		"PartyLegalEntity": [
			{
				"RegistrationName": [_text(party.name)],
				"CompanyID": [{"_": party.registration, "schemeID": party.registration_type}],
			}
		],
	}

	if party.sst_registration:
		aggregate["PartyTaxScheme"] = [
			{
				"CompanyID": [_text(party.sst_registration)],
				"TaxScheme": [{"ID": [_text(TAX_SCHEME_ID)]}],
			}
		]

	contact: dict = {}
	if party.phone:
		contact["Telephone"] = [_text(party.phone)]
	if party.email:
		contact["ElectronicMail"] = [_text(party.email)]
	if contact:
		aggregate["Contact"] = [contact]

	return aggregate


def build_line(line: Line, currency: str) -> dict:
	"""Build one ``InvoiceLine`` (with its own tax sub-total, as MyInvois requires)."""
	taxable = money(line.line_extension)
	tax_amount = money(line.tax_amount)

	subtotal = {
		"TaxableAmount": [_amount(taxable, currency)],
		"TaxAmount": [_amount(tax_amount, currency)],
		"Percent": [_text(_rate(line.tax_rate))],
		"TaxCategory": [
			{
				"ID": [_text(line.tax_type)],
				"TaxScheme": [{"ID": [_text(TAX_SCHEME_ID)]}],
			}
		],
	}

	row: dict = {
		"ID": [_text(line.line_id)],
		"InvoicedQuantity": [
			{"_": format_quantity(line.quantity), "unitCode": line.unit_code or to_unit_code(None)}
		],
		"LineExtensionAmount": [_amount(taxable, currency)],
		"TaxTotal": [
			{
				"TaxAmount": [_amount(tax_amount, currency)],
				"TaxSubtotal": [subtotal],
			}
		],
		"Item": [
			{
				"CommodityClassification": [
					{
						"ItemClassificationCode": [
							{"_": line.classification_code, "listID": CLASSIFICATION_LIST_ID}
						]
					}
				],
				"Description": [_text(line.description)],
			}
		],
		"Price": [{"PriceAmount": [_amount(line.unit_price, currency)]}],
	}

	if line.discount and line.discount > 0:
		row["AllowanceCharge"] = [
			{
				"ChargeIndicator": [_text("false")],
				"AllowanceChargeReason": [_text("Discount")],
				"Amount": [_amount(line.discount, currency)],
			}
		]

	return row


def build_ubl_invoice(data: InvoiceData) -> dict:
	"""Build the complete UBL JSON document (``{"Invoice": [...]}``) for MyInvois."""
	currency = data.currency
	tax_subtotals = data.tax_subtotals()

	header_tax_total: dict = {
		"TaxAmount": [_amount(data.tax_total, currency)],
	}
	if tax_subtotals:
		header_tax_total["TaxSubtotal"] = [
			{
				"TaxableAmount": [_amount(subtotal["taxable_amount"], currency)],
				"TaxAmount": [_amount(subtotal["tax_amount"], currency)],
				"Percent": [_text(_rate(subtotal["rate"]))],
				"TaxCategory": [
					{
						"ID": [_text(subtotal["tax_type"])],
						"TaxScheme": [{"ID": [_text(TAX_SCHEME_ID)]}],
					}
				],
			}
			for subtotal in tax_subtotals
		]

	invoice: dict = {
		"ID": [_text(data.code_number)],
		"IssueDate": [_text(data.issue_date.isoformat())],
		"IssueTime": [_text(format_issue_time(data.issue_time))],
		"InvoiceTypeCode": [{"_": data.invoice_type, "listVersionID": INVOICE_VERSION}],
		"DocumentCurrencyCode": [_text(currency)],
	}

	if data.notes:
		invoice["Note"] = [_text(data.notes)]

	if data.billing_reference_uuid:
		invoice["BillingReference"] = [
			{"InvoiceDocumentReference": [{"ID": [_text(data.billing_reference_uuid)]}]}
		]

	invoice.update(
		{
			"AccountingSupplierParty": [{"Party": [build_party(data.supplier)]}],
			"AccountingCustomerParty": [{"Party": [build_party(data.buyer)]}],
			"TaxTotal": [header_tax_total],
			"LegalMonetaryTotal": [
				{
					"LineExtensionAmount": [_amount(data.total_excluding_tax, currency)],
					"TaxExclusiveAmount": [_amount(data.total_excluding_tax, currency)],
					"TaxInclusiveAmount": [_amount(data.total_including_tax, currency)],
					"PayableAmount": [_amount(data.payable, currency)],
				}
			],
			"InvoiceLine": [build_line(line, currency) for line in data.lines],
		}
	)

	return {
		"Invoice": [
			{
				"_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
				"_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
				"_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
				**invoice,
			}
		]
	}


def serialise(document: dict) -> bytes:
	"""Compact UTF-8 JSON — this exact byte sequence is what gets hashed and submitted."""
	return json.dumps(document, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")


def document_hash(payload: bytes) -> str:
	"""SHA-256 of the submitted document, lowercase hex (what ``documentHash`` expects)."""
	return hashlib.sha256(payload).hexdigest()


def document_base64(payload: bytes) -> str:
	return base64.b64encode(payload).decode("ascii")


def build_ubl_document(data: InvoiceData) -> bytes:
	"""Convenience: invoice data -> the exact bytes to submit."""
	return serialise(build_ubl_invoice(data))


def build_submission_payload(
	documents: Iterable[tuple[str, bytes]],
	document_format: str = "JSON",
) -> dict:
	"""Build the body for ``POST /api/v1.0/documentsubmissions``.

	``documents`` is an iterable of ``(code_number, payload_bytes)`` pairs.
	"""
	encoded = []
	for code_number, payload in documents:
		encoded.append(
			{
				"format": document_format,
				"documentHash": document_hash(payload),
				"codeNumber": code_number,
				"document": document_base64(payload),
			}
		)
	return {"documents": encoded}


def iter_line_ids(lines: Sequence[Line]) -> list[str]:
	return [line.line_id for line in lines]
