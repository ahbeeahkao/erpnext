# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Value objects for a MyInvois e-Invoice.

Deliberately plain: no Frappe, no I/O, so the mapping and the UBL builder can be unit
tested outside a bench and reused by any document type (Sales Invoice today, POS or
purchase-side self-billed documents later).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal

MONEY = Decimal("0.01")


def money(value: Decimal | float | int | str | None) -> Decimal:
	"""Coerce to a 2-decimal Decimal, rounding half up (banker's rounding is wrong for tax)."""
	if value is None or value == "":
		return Decimal("0.00")
	return Decimal(str(value)).quantize(MONEY, rounding=ROUND_HALF_UP)


def qty(value: Decimal | float | int | str | None) -> Decimal:
	if value is None or value == "":
		return Decimal("0")
	return Decimal(str(value))


@dataclass(frozen=True)
class Party:
	"""A supplier or buyer as MyInvois expects it."""

	tin: str
	registration: str
	registration_type: str  # BRN | NRIC | PASSPORT | ARMY
	name: str
	address_line1: str
	city: str
	state: str  # state name or numeric code; normalised by the builder
	postal_code: str
	country_code: str = "MYS"
	address_line2: str = ""
	address_line3: str = ""
	phone: str = ""
	email: str = ""
	sst_registration: str = ""


@dataclass(frozen=True)
class Line:
	line_id: str
	description: str
	quantity: Decimal
	unit_price: Decimal
	unit_code: str
	classification_code: str
	tax_type: str
	tax_rate: Decimal
	tax_amount: Decimal
	line_extension: Decimal
	discount: Decimal = Decimal("0.00")


@dataclass(frozen=True)
class InvoiceData:
	"""Everything the UBL builder needs, already normalised."""

	code_number: str
	issue_date: date
	issue_time: time
	invoice_type: str
	currency: str
	supplier: Party
	buyer: Party
	lines: list[Line] = field(default_factory=list)
	tax_total: Decimal = Decimal("0.00")
	total_excluding_tax: Decimal = Decimal("0.00")
	total_including_tax: Decimal = Decimal("0.00")
	payable: Decimal = Decimal("0.00")
	notes: str = ""
	#: UUID of the original invoice for credit/debit/refund notes.
	billing_reference_uuid: str = ""

	def line_count(self) -> int:
		return len(self.lines)

	def tax_subtotals(self) -> list[dict]:
		"""Group the lines by (tax type, rate) for the header-level ``TaxTotal``.

		Returned sorted by tax type so the generated document is deterministic.
		"""
		groups: dict[tuple[str, Decimal], dict[str, Decimal]] = {}
		for line in self.lines:
			key = (line.tax_type, money(line.tax_rate))
			bucket = groups.setdefault(key, {"taxable": Decimal("0.00"), "tax": Decimal("0.00")})
			bucket["taxable"] += money(line.line_extension)
			bucket["tax"] += money(line.tax_amount)

		return [
			{
				"tax_type": tax_type,
				"rate": rate,
				"taxable_amount": money(bucket["taxable"]),
				"tax_amount": money(bucket["tax"]),
			}
			for (tax_type, rate), bucket in sorted(groups.items(), key=lambda item: (item[0][0], item[0][1]))
		]


def combine(date_value: date, time_value: time) -> datetime:
	return datetime.combine(date_value, time_value)
