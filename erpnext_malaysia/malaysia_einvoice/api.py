# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Whitelisted endpoints used by the Desk buttons and by external integrations.

Every method checks permissions on the document it touches; ``submit``/``cancel`` need write
access to the Sales Invoice and are additionally limited to roles that can read the log.
"""

from __future__ import annotations

import frappe
from frappe import _

from .services.client import MyInvoisError
from .services.mapping import build_invoice_data, get_settings
from .services.submission import cancel_invoice, get_client, latest_log, refresh_log_status, submit_invoice
from .services.ubl import build_ubl_invoice, serialise
from .services.ubl import document_hash as compute_hash
from .services.validation import InvoiceValidationError, validate_invoice

SALES_INVOICE = "Sales Invoice"


def _get_invoice(sales_invoice: str, permission: str = "read"):
	doc = frappe.get_doc(SALES_INVOICE, sales_invoice)
	doc.check_permission(permission)
	if doc.docstatus != 1:
		frappe.throw(_("Only submitted Sales Invoices can be sent to MyInvois."))
	return doc


@frappe.whitelist()
def preview_document(sales_invoice: str) -> dict:
	"""Return the UBL JSON that *would* be submitted, plus any validation problems."""
	doc = _get_invoice(sales_invoice)

	try:
		data, warnings = build_invoice_data(doc)
	except InvoiceValidationError as error:
		return {"ok": False, "errors": error.errors, "warnings": [], "document": None, "hash": None}

	errors = validate_invoice(data)
	document = build_ubl_invoice(data)
	payload = serialise(document)

	return {
		"ok": not errors,
		"errors": errors,
		"warnings": warnings,
		"hash": compute_hash(payload),
		"document": document,
	}


@frappe.whitelist()
def submit_now(sales_invoice: str) -> dict:
	"""Submit one Sales Invoice synchronously (Desk button / integration)."""
	doc = _get_invoice(sales_invoice, permission="write")

	try:
		result = submit_invoice(doc.name)
	except InvoiceValidationError as error:
		frappe.throw(
			_("This invoice cannot be e-Invoiced yet:")
			+ "<br>"
			+ "<br>".join(frappe.utils.escape_html(message) for message in error.errors),
			title=_("e-Invoice validation failed"),
		)
	except MyInvoisError as error:
		frappe.throw(error.describe(), title=_("MyInvois error"))

	if result.get("status") in ("Error", "Rejected"):
		frappe.throw(result.get("message") or _("MyInvois did not accept the document."))

	return result


@frappe.whitelist()
def get_status(sales_invoice: str) -> dict:
	"""Current local + LHDN status for a Sales Invoice."""
	doc = _get_invoice(sales_invoice)
	log = latest_log(doc.name)
	status = doc.get("custom_malaysia_einvoice_status") or "Not Submitted"
	if not log:
		return {"status": status, "log": None, "uuid": None}

	return {
		"status": log.status,
		"log": log.name,
		"uuid": log.get("uuid"),
		"submission_uid": log.get("submission_uid"),
		"invoice_status": status,
		"error": log.get("error"),
		"submitted_on": log.get("submitted_on"),
		"last_checked_on": log.get("last_checked_on"),
	}


@frappe.whitelist()
def refresh_status(log_name: str) -> dict:
	"""Poll MyInvois for one submission log."""
	log = frappe.get_doc("E Invoice Submission Log", log_name)
	log.check_permission("write")
	if not log.get("uuid") and not log.get("submission_uid"):
		frappe.throw(_("This submission has no MyInvois identifier yet."))

	try:
		return refresh_log_status(log_name)
	except MyInvoisError as error:
		frappe.throw(error.describe(), title=_("MyInvois error"))


@frappe.whitelist()
def cancel(sales_invoice: str, reason: str) -> dict:
	"""Cancel the e-Invoice linked to a Sales Invoice (LHDN's 72-hour window applies)."""
	doc = _get_invoice(sales_invoice, permission="write")
	reason = (reason or "").strip()
	if not reason:
		frappe.throw(_("A reason is required to cancel an e-Invoice at MyInvois."))

	try:
		return cancel_invoice(doc.name, reason)
	except MyInvoisError as error:
		frappe.throw(error.describe(), title=_("MyInvois error"))


@frappe.whitelist()
def resubmit(log_name: str) -> dict:
	"""Retry a failed submission from the log row."""
	log = frappe.get_doc("E Invoice Submission Log", log_name)
	log.check_permission("write")
	if log.status not in ("Error", "Rejected", "Retry", "Queued", "Invalid"):
		frappe.throw(_("{0} is already {1} at MyInvois.").format(log.sales_invoice, log.status))

	return submit_now(log.sales_invoice)


@frappe.whitelist()
def validate_tin(tin: str, registration_type: str, registration_no: str) -> dict:
	"""Ask LHDN whether a TIN/registration pair exists (Settings page helper)."""
	frappe.only_for(("System Manager", "Accounts Manager"))
	if not (tin and registration_type and registration_no):
		frappe.throw(_("TIN, registration type and registration number are all required."))

	try:
		valid = get_client().validate_tin(tin.strip(), registration_type, registration_no.strip())
	except MyInvoisError as error:
		frappe.throw(error.describe(), title=_("MyInvois error"))

	return {"valid": valid, "tin": tin, "registration_type": registration_type}


@frappe.whitelist()
def get_submission_log(log_name: str) -> dict:
	log = frappe.get_doc("E Invoice Submission Log", log_name)
	log.check_permission("read")
	return {
		"name": log.name,
		"sales_invoice": log.sales_invoice,
		"status": log.status,
		"uuid": log.get("uuid"),
		"submission_uid": log.get("submission_uid"),
		"long_id": log.get("long_id"),
		"document_hash": log.get("document_hash"),
		"error": log.get("error"),
		"request": log.get("request"),
		"response": log.get("response"),
	}


@frappe.whitelist()
def document_preview_for_log(log_name: str) -> dict:
	"""Re-generate the payload for a log row (handy when investigating a rejection)."""
	log = frappe.get_doc("E Invoice Submission Log", log_name)
	log.check_permission("read")
	if log.get("request"):
		return {"source": "log", "document": log.request}

	doc = frappe.get_doc(SALES_INVOICE, log.sales_invoice)
	data, _warnings = build_invoice_data(doc)
	return {"source": "generated", "document": serialise(build_ubl_invoice(data)).decode("utf-8")}


@frappe.whitelist()
def settings_status() -> dict:
	"""Small health check used by the Desk page: configured? enabled? which environment?"""
	settings = get_settings()
	return {
		"enabled": bool(settings.get("enabled")),
		"environment": settings.get("environment") or "Sandbox",
		"has_credentials": bool(settings.get("client_id"))
		and bool(settings.get_password("client_secret", raise_exception=False)),
		"auto_submit": bool(settings.get("auto_submit")),
	}
