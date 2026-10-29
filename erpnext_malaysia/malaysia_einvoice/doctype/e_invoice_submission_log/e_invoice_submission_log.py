# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe.model.document import Document

#: Once LHDN has the document, the log row is evidence — it must not disappear.
PROTECTED_STATUSES = frozenset({"Submitted", "Valid", "Cancelled", "Rejected"})


class EInvoiceSubmissionLog(Document):
	def on_trash(self):
		if self.status in PROTECTED_STATUSES:
			frappe.throw(
				frappe._(
					"Submission log {0} is part of the e-Invoice audit trail and cannot be deleted. "
					"Cancel the e-Invoice at MyInvois instead."
				).format(frappe.bold(self.name))
			)
