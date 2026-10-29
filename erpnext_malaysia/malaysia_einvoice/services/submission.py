# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Submission, polling and cancellation of e-Invoices for Sales Invoices.

Design notes
------------
* **One log row per submission attempt** (``E Invoice Submission Log``) — the audit trail the
  tax auditor will ask for: what we sent, what LHDN answered, and when.
* **Idempotent**: a Sales Invoice that has already been accepted with the same document hash is
  never submitted twice. LHDN also rejects duplicate invoice numbers, so before retrying after a
  *network* failure we search LHDN for the code number and adopt the document it already has.
* **Asynchronous by default**: submitting inside ``Sales Invoice.on_submit`` would put an HTTP
  round trip inside the user's transaction, so the hook enqueues a background job after commit.
  The queue is Frappe's own (Redis/RQ) — no extra infrastructure.
* **Status is pulled, not pushed**: MyInvois validates asynchronously (typically seconds), so a
  scheduled job polls every document that is still ``Submitted``.
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.utils import add_to_date, cint, now_datetime

from .client import ClientConfig, MyInvoisClient, MyInvoisError
from .mapping import build_invoice_data as _build_invoice_data
from .mapping import get_settings
from .models import InvoiceData
from .status import status_title
from .ubl import build_ubl_document, document_hash
from .validation import InvoiceValidationError, validate_invoice

SALES_INVOICE = "Sales Invoice"
LOG_DOCTYPE = "E Invoice Submission Log"

#: Log statuses that mean "LHDN already has this document".
ACCEPTED_STATUSES = frozenset({"Submitted", "Valid", "Invalid", "Cancelled", "Rejected"})
OPEN_STATUSES = frozenset({"Queued", "Retry"})

#: Give LHDN a minute before polling; keep polling an invalid-or-pending document for a day.
POLL_DELAY_MINUTES = 1
POLL_WINDOW_HOURS = 24
POLL_BATCH_SIZE = 50

INVOICE_STATUS_FIELD = "custom_malaysia_einvoice_status"


# --------------------------------------------------------------------------- configuration


def get_client(settings=None) -> MyInvoisClient:
	settings = settings or get_settings()
	client_id = (settings.get("client_id") or "").strip()
	client_secret = settings.get_password("client_secret", raise_exception=False) if client_id else ""
	if not client_id or not client_secret:
		frappe.throw(
			"Set the MyInvois Client ID and Client Secret in Malaysia E-Invoice Settings "
			"before submitting e-Invoices."
		)

	return MyInvoisClient(
		ClientConfig(
			client_id=client_id,
			client_secret=client_secret,
			sandbox=(settings.get("environment") or "Sandbox") != "Production",
			timeout=cint(settings.get("request_timeout")) or 30,
			max_retries=cint(settings.get("max_retries")) or 3,
			on_behalf_of=(settings.get("on_behalf_of") or "").strip(),
		)
	)


def is_enabled(settings=None) -> bool:
	settings = settings or get_settings()
	return bool(cint(settings.get("enabled")))


def should_submit(doc) -> bool:
	"""True when ``doc`` is a submitted Sales Invoice this app still has to e-Invoice."""
	if doc.doctype != SALES_INVOICE or cint(doc.get("docstatus")) != 1:
		return False
	if not is_enabled():
		return False
	if doc.get(INVOICE_STATUS_FIELD) in ("Submitted", "Valid", "Cancelled"):
		return False
	return True


# --------------------------------------------------------------------------- building


def build_payload(name: str) -> tuple[InvoiceData, bytes, list[str]]:
	"""Build and validate the UBL JSON for a Sales Invoice; raises on invalid data."""
	doc = frappe.get_doc(SALES_INVOICE, name)
	data, warnings = _build_invoice_data(doc)

	errors = validate_invoice(data)
	if errors:
		raise InvoiceValidationError(errors)

	return data, build_ubl_document(data), warnings


# --------------------------------------------------------------------------- submission


