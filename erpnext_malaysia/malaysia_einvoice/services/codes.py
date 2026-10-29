# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""LHDN MyInvois reference codes.

Sources:
  * e-Invoice types: https://sdk.myinvois.hasil.gov.my/codes/e-invoice-types/
  * Tax types:       https://sdk.myinvois.hasil.gov.my/codes/tax-types/
  * Unit codes:      UN/ECE Recommendation 20 (used by UBL ``unitCode``)
  * State codes:     Malaysian state/territory codes used by LHDN

This module is import-free on purpose: it is safe to unit test without a Frappe bench.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- document types

INVOICE_TYPES: dict[str, str] = {
	"01": "Invoice",
	"02": "Credit Note",
	"03": "Debit Note",
	"04": "Refund Note",
}

CREDIT_NOTE_TYPE = "02"
DEBIT_NOTE_TYPE = "03"
REFUND_NOTE_TYPE = "04"

# --------------------------------------------------------------------------- tax

#: Tax type codes accepted by MyInvois.
TAX_TYPES: dict[str, str] = {
	"01": "Sales Tax",
	"02": "Service Tax",
	"03": "Tourism Tax",
	"04": "High-Value Goods Tax",
	"05": "Sales Tax on Low Value Goods",
	"06": "Not Applicable",
	"E": "Tax Exemption",
}

#: Codes that represent a taxable supply (i.e. carry a tax rate and amount).
TAXABLE_TAX_TYPES = frozenset({"01", "02", "03", "04", "05"})

#: Used for the ``TaxScheme/ID`` element. MyInvois samples use ``OTH`` (other).
TAX_SCHEME_ID = "OTH"

#: UBL id used for the item classification (MSIC) code list.
CLASSIFICATION_LIST_ID = "CLASS"

# --------------------------------------------------------------------------- UBL envelope

UBL_INVOICE_NAMESPACE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
UBL_AGGREGATE_NAMESPACE = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
UBL_BASIC_NAMESPACE = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"

#: Value of ``cbc:InvoiceTypeCode/@listVersionID`` for the current SDK.
INVOICE_VERSION = "1.1"

#: MyInvois only accepts Malaysian Ringgit documents.
SUPPORTED_CURRENCY = "MYR"
DEFAULT_COUNTRY_CODE = "MYS"

# --------------------------------------------------------------------------- parties

REGISTRATION_TYPES: dict[str, str] = {
	"BRN": "Business Registration Number",
	"NRIC": "National Registration Identity Card",
	"PASSPORT": "Passport",
	"ARMY": "Army Number",
}

#: LHDN's "General Public" buyer, used for B2C invoices where the buyer has no TIN.
GENERAL_PUBLIC = {
	"tin": "EI00000000010",
	"registration_type": "NRIC",
	"registration": "000000000000",
	"name": "General Public",
}

# --------------------------------------------------------------------------- states

#: Malaysian state/territory codes (``CountrySubentityCode``).
MY_STATES: dict[str, str] = {
	"01": "Johor",
	"02": "Kedah",
	"03": "Kelantan",
	"04": "Melaka",
	"05": "Negeri Sembilan",
	"06": "Pahang",
	"07": "Pulau Pinang",
	"08": "Perak",
	"09": "Perlis",
	"10": "Selangor",
	"11": "Terengganu",
	"12": "Sabah",
	"13": "Sarawak",
	"14": "Wilayah Persekutuan Kuala Lumpur",
	"15": "Wilayah Persekutuan Labuan",
	"16": "Wilayah Persekutuan Putrajaya",
}

_STATE_ALIASES: dict[str, str] = {
	"johor": "01",
	"kedah": "02",
	"kelantan": "03",
	"melaka": "04",
	"malacca": "04",
	"negeri sembilan": "05",
	"pahang": "06",
	"pulau pinang": "07",
	"penang": "07",
	"perak": "08",
	"perlis": "09",
	"selangor": "10",
	"terengganu": "11",
	"sabah": "12",
	"sarawak": "13",
	"kuala lumpur": "14",
	"wp kuala lumpur": "14",
	"wilayah persekutuan kuala lumpur": "14",
	"labuan": "15",
	"wp labuan": "15",
	"wilayah persekutuan labuan": "15",
	"putrajaya": "16",
	"wp putrajaya": "16",
	"wilayah persekutuan putrajaya": "16",
}

# --------------------------------------------------------------------------- units

#: Common ERPNext UOMs mapped to UN/ECE Recommendation 20 unit codes.
UNIT_CODES: dict[str, str] = {
	"nos": "C62",
	"no": "C62",
	"unit": "C62",
	"units": "C62",
	"pcs": "C62",
	"piece": "C62",
	"pieces": "C62",
	"kg": "KGM",
	"kilogram": "KGM",
	"g": "GRM",
	"gram": "GRM",
	"mg": "MGM",
	"l": "LTR",
	"litre": "LTR",
	"liter": "LTR",
	"ml": "MLT",
	"m": "MTR",
	"meter": "MTR",
	"metre": "MTR",
	"cm": "CMT",
	"mm": "MMT",
	"box": "BOX",
	"carton": "CT",
	"pack": "PA",
	"set": "SET",
	"pair": "PR",
	"roll": "RO",
	"bag": "BG",
	"sack": "BG",
	"dozen": "DZN",
	"tonne": "TNE",
	"ton": "TNE",
	"hour": "HUR",
	"hr": "HUR",
	"day": "DAY",
	"month": "MON",
	"year": "ANN",
	"sqm": "MTK",
	"sqft": "FTK",
	"cbm": "MTQ",
}

DEFAULT_UNIT_CODE = "C62"


def is_known_unit(uom: str | None) -> bool:
	return bool(uom) and uom.strip().lower() in UNIT_CODES


def to_unit_code(uom: str | None) -> str:
	"""Map an ERPNext UOM to a UBL ``unitCode``, falling back to "one piece" (C62)."""
	if not uom:
		return DEFAULT_UNIT_CODE
	return UNIT_CODES.get(uom.strip().lower(), DEFAULT_UNIT_CODE)


def to_state_code(state: str | None) -> str:
	"""Map a state name (or an already numeric code) to the LHDN state code."""
	if not state:
		return ""
	clean = state.strip()
	if clean in MY_STATES:
		return clean
	# tolerate "Selangor Darul Ehsan", "WP Kuala Lumpur", "Pulau Pinang (Penang)" …
	lowered = clean.lower()
	if lowered in _STATE_ALIASES:
		return _STATE_ALIASES[lowered]
	for alias, code in _STATE_ALIASES.items():
		if alias in lowered:
			return code
	return ""


def tax_type_label(code: str) -> str:
	return TAX_TYPES.get(code, code)


def invoice_type_label(code: str) -> str:
	return INVOICE_TYPES.get(code, code)
