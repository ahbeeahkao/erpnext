# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Tests for the pure (Frappe-free) MyInvois layer.

Runs with plain ``unittest`` and needs no bench::

    cd erpnext_malaysia && python3 -m unittest discover -s malaysia_einvoice/tests -t . -v
"""

from __future__ import annotations

import base64
import hashlib
import json
import unittest
from datetime import date, time
from decimal import Decimal
from pathlib import Path

from malaysia_einvoice.services.codes import (
	GENERAL_PUBLIC,
	to_state_code,
	to_unit_code,
)
from malaysia_einvoice.services.models import InvoiceData, Line, Party, money
from malaysia_einvoice.services.ubl import (
	build_submission_payload,
	build_ubl_document,
	build_ubl_invoice,
	document_hash,
	format_quantity,
)
from malaysia_einvoice.services.validation import (
	InvoiceValidationError,
	assert_valid_invoice,
	validate_invoice,
)

TODAY = date(2026, 3, 4)


def supplier() -> Party:
	return Party(
		tin="C2584563200",
		registration="201901009876",
		registration_type="BRN",
		name="Arena Technologies Sdn Bhd",
		address_line1="Level 12, Menara Arena",
		address_line2="Jalan SS 21/1",
		city="Petaling Jaya",
		state="Selangor",
		postal_code="47400",
		phone="+603-1234 5678",
		email="billing@arena.example",
		sst_registration="W10-1808-32000123",
	)


def buyer(**overrides) -> Party:
	values = {
		"tin": "C2584563201",
		"registration": "202001009877",
		"registration_type": "BRN",
		"name": "Client Two Sdn Bhd",
		"address_line1": "1 Jalan Ampang",
		"city": "Kuala Lumpur",
		"state": "Wilayah Persekutuan Kuala Lumpur",
		"postal_code": "50450",
	}
	values.update(overrides)
	return Party(**values)


def general_public() -> Party:
	return Party(
		address_line1="-",
		city="Petaling Jaya",
		state="Selangor",
		postal_code="47400",
		**GENERAL_PUBLIC,
	)


def invoice(**overrides) -> InvoiceData:
	lines = overrides.pop(
		"lines",
		[
			Line(
				line_id="1",
				description="Consulting services - March 2026",
				quantity=Decimal("2"),
				unit_price=Decimal("1000.00"),
				unit_code="C62",
				classification_code="62010",
				tax_type="02",
				tax_rate=Decimal("8"),
				tax_amount=Decimal("160.00"),
				line_extension=Decimal("2000.00"),
			),
			Line(
				line_id="2",
				description="Printed manual",
				quantity=Decimal("1"),
				unit_price=Decimal("100.00"),
				unit_code="C62",
				classification_code="58110",
				tax_type="01",
				tax_rate=Decimal("10"),
				tax_amount=Decimal("10.00"),
				line_extension=Decimal("100.00"),
			),
		],
	)

	values = {
		"code_number": "INV-2026-0001",
		"issue_date": TODAY,
		"issue_time": time(2, 30, 0),
		"invoice_type": "01",
		"currency": "MYR",
		"supplier": supplier(),
		"buyer": buyer(),
		"lines": lines,
		"tax_total": Decimal("170.00"),
		"total_excluding_tax": Decimal("2100.00"),
		"total_including_tax": Decimal("2270.00"),
		"payable": Decimal("2270.00"),
	}
	values.update(overrides)
	return InvoiceData(**values)


class TestCodes(unittest.TestCase):
	def test_state_names_and_aliases(self):
		self.assertEqual(to_state_code("Selangor"), "10")
		self.assertEqual(to_state_code("selangor darul ehsan"), "10")
		self.assertEqual(to_state_code("Penang"), "07")
		self.assertEqual(to_state_code("WP Kuala Lumpur"), "14")
		self.assertEqual(to_state_code("14"), "14")
		self.assertEqual(to_state_code("Atlantis"), "")
		self.assertEqual(to_state_code(""), "")

	def test_unit_codes(self):
		self.assertEqual(to_unit_code("Nos"), "C62")
		self.assertEqual(to_unit_code("kg"), "KGM")
		self.assertEqual(to_unit_code(None), "C62")
		self.assertEqual(to_unit_code("parsec"), "C62")

	def test_quantity_formatting(self):
		self.assertEqual(format_quantity(Decimal("2.0000")), "2")
		self.assertEqual(format_quantity(Decimal("1.5")), "1.5")
		self.assertEqual(format_quantity(Decimal("0.25")), "0.25")
		self.assertEqual(format_quantity(None), "0")

	def test_money_rounds_half_up(self):
		self.assertEqual(money("1.005"), Decimal("1.01"))
		self.assertEqual(money(0.1 + 0.2), Decimal("0.30"))
		self.assertEqual(money(None), Decimal("0.00"))


class TestUblInvoice(unittest.TestCase):
	def setUp(self):
		self.data = invoice()
		self.document = build_ubl_invoice(self.data)
		self.body = self.document["Invoice"][0]

	def test_root_envelope(self):
		self.assertEqual(len(self.document["Invoice"]), 1)
		self.assertEqual(self.body["_D"], "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2")
		self.assertIn("CommonAggregateComponents-2", self.body["_A"])
		self.assertIn("CommonBasicComponents-2", self.body["_B"])

	def test_header_fields(self):
		self.assertEqual(self.body["ID"], [{"_": "INV-2026-0001"}])
		self.assertEqual(self.body["IssueDate"], [{"_": "2026-03-04"}])
		self.assertEqual(self.body["IssueTime"], [{"_": "02:30:00Z"}])
		self.assertEqual(self.body["InvoiceTypeCode"], [{"_": "01", "listVersionID": "1.1"}])
		self.assertEqual(self.body["DocumentCurrencyCode"], [{"_": "MYR"}])

	def test_every_scalar_value_is_wrapped_in_underscore(self):
		def walk(node, path="Invoice"):
			if isinstance(node, dict):
				scalars = {k: v for k, v in node.items() if not isinstance(v, dict | list)}
				self.assertTrue(
					set(scalars)
					<= {
						"_",
						"_A",
						"_B",
						"_D",
						"currencyID",
						"listID",
						"listVersionID",
						"schemeID",
						"unitCode",
					},
					f"unwrapped attribute at {path}: {scalars}",
				)
				for key, value in node.items():
					walk(value, f"{path}/{key}")
			elif isinstance(node, list):
				for index, value in enumerate(node):
					walk(value, f"{path}[{index}]")

		walk(self.document)

	def test_supplier_party(self):
		party = self.body["AccountingSupplierParty"][0]["Party"][0]
		self.assertEqual(party["PartyIdentification"][0]["ID"][0], {"_": "C2584563200", "schemeID": "TIN"})
		self.assertEqual(party["PartyName"][0]["Name"], [{"_": "Arena Technologies Sdn Bhd"}])
		self.assertEqual(
			party["PartyLegalEntity"][0]["CompanyID"][0],
			{"_": "201901009876", "schemeID": "BRN"},
		)
		self.assertEqual(party["PartyTaxScheme"][0]["TaxScheme"][0]["ID"], [{"_": "OTH"}])
		address = party["PostalAddress"][0]
		self.assertEqual(address["CityName"], [{"_": "Petaling Jaya"}])
		self.assertEqual(address["CountrySubentityCode"], [{"_": "10"}])
		self.assertEqual(address["Country"][0]["IdentificationCode"], [{"_": "MYS"}])
		self.assertEqual(
			[line["Line"][0]["_"] for line in address["AddressLine"]],
			["Level 12, Menara Arena", "Jalan SS 21/1"],
		)

	def test_buyer_without_sst_has_no_party_tax_scheme(self):
		party = self.body["AccountingCustomerParty"][0]["Party"][0]
		self.assertNotIn("PartyTaxScheme", party)
		self.assertEqual(
			party["PostalAddress"][0]["CountrySubentityCode"],
			[{"_": "14"}],
		)

	def test_general_public_buyer(self):
		document = build_ubl_invoice(invoice(buyer=general_public()))
		party = document["Invoice"][0]["AccountingCustomerParty"][0]["Party"][0]
		self.assertEqual(party["PartyIdentification"][0]["ID"][0]["_"], "EI00000000010")
		self.assertEqual(party["PartyLegalEntity"][0]["CompanyID"][0]["_"], "000000000000")
		self.assertEqual(party["PartyLegalEntity"][0]["CompanyID"][0]["schemeID"], "NRIC")
		self.assertEqual(party["PartyName"][0]["Name"][0]["_"], "General Public")

	def test_line_amounts_and_quantities(self):
		first = self.body["InvoiceLine"][0]
		self.assertEqual(first["ID"], [{"_": "1"}])
		self.assertEqual(first["InvoicedQuantity"][0], {"_": "2", "unitCode": "C62"})
		self.assertEqual(first["LineExtensionAmount"][0], {"_": "2000.00", "currencyID": "MYR"})
		self.assertEqual(first["Price"][0]["PriceAmount"][0], {"_": "1000.00", "currencyID": "MYR"})
		item = first["Item"][0]
		self.assertEqual(
			item["CommodityClassification"][0]["ItemClassificationCode"][0],
			{"_": "62010", "listID": "CLASS"},
		)
		self.assertNotIn("AllowanceCharge", first)

	def test_line_tax_total(self):
		tax = self.body["InvoiceLine"][0]["TaxTotal"][0]
		self.assertEqual(tax["TaxAmount"][0]["_"], "160.00")
		subtotal = tax["TaxSubtotal"][0]
		self.assertEqual(subtotal["TaxableAmount"][0]["_"], "2000.00")
		self.assertEqual(subtotal["Percent"], [{"_": "8.00"}])
		self.assertEqual(subtotal["TaxCategory"][0]["ID"], [{"_": "02"}])

	def test_header_tax_total_groups_by_type_and_rate(self):
		tax_total = self.body["TaxTotal"][0]
		self.assertEqual(tax_total["TaxAmount"][0]["_"], "170.00")
		subtotals = tax_total["TaxSubtotal"]
		self.assertEqual(len(subtotals), 2)
		self.assertEqual([s["TaxCategory"][0]["ID"][0]["_"] for s in subtotals], ["01", "02"])
		self.assertEqual([s["TaxAmount"][0]["_"] for s in subtotals], ["10.00", "160.00"])

	def test_legal_monetary_total(self):
		total = self.body["LegalMonetaryTotal"][0]
		self.assertEqual(total["LineExtensionAmount"][0]["_"], "2100.00")
		self.assertEqual(total["TaxExclusiveAmount"][0]["_"], "2100.00")
		self.assertEqual(total["TaxInclusiveAmount"][0]["_"], "2270.00")
		self.assertEqual(total["PayableAmount"][0]["_"], "2270.00")

	def test_discount_becomes_allowance_charge(self):
		line = Line(
			line_id="1",
			description="Bundle",
			quantity=Decimal("1"),
			unit_price=Decimal("500.00"),
			unit_code="C62",
			classification_code="62010",
			tax_type="06",
			tax_rate=Decimal("0"),
			tax_amount=Decimal("0.00"),
			line_extension=Decimal("450.00"),
			discount=Decimal("50.00"),
		)
		data = invoice(
			lines=[line],
			tax_total=Decimal("0"),
			total_excluding_tax=Decimal("450.00"),
			total_including_tax=Decimal("450.00"),
			payable=Decimal("450.00"),
		)
		row = build_ubl_invoice(data)["Invoice"][0]["InvoiceLine"][0]
		allowance = row["AllowanceCharge"][0]
		self.assertEqual(allowance["ChargeIndicator"], [{"_": "false"}])
		self.assertEqual(allowance["Amount"][0], {"_": "50.00", "currencyID": "MYR"})
		self.assertEqual(row["LineExtensionAmount"][0]["_"], "450.00")

	def test_billing_reference_for_credit_note(self):
		data = invoice(
			invoice_type="02",
			billing_reference_uuid="F1E2D3C4-B5A6-7890-1234-56789ABCDEF0",
		)
		reference = build_ubl_invoice(data)["Invoice"][0]["BillingReference"][0]
		self.assertEqual(
			reference["InvoiceDocumentReference"][0]["ID"],
			[{"_": "F1E2D3C4-B5A6-7890-1234-56789ABCDEF0"}],
		)

	def test_no_billing_reference_for_plain_invoice(self):
		self.assertNotIn("BillingReference", self.body)

	def test_note_is_emitted_when_present(self):
		document = build_ubl_invoice(invoice(notes="PO 4500012345"))
		self.assertEqual(document["Invoice"][0]["Note"], [{"_": "PO 4500012345"}])
		self.assertNotIn("Note", self.body)


class TestCommittedSample(unittest.TestCase):
	"""The sample under samples/ is a golden file: regenerate it with scripts/render_sample.py."""

	def test_sample_matches_the_builder(self):
		sample = Path(__file__).resolve().parents[2] / "samples" / "sample-einvoice.json"
		self.assertTrue(sample.exists(), "samples/sample-einvoice.json is missing")
		self.assertEqual(
			json.loads(sample.read_text(encoding="utf-8")),
			build_ubl_invoice(invoice()),
		)


class TestSerialisation(unittest.TestCase):
	def test_document_bytes_are_compact_utf8_json(self):
		payload = build_ubl_document(invoice(notes="Café — naïve"))
		text = payload.decode("utf-8")
		self.assertIn("Café — naïve", text)
		self.assertIn('"_":', text)
		# compact separators: re-dumping the parsed document must reproduce the bytes exactly
		self.assertEqual(json.dumps(json.loads(text), ensure_ascii=False, separators=(",", ":")), text)

	def test_hash_is_sha256_of_exact_bytes(self):
		payload = build_ubl_document(invoice())
		self.assertEqual(document_hash(payload), hashlib.sha256(payload).hexdigest())
		self.assertEqual(len(document_hash(payload)), 64)

	def test_submission_payload(self):
		payload = build_ubl_document(invoice())
		body = build_submission_payload([("INV-2026-0001", payload)])
		self.assertEqual(list(body.keys()), ["documents"])
		document = body["documents"][0]
		self.assertEqual(document["format"], "JSON")
		self.assertEqual(document["codeNumber"], "INV-2026-0001")
		self.assertEqual(document["documentHash"], hashlib.sha256(payload).hexdigest())
		self.assertEqual(base64.b64decode(document["document"]), payload)
		self.assertEqual(json.loads(payload)["Invoice"][0]["ID"][0]["_"], "INV-2026-0001")


class TestValidation(unittest.TestCase):
	def test_valid_invoice(self):
		self.assertEqual(validate_invoice(invoice(), today=TODAY), [])

	def test_missing_tin(self):
		errors = validate_invoice(invoice(buyer=buyer(tin="")), today=TODAY)
		self.assertTrue(any("Buyer: TIN is required" in e for e in errors), errors)

	def test_short_tin(self):
		errors = validate_invoice(invoice(buyer=buyer(tin="123")), today=TODAY)
		self.assertTrue(any("10-14 characters" in e for e in errors), errors)

	def test_non_myr_currency(self):
		errors = validate_invoice(invoice(currency="USD", payable=Decimal("0")), today=TODAY)
		self.assertTrue(any("MYR" in e for e in errors), errors)

	def test_state_that_is_not_malaysian(self):
		errors = validate_invoice(invoice(buyer=buyer(state="Bavaria")), today=TODAY)
		self.assertTrue(any("Buyer: state" in e for e in errors), errors)

	def test_blank_code_number(self):
		errors = validate_invoice(invoice(code_number="  "), today=TODAY)
		self.assertIn("Invoice number is required", errors)

	def test_no_lines(self):
		errors = validate_invoice(
			invoice(
				lines=[],
				tax_total=Decimal("0"),
				total_excluding_tax=Decimal("0"),
				total_including_tax=Decimal("0"),
				payable=Decimal("0"),
			),
			today=TODAY,
		)
		self.assertIn("An e-Invoice needs at least one line", errors)

	def test_zero_quantity(self):
		bad = Line(
			line_id="1",
			description="Ghost",
			quantity=Decimal("0"),
			unit_price=Decimal("10"),
			unit_code="C62",
			classification_code="62010",
			tax_type="06",
			tax_rate=Decimal("0"),
			tax_amount=Decimal("0"),
			line_extension=Decimal("0"),
		)
		errors = validate_invoice(
			invoice(
				lines=[bad],
				tax_total=Decimal("0"),
				total_excluding_tax=Decimal("0"),
				total_including_tax=Decimal("0"),
				payable=Decimal("0"),
			),
			today=TODAY,
		)
		self.assertTrue(any("quantity must be greater than zero" in e for e in errors), errors)

	def test_unknown_tax_type(self):
		bad = Line(
			line_id="1",
			description="Service",
			quantity=Decimal("1"),
			unit_price=Decimal("100"),
			unit_code="C62",
			classification_code="62010",
			tax_type="99",
			tax_rate=Decimal("0"),
			tax_amount=Decimal("0"),
			line_extension=Decimal("100.00"),
		)
		errors = validate_invoice(
			invoice(
				lines=[bad],
				tax_total=Decimal("0"),
				total_excluding_tax=Decimal("100.00"),
				total_including_tax=Decimal("100.00"),
				payable=Decimal("100.00"),
			),
			today=TODAY,
		)
		self.assertTrue(any("not a valid MyInvois tax type" in e for e in errors), errors)

	def test_tax_on_non_taxable_line(self):
		bad = Line(
			line_id="1",
			description="Exempt",
			quantity=Decimal("1"),
			unit_price=Decimal("100"),
			unit_code="C62",
			classification_code="62010",
			tax_type="06",
			tax_rate=Decimal("0"),
			tax_amount=Decimal("8.00"),
			line_extension=Decimal("100.00"),
		)
		errors = validate_invoice(invoice(lines=[bad]), today=TODAY)
		self.assertTrue(any("cannot carry a tax amount" in e for e in errors), errors)

	def test_classification_must_be_five_digits(self):
		bad = Line(
			line_id="1",
			description="Service",
			quantity=Decimal("1"),
			unit_price=Decimal("100"),
			unit_code="C62",
			classification_code="6201",
			tax_type="06",
			tax_rate=Decimal("0"),
			tax_amount=Decimal("0"),
			line_extension=Decimal("100.00"),
		)
		errors = validate_invoice(
			invoice(
				lines=[bad],
				tax_total=Decimal("0"),
				total_excluding_tax=Decimal("100.00"),
				total_including_tax=Decimal("100.00"),
				payable=Decimal("100.00"),
			),
			today=TODAY,
		)
		self.assertTrue(any("5-digit MSIC" in e for e in errors), errors)

	def test_line_extension_must_match_quantity_times_price(self):
		bad = Line(
			line_id="1",
			description="Service",
			quantity=Decimal("2"),
			unit_price=Decimal("100"),
			unit_code="C62",
			classification_code="62010",
			tax_type="06",
			tax_rate=Decimal("0"),
			tax_amount=Decimal("0"),
			line_extension=Decimal("150.00"),
		)
		errors = validate_invoice(invoice(lines=[bad]), today=TODAY)
		self.assertTrue(any("does not match" in e for e in errors), errors)

	def test_totals_must_reconcile(self):
		errors = validate_invoice(invoice(tax_total=Decimal("0")), today=TODAY)
		self.assertTrue(any("Tax total" in e for e in errors), errors)

	def test_payable_must_equal_tax_inclusive_total(self):
		errors = validate_invoice(invoice(payable=Decimal("2000.00")), today=TODAY)
		self.assertTrue(any("Payable amount" in e for e in errors), errors)

	def test_future_issue_date(self):
		errors = validate_invoice(invoice(issue_date=date(2026, 3, 31)), today=TODAY)
		self.assertTrue(any("future" in e for e in errors), errors)

	def test_credit_note_requires_original_uuid(self):
		errors = validate_invoice(invoice(invoice_type="02"), today=TODAY)
		self.assertTrue(any("must reference the UUID" in e for e in errors), errors)

	def test_credit_note_with_reference_is_fine(self):
		errors = validate_invoice(
			invoice(invoice_type="02", billing_reference_uuid="F1E2D3C4-B5A6-7890-1234-56789ABCDEF0"),
			today=TODAY,
		)
		self.assertEqual(errors, [])

	def test_assert_valid_raises_with_all_errors(self):
		with self.assertRaises(InvoiceValidationError) as caught:
			assert_valid_invoice(invoice(currency="USD", buyer=buyer(tin="")), today=TODAY)
		self.assertGreaterEqual(len(caught.exception.errors), 2)
		self.assertIn("USD", str(caught.exception))


if __name__ == "__main__":
	unittest.main()