def submit_invoice(name: str) -> dict:
	"""Submit one Sales Invoice to MyInvois and record the outcome.

	Safe to call from a background job or from the desk; returns a summary dict rather than
	raising for LHDN-side failures (those are recorded on the log row).
	"""
	doc = frappe.get_doc(SALES_INVOICE, name)
	if cint(doc.get("docstatus")) != 1:
		frappe.throw(f"Sales Invoice {name} must be submitted before it can be e-Invoiced.")

	settings = get_settings()
	if not is_enabled(settings):
		return {"status": "Skipped", "message": "Malaysia e-Invoicing is disabled in Settings."}

	data, payload, warnings = build_payload(name)
	digest = document_hash(payload)

	# Idempotency is absolute: a document LHDN has already accepted with this hash is never
	# sent again, whoever asks and however often the queue retries.
	existing = _accepted_log(name, digest)
	if existing:
		return {
			"status": existing.status,
			"log": existing.name,
			"uuid": existing.get("uuid"),
			"message": f"Already submitted ({existing.status}).",
		}

	log = _create_log(doc, data, digest, payload, warnings)
	client = get_client(settings)

	try:
		response = client.submit_documents([(data.code_number, payload)])
	except MyInvoisError as error:
		return _handle_failure(log, error, settings)

	return _handle_success(log, response)


def enqueue_submission(doc=None, method=None) -> None:
	"""``Sales Invoice.on_submit`` hook: hand the work to the background queue after commit."""
	if doc is None:
		return
	settings = get_settings()
	if not is_enabled(settings) or not cint(settings.get("auto_submit")):
		return
	if not should_submit(doc):
		return
	queue_name = "short" if cint(settings.get("submit_inline")) else "long"
	frappe.enqueue(
		"malaysia_einvoice.services.submission.submit_invoice",
		queue=queue_name,
		timeout=600,
		enqueue_after_commit=True,
		name=doc.name,
	)


def on_sales_invoice_cancel(doc, method=None) -> None:
	"""``Sales Invoice.on_cancel`` hook: mirror the cancellation to MyInvois when configured.

	Failures never block the ERPNext cancellation — the invoice is already cancelled locally and
	the user gets a message telling them to cancel manually in the MyInvois portal.
	"""
	settings = get_settings()
	if not is_enabled(settings) or not cint(settings.get("cancel_on_sales_invoice_cancel")):
		return

	log = latest_log(doc.name)
	if not log or not log.get("uuid") or log.status == "Cancelled":
		return

	try:
		cancel_invoice(doc.name, f"ERPNext Sales Invoice {doc.name} was cancelled")
	except MyInvoisError as error:
		frappe.log_error(
			title=f"Could not cancel MyInvois document for {doc.name}",
			message=error.describe(),
		)
		frappe.msgprint(
			f"The Sales Invoice was cancelled in ERPNext but MyInvois still holds the e-Invoice: "
			f"{error.describe()}. Cancel it in the MyInvois portal.",
			title="MyInvois cancellation failed",
			indicator="orange",
		)


def _accepted_log(sales_invoice: str, digest: str):
	logs = frappe.get_all(
		LOG_DOCTYPE,
		filters={
			"sales_invoice": sales_invoice,
			"document_hash": digest,
			"status": ("in", list(ACCEPTED_STATUSES)),
		},
		fields=["name", "status", "uuid"],
		order_by="creation desc",
		limit=1,
	)
	if not logs:
		return None
	return frappe._dict(logs[0])


def _create_log(doc, data: InvoiceData, digest: str, payload: bytes, warnings: list[str]):
	log = frappe.get_doc(
		{
			"doctype": LOG_DOCTYPE,
			"sales_invoice": doc.name,
			"company": doc.company,
			"customer": doc.customer,
			"status": "Queued",
			"invoice_type": data.invoice_type,
			"code_number": data.code_number,
			"document_hash": digest,
			"attempts": 1,
			"request": payload.decode("utf-8"),
			"warnings": "\n".join(warnings) or None,
			"submitted_on": now_datetime(),
		}
	)
	log.insert(ignore_permissions=True)
	log.db_set("status", "Submitting", update_modified=False)
	_set_invoice_status(doc.name, "Queued")
	return log


