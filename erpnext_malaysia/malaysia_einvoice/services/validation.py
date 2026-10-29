# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Pre-flight validation for a MyInvois e-Invoice.

Catching these locally matters: a rejected submission costs a round trip and, on the MyInvois
side, an audit record. The rules mirror the mandatory fields in the SDK's e-Invoice v1.1
specification plus the arithmetic that LHDN validates server-side.

Pure Python — unit tested without a bench.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from .codes import (
	CREDIT_NOTE_TYPE,
	DEBIT_NOTE_TYPE,
	REFUND_NOTE_TYPE,
	REGISTRATION_TYPES,
	SUPPORTED_CURRENCY,
	TAX_TYPES,
	TAXABLE_TAX_TYPES,
	to_state_code,
)
from .models import InvoiceData, money

TOLERANCE = Decimal("0.01")
MIN_TIN_LENGTH = 10
MAX_TIN_LENGTH = 14
CLASSIFICATION_LENGTH = 5


class InvoiceValidationError(ValueError):
	"""Raised when an invoice cannot be submitted to MyInvois."""

	def __init__(self, errors: list[str]):
		self.errors = errors
		super().__init__("; ".join(errors))


def _check_party(role: str, party, errors: list[str]) -> None:
	tin = (party.tin or "").strip()
	if not tin:
		errors.append(f"{role}: TIN is required")
	elif not MIN_TIN_LENGTH <= len(tin) <= MAX_TIN_LENGTH:
		errors.append(f"{role}: TIN {tin!r} should be {MIN_TIN_LENGTH}-{MAX_TIN_LENGTH} characters")

	if party.registration_type not in REGISTRATION_TYPES:
		errors.append(
			f"{role}: registration type {party.registration_type!r} must be one of "
			f"{', '.join(sorted(REGISTRATION_TYPES))}"
		)

	registration = (party.registration or "").strip()
	if not registration:
		errors.append(f"{role}: registration number is required")

	if not (party.name or "").strip():
		errors.append(f"{role}: name is required")

	if not (party.address_line1 or "").strip():
		errors.append(f"{role}: address line 1 is required")
	if not (party.city or "").strip():
		errors.append(f"{role}: city is required")
	if not (party.postal_code or "").strip():
		errors.append(f"{role}: postcode is required")
	if not to_state_code(party.state) and not (party.state or "").strip().isdigit():
		errors.append(f"{role}: state {party.state!r} is not a recognised Malaysian state code")

	if party.country_code and party.country_code != "MYS":
		errors.append(f"{role}: country must be MYS for a Malaysian e-Invoice")


def _check_line(index: int, line, errors: list[str]) -> None:
	label = f"Line {index}"
	if not (line.description or "").strip():
		errors.append(f"{label}: description is required")

	if line.quantity is None or Decimal(line.quantity) <= 0:
		errors.append(f"{label}: quantity must be greater than zero")

	if line.unit_price is None or Decimal(line.unit_price) < 0:
		errors.append(f"{label}: unit price cannot be negative")

	if line.tax_type not in TAX_TYPES:
		errors.append(f"{label}: tax type {line.tax_type!r} is not a valid MyInvois tax type")
	elif line.tax_type not in TAXABLE_TAX_TYPES and money(line.tax_amount) != 0:
		errors.append(f"{label}: tax type {line.tax_type!r} cannot carry a tax amount")

	if not (Decimal("0") <= Decimal(line.tax_rate) <= Decimal("100")):
		errors.append(f"{label}: tax rate must be between 0 and 100")

	classification = (line.classification_code or "").strip()
	if not classification:
		errors.append(f"{label}: classification (MSIC) code is required")
	elif not (classification.isdigit() and len(classification) == CLASSIFICATION_LENGTH):
		errors.append(f"{label}: classification code {classification!r} should be a 5-digit MSIC code")

	expected = money(Decimal(line.quantity) * Decimal(line.unit_price) - Decimal(line.discount or 0))
	if money(line.line_extension) != expected:
		errors.append(
			f"{label}: line total {money(line.line_extension)} does not match "
			f"quantity x price - discount ({expected})"
		)


def validate_invoice(data: InvoiceData, today: date | None = None) -> list[str]:
	"""Return a list of human-readable problems; an empty list means the invoice is valid."""
	errors: list[str] = []

	if not (data.code_number or "").strip():
		errors.append("Invoice number is required")

	if data.currency != SUPPORTED_CURRENCY:
		errors.append(f"Currency must be {SUPPORTED_CURRENCY} (got {data.currency!r})")

	if data.invoice_type not in {"01", "02", "03", "04"}:
		errors.append(f"Invoice type {data.invoice_type!r} is not valid")

	_check_party("Supplier", data.supplier, errors)
	_check_party("Buyer", data.buyer, errors)

	if (
		data.invoice_type in {CREDIT_NOTE_TYPE, DEBIT_NOTE_TYPE, REFUND_NOTE_TYPE}
		and not (data.billing_reference_uuid or "").strip()
	):
		errors.append("Credit/debit/refund notes must reference the UUID of the original e-Invoice")

	if not data.lines:
		errors.append("An e-Invoice needs at least one line")

	for index, line in enumerate(data.lines, start=1):
		_check_line(index, line, errors)

	# ---- totals: LHDN recomputes these and rejects silent mismatches --------------------
	line_sum = money(sum((Decimal(line.line_extension) for line in data.lines), Decimal("0")))
	tax_sum = money(sum((Decimal(line.tax_amount) for line in data.lines), Decimal("0")))

	if money(data.total_excluding_tax) != line_sum:
		errors.append(
			f"Total excluding tax {money(data.total_excluding_tax)} does not equal the sum of lines ({line_sum})"
		)

	if money(data.tax_total) != tax_sum:
		errors.append(f"Tax total {money(data.tax_total)} does not equal the sum of line tax ({tax_sum})")

	expected_including = money(line_sum + tax_sum)
	if money(data.total_including_tax) != expected_including:
		errors.append(f"Total including tax {money(data.total_including_tax)} should be {expected_including}")

	if money(data.payable) != money(data.total_including_tax):
		errors.append(
			f"Payable amount {money(data.payable)} should equal the total including tax "
			f"({money(data.total_including_tax)})"
		)

	# ---- dates ------------------------------------------------------------------------
	reference_today = today or datetime.now().date()
	if isinstance(data.issue_date, datetime):
		issue = data.issue_date.date()
	else:
		issue = data.issue_date
	if issue and issue > reference_today + timedelta(days=1):
		errors.append(f"Issue date {issue} is in the future")

	return errors


def assert_valid_invoice(data: InvoiceData, today: date | None = None) -> None:
	"""Raise :class:`InvoiceValidationError` when the invoice is not submit-ready."""
	errors = validate_invoice(data, today=today)
	if errors:
		raise InvoiceValidationError(errors)
