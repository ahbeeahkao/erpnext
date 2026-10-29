# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

import re

import frappe
from frappe.model.document import Document

MSIC_PATTERN = re.compile(r"^\d{5}$")


class LHDNClassificationCode(Document):
	def validate(self):
		self.code = (self.code or "").strip()
		if not MSIC_PATTERN.match(self.code):
			frappe.throw(frappe._("The classification code must be exactly five digits (e.g. 62010)."))
		self.description = (self.description or "").strip()