def _handle_success(log, response: dict) -> dict:
	accepted = response.get("acceptedDocuments") or []
	rejected = response.get("rejectedDocuments") or []
	log.submission_uid = response.get("submissionUid") or response.get("submissionUUID") or ""
	log.response = json.dumps(response, indent=1)[:100000]
	log.status = "Submitted"

	if accepted:
		first = accepted[0]
		log.uuid = first.get("uuid") or ""
		log.long_id = first.get("longId") or ""
	elif rejected:
		log.status = "Rejected"
		log.error = json.dumps(rejected, indent=1)[:100000]

	log.save(ignore_permissions=True)

	if log.status == "Rejected":
		_set_invoice_status(log.sales_invoice, "Rejected", submission_uid=log.submission_uid)
		frappe.log_error(
			title=f"MyInvois rejected {log.code_number}",
			message=log.error,
		)
	else:
		_set_invoice_status(log.sales_invoice, "Submitted", uuid=log.uuid, submission_uid=log.submission_uid)

	return {
		"status": log.status,
		"log": log.name,
		"uuid": log.get("uuid"),
		"submission_uid": log.get("submission_uid"),
		"message": "Submitted to MyInvois; validation is asynchronous.",
	}


def _handle_failure(log, error: MyInvoisError, settings) -> dict:
	log.attempts = cint(log.get("attempts")) + 1
	log.error = error.describe()[:100000]
	log.response = json.dumps({"error": error.describe()}, indent=1)[:100000]
	log.save(ignore_permissions=True)

	# A lost response is worse than an error: LHDN may already hold the document. Look for it
	# before retrying so we never create a duplicate invoice number.
	if error.code == "network":
		adopted = _adopt_existing_document(log)
		if adopted:
			return adopted

	max_attempts = cint(settings.get("max_retries")) or 3
	if error.is_retryable and log.attempts < max_attempts:
		log.db_set("status", "Retry", update_modified=False)
		_set_invoice_status(log.sales_invoice, "Queued")
		frappe.enqueue(
			"malaysia_einvoice.services.submission.submit_invoice",
			queue="long",
			timeout=600,
			enqueue_after_commit=True,
			name=log.sales_invoice,
		)
		return {
			"status": "Retry",
			"log": log.name,
			"message": f"{error.describe()}. Retrying in the background.",
		}

	log.db_set("status", "Error", update_modified=False)
	_set_invoice_status(log.sales_invoice, "Error")
	frappe.log_error(title=f"MyInvois submission failed for {log.code_number}", message=log.error)
	return {"status": "Error", "log": log.name, "message": error.describe()}


def _adopt_existing_document(log) -> dict | None:
	"""After a timeout, check whether LHDN already received this invoice."""
	try:
		client = get_client()
		result = client.search_documents(invoice_code_number=log.code_number)
	except MyInvoisError:
		return None

	documents = result.get("result") or result.get("documents") or []
	for document in documents:
		uuid = document.get("uuid") or ""
		code = document.get("invoiceCodeNumber") or document.get("codeNumber") or log.code_number
		if uuid and code == log.code_number:
			log.uuid = uuid
			log.status = document.get("status") or "Submitted"
			log.response = json.dumps(result, indent=1)[:100000]
			log.save(ignore_permissions=True)
			_set_invoice_status(log.sales_invoice, status_title(log.status), uuid=uuid)
			return {
				"status": log.status,
				"log": log.name,
				"uuid": uuid,
				"message": "Recovered an already-accepted document from MyInvois.",
			}
	return None


# --------------------------------------------------------------------------- polling


def refresh_log_status(log_name: str, client: MyInvoisClient | None = None) -> dict:
	"""Pull the current status of one submission from MyInvois."""
	log = frappe.get_doc(LOG_DOCTYPE, log_name)
	client = client or get_client()

	if not log.get("uuid") and log.get("submission_uid"):
		_refresh_from_submission(log, client)
	elif log.get("uuid"):
		details = client.get_document_details(log.uuid)
		_apply_details(log, details)
	else:
		return {"status": log.status, "message": "Nothing to poll yet."}

	return {"status": log.status, "log": log.name, "uuid": log.get("uuid")}


def _refresh_from_submission(log, client: MyInvoisClient) -> None:
	response = client.get_submission(log.submission_uid)
	documents = response.get("documentSummary") or response.get("documents") or []
	for document in documents:
		uuid = document.get("uuid")
		if uuid:
			log.uuid = uuid
			log.status = document.get("status") or "Submitted"
			log.save(ignore_permissions=True)
			_set_invoice_status(
				log.sales_invoice, status_title(log.status), uuid=uuid, submission_uid=log.submission_uid
			)
			return
	log.last_checked_on = now_datetime()
	log.save(ignore_permissions=True)


