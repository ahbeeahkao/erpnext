# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe.model.document import Document
from malaysia_einvoice.services.client import clear_token_cache
from malaysia_einvoice.services.codes import TAX_TYPES


class MalaysiaEInvoiceSettings(Document):
	def validate(self):
		self.validate_credentials()
		self.validate_tax_accounts()

	def validate_credentials(self):
		if not self.enabled:
			return
		if not (self.client_id or "").strip():
			frappe.throw(frappe._("A MyInvois Client ID is required before e-Invoicing can be enabled."))
		if not self.get_password("client_secret", raise_exception=False):
			frappe.throw(frappe._("A MyInvois Client Secret is required before e-Invoicing can be enabled."))

	def validate_tax_accounts(self):
		seen: set[str] = set()
		for row in self.get("tax_accounts") or []:
			if not row.account:
				continue
			if row.account in seen:
				frappe.throw(
					frappe._("Tax account {0} is listed twice in the tax account mapping.").format(
						frappe.bold(row.account)
					)
				)
			seen.add(row.account)
			if row.tax_type and row.tax_type not in TAX_TYPES:
				frappe.throw(
					frappe._("Row {0}: {1} is not a valid MyInvois tax type.").format(
						row.idx, frappe.bold(row.tax_type)
					)
				)

	def on_update(self):
		# Credentials or environment may have changed: never reuse a token across them.
		clear_token_cache()
