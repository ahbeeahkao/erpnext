# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Install / migrate hooks.

The app keeps every field it needs in **custom fields**, so installing (or uninstalling) it never
touches ERPNext's own DocType JSON and an ``erpnext`` upgrade cannot silently drop them.
"""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

REGISTRATION_TYPES = "BRN\nNRIC\nPASSPORT\nARMY"
TAX_TYPES = "01\n02\n03\n04\n05\n06\nE"

CUSTOM_FIELDS: dict[str, list[dict]] = {
	"Company": [
		{
			"fieldname": "custom_malaysia_tin",
			"label": "Malaysia TIN",
			"fieldtype": "Data",
			"insert_after": "tax_id",
			"description": "Tax Identification Number issued by LHDN, e.g. C2584563200.",
		},
		{
			"fieldname": "custom_malaysia_registration_type",
			"label": "Malaysia Registration Type",
			"fieldtype": "Select",
			"options": REGISTRATION_TYPES,
			"default": "BRN",
			"insert_after": "custom_malaysia_tin",
		},
		{
			"fieldname": "custom_malaysia_registration_no",
			"label": "Malaysia Registration No.",
			"fieldtype": "Data",
			"insert_after": "custom_malaysia_registration_type",
			"description": "Business Registration Number (SSM) or NRIC for sole proprietors.",
		},
		{
			"fieldname": "custom_malaysia_sst_no",
			"label": "SST Registration No.",
			"fieldtype": "Data",
			"insert_after": "custom_malaysia_registration_no",
			"description": "Sales & Service Tax registration number, if the company is SST registered.",
		},
	],
	"Customer": [
		{
			"fieldname": "custom_malaysia_tin",
			"label": "Malaysia TIN",
			"fieldtype": "Data",
			"insert_after": "tax_id",
			"description": "Buyer TIN. Leave blank for B2C sales and tick 'General Public buyer' on the invoice.",
		},
		{
			"fieldname": "custom_malaysia_registration_type",
			"label": "Malaysia Registration Type",
			"fieldtype": "Select",
			"options": REGISTRATION_TYPES,
			"default": "BRN",
			"insert_after": "custom_malaysia_tin",
		},
		{
			"fieldname": "custom_malaysia_registration_no",
			"label": "Malaysia Registration No.",
			"fieldtype": "Data",
			"insert_after": "custom_malaysia_registration_type",
		},
		{
			"fieldname": "custom_malaysia_sst_no",
			"label": "SST Registration No.",
			"fieldtype": "Data",
			"insert_after": "custom_malaysia_registration_no",
		},
	],
	"Item": [
		{
			"fieldname": "custom_malaysia_classification_code",
			"label": "MSIC Classification Code",
			"fieldtype": "Link",
			"options": "LHDN Classification Code",
			"insert_after": "item_group",
			"description": "Five-digit MSIC 2008 code reported on e-Invoices for this item.",
		},
		{
			"fieldname": "custom_malaysia_tax_type",
			"label": "MyInvois Tax Type",
			"fieldtype": "Select",
			"options": TAX_TYPES,
			"insert_after": "custom_malaysia_classification_code",
			"description": "01 Sales Tax, 02 Service Tax, 06 Not Applicable, E Tax Exemption.",
		},
	],
	"Sales Invoice": [
		{
			"fieldname": "custom_malaysia_einvoice_section",
			"label": "Malaysia e-Invoice",
			"fieldtype": "Section Break",
			"insert_after": "remarks",
			"collapsible": 1,
		},
		{
			"fieldname": "custom_malaysia_einvoice_status",
			"label": "e-Invoice Status",
			"fieldtype": "Select",
			"options": "Not Submitted\nQueued\nSubmitting\nSubmitted\nValid\nInvalid\nCancelled\nRejected\nRetry\nError\nSkipped",
			"default": "Not Submitted",
			"read_only": 1,
			"no_copy": 1,
			"allow_on_submit": 1,
			"in_standard_filter": 1,
			"insert_after": "custom_malaysia_einvoice_section",
		},
		{
			"fieldname": "custom_malaysia_invoice_type",
			"label": "e-Invoice Type",
			"fieldtype": "Select",
			"options": "\n01\n02\n03\n04",
			"insert_after": "custom_malaysia_einvoice_status",
			"description": "Leave blank to derive it: invoices 01, returns 02 (with original) or 04, debit notes 03.",
		},
		{
			"fieldname": "custom_malaysia_general_public",
			"label": "General Public Buyer",
			"fieldtype": "Check",
			"insert_after": "custom_malaysia_invoice_type",
			"description": "Submit to LHDN's General Public buyer (B2C / consolidated e-Invoice).",
		},
		{
			"fieldname": "custom_malaysia_billing_reference",
			"label": "Original e-Invoice UUID",
			"fieldtype": "Data",
			"insert_after": "custom_malaysia_general_public",
			"description": "Required on credit/debit notes when the original invoice was not issued from this site.",
		},
		{
			"fieldname": "custom_malaysia_einvoice_uuid",
			"label": "MyInvois Document UUID",
			"fieldtype": "Data",
			"read_only": 1,
			"no_copy": 1,
			"allow_on_submit": 1,
			"insert_after": "custom_malaysia_billing_reference",
		},
		{
			"fieldname": "custom_malaysia_submission_uid",
			"label": "MyInvois Submission UID",
			"fieldtype": "Data",
			"read_only": 1,
			"no_copy": 1,
			"allow_on_submit": 1,
			"insert_after": "custom_malaysia_einvoice_uuid",
		},
	],
}

#: A starting set of MSIC 2008 codes. The full list is published by DOSM; import it into
#: 'LHDN Classification Code' with the Data Import tool and delete what you do not sell.
STARTER_CLASSIFICATION_CODES = [
	{
		"code": "01110",
		"description": "Growing of cereals (except rice), leguminous crops and oil seeds",
		"category": "Goods",
	},
	{
		"code": "10101",
		"description": "Processing and preserving of meat and production of meat products",
		"category": "Goods",
	},
	{"code": "18110", "description": "Printing", "category": "Goods"},
	{
		"code": "25999",
		"description": "Manufacture of other fabricated metal products n.e.c.",
		"category": "Goods",
	},
	{"code": "33121", "description": "Repair of machinery", "category": "Services"},
	{"code": "41001", "description": "Construction of residential buildings", "category": "Services"},
	{"code": "46100", "description": "Wholesale on a fee or contract basis", "category": "Services"},
	{"code": "46900", "description": "Non-specialised wholesale trade", "category": "Goods"},
	{"code": "47110", "description": "Retail sale in non-specialised stores", "category": "Goods"},
	{"code": "49231", "description": "Freight transport by road", "category": "Services"},
	{
		"code": "56101",
		"description": "Restaurants and mobile food service activities",
		"category": "Services",
	},
	{
		"code": "58110",
		"description": "Publishing of books, brochures and other publications",
		"category": "Goods",
	},
	{"code": "62010", "description": "Computer programming activities", "category": "Services"},
	{"code": "62020", "description": "Information technology consultancy activities", "category": "Services"},
	{
		"code": "62090",
		"description": "Other information technology and computer service activities",
		"category": "Services",
	},
	{
		"code": "68101",
		"description": "Real estate activities with own or leased property",
		"category": "Services",
	},
	{"code": "70209", "description": "Other management consultancy activities", "category": "Services"},
	{"code": "73100", "description": "Advertising", "category": "Services"},
	{
		"code": "82110",
		"description": "Combined office administrative service activities",
		"category": "Services",
	},
	{"code": "96020", "description": "Hairdressing and other beauty treatment", "category": "Services"},
]


def after_install() -> None:
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
	seed_classification_codes()


def after_migrate() -> None:
	"""Re-assert the custom fields: an erpnext upgrade may have rebuilt DocTypes."""
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)


def before_uninstall() -> None:
	"""Remove this app's custom fields so uninstalling leaves no orphans behind."""
	for doctype, fields in CUSTOM_FIELDS.items():
		for field in fields:
			name = frappe.db.get_value(
				"Custom Field", {"dt": doctype, "fieldname": field["fieldname"]}, "name"
			)
			if name:
				frappe.delete_doc("Custom Field", name, force=True, ignore_permissions=True)


def seed_classification_codes() -> None:
	"""Insert the starter MSIC codes without ever overwriting an existing row."""
	seeded = 0
	for row in STARTER_CLASSIFICATION_CODES:
		if frappe.db.exists("LHDN Classification Code", row["code"]):
			continue
		frappe.get_doc({"doctype": "LHDN Classification Code", **row}).insert(
			ignore_permissions=True, ignore_mandatory=True
		)
		seeded += 1
	if seeded:
		frappe.db.commit()  # install runs outside a request transaction