def _apply_details(log, details: dict) -> None:
	status = status_title(details.get("status"))
	log.status = status
	log.long_id = details.get("longId") or log.get("long_id")
	log.last_checked_on = now_datetime()
	log.response = json.dumps(details, indent=1)[:100000]

	if status == "Invalid":
		log.error = json.dumps(details.get("validationResults") or details, indent=1)[:100000]
		frappe.log_error(
			title=f"MyInvois invalidated {log.code_number}",
			message=log.error,
		)

	log.save(ignore_permissions=True)
	_set_invoice_status(log.sales_invoice, status, uuid=log.get("uuid"))


def poll_pending_documents(limit: int = POLL_BATCH_SIZE) -> dict:
	"""Scheduler job: poll submissions that MyInvois has not finalised yet."""
	if not is_enabled():
		return {"polled": 0}

	cutoff = add_to_date(now_datetime(), minutes=-POLL_DELAY_MINUTES)
	window_start = add_to_date(now_datetime(), hours=-POLL_WINDOW_HOURS)

	logs = frappe.get_all(
		LOG_DOCTYPE,
		filters={
			"status": ("in", ["Submitted", "Submitting"]),
			"submitted_on": ("between", [window_start, cutoff]),
		},
		fields=["name"],
		order_by="submitted_on asc",
		limit=limit,
	)

	if not logs:
		return {"polled": 0}

	client = get_client()
	polled = 0
	for row in logs:
		try:
			refresh_log_status(row.name, client=client)
			polled += 1
		except MyInvoisError as error:
			frappe.log_error(
				title=f"MyInvois status poll failed for {row.name}",
				message=error.describe(),
			)
	return {"polled": polled}


def retry_pending() -> dict:
	"""Scheduler job: re-queue submissions that were left in ``Queued``/``Retry``."""
	if not is_enabled():
		return {"queued": 0}

	cutoff = add_to_date(now_datetime(), minutes=-5)
	logs = frappe.get_all(
		LOG_DOCTYPE,
		filters={
			"status": ("in", list(OPEN_STATUSES)),
			"modified": ("<", cutoff),
		},
		fields=["sales_invoice"],
		limit=POLL_BATCH_SIZE,
	)
	for row in logs:
		frappe.enqueue(
			"malaysia_einvoice.services.submission.submit_invoice",
			queue="long",
			timeout=600,
			name=row.sales_invoice,
		)
	return {"queued": len(logs)}


# --------------------------------------------------------------------------- cancellation


def cancel_invoice(name: str, reason: str, client: MyInvoisClient | None = None) -> dict:
	"""Cancel the validated e-Invoice linked to a Sales Invoice (LHDN's 72-hour window)."""
	log = latest_log(name)
	if not log:
		frappe.throw(f"No e-Invoice submission found for {name}.")
	if not log.get("uuid"):
		frappe.throw(
			f"{name} has no MyInvois document UUID yet — it cannot be cancelled until LHDN has "
			"validated it."
		)
	if log.status == "Cancelled":
		return {"status": "Cancelled", "log": log.name, "message": "Already cancelled."}

	client = client or get_client()
	response = client.cancel_document(log.uuid, reason)

	log.status = status_title(response.get("status") or "Cancelled")
	log.cancellation_reason = reason
	log.response = json.dumps(response, indent=1)[:100000]
	log.save(ignore_permissions=True)
	_set_invoice_status(name, log.status, uuid=log.get("uuid"))
	return {"status": log.status, "log": log.name, "message": "Cancelled at MyInvois."}


def latest_log(sales_invoice: str):
	logs = frappe.get_all(
		LOG_DOCTYPE,
		filters={"sales_invoice": sales_invoice},
		fields=["name"],
		order_by="creation desc",
		limit=1,
	)
	return frappe.get_doc(LOG_DOCTYPE, logs[0].name) if logs else None


# --------------------------------------------------------------------------- invoice flags


def _set_invoice_status(
	name: str,
	status: str,
	uuid: str | None = None,
	submission_uid: str | None = None,
) -> None:
	values: dict[str, Any] = {INVOICE_STATUS_FIELD: status}
	if uuid:
		values["custom_malaysia_einvoice_uuid"] = uuid
	if submission_uid:
		values["custom_malaysia_submission_uid"] = submission_uid
	frappe.db.set_value(SALES_INVOICE, name, values, update_modified=False)
