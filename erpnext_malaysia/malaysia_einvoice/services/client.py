# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Minimal MyInvois REST client (stdlib only).

Implements the parts of the LHDN e-Invoicing API this app needs:

===========================  ====================================================
OAuth 2.0 token              ``POST {identity}/connect/token``
Submit documents             ``POST {api}/api/v1.0/documentsubmissions/``
Submission status            ``GET  {api}/api/v1.0/documentsubmissions/{uid}``
Search documents             ``GET  {api}/api/v1.0/documents/search``
Document details             ``GET  {api}/api/v1.0/documents/{uuid}/details``
Cancel / reject              ``PUT  {api}/api/v1.0/documents/state/{uuid}/state``
Validate TIN                 ``GET  {api}/api/v1.0/taxpayer/validate/{tin}``
Search TIN                   ``GET  {api}/api/v1.0/taxpayer/search/tin``
Document types               ``GET  {api}/api/v1.0/documenttypes/``
===========================  ====================================================

No third-party dependency (no ``requests``, no LHDN SDK): the app stays installable on a
bare Frappe site. Frappe-free on purpose, so the request/response handling is unit testable
outside a bench — see ``tests/test_client.py``.

Docs: https://sdk.myinvois.hasil.gov.my/einvoicingapi/
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from threading import Lock
from typing import Any

from .ubl import build_submission_payload

logger = logging.getLogger(__name__)

SANDBOX_API = "https://preprod-api.myinvois.hasil.gov.my"
PRODUCTION_API = "https://api.myinvois.hasil.gov.my"
SANDBOX_IDENTITY = "https://preprod-identity.myinvois.hasil.gov.my"
PRODUCTION_IDENTITY = "https://identity.myinvois.hasil.gov.my"

TOKEN_PATH = "/connect/token"
SUBMISSIONS_PATH = "/api/v1.0/documentsubmissions/"
DOCUMENT_DETAILS_PATH = "/api/v1.0/documents/{uuid}/details"
DOCUMENT_RAW_PATH = "/api/v1.0/documents/{uuid}/raw"
DOCUMENT_STATE_PATH = "/api/v1.0/documents/state/{uuid}/state"
DOCUMENT_SEARCH_PATH = "/api/v1.0/documents/search"
VALIDATE_TIN_PATH = "/api/v1.0/taxpayer/validate/{tin}"
SEARCH_TIN_PATH = "/api/v1.0/taxpayer/search/tin"
DOCUMENT_TYPES_PATH = "/api/v1.0/documenttypes/"

#: LHDN limits the cancel/reject reason to 300 characters.
MAX_REASON_LENGTH = 300

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
CANNOT_VALIDATE_UUID = "The document UUID cannot be validated"


@dataclass(frozen=True)
class ClientConfig:
	"""Everything the client needs to talk to MyInvois."""

	client_id: str
	client_secret: str
	sandbox: bool = True
	timeout: int = 30
	max_retries: int = 3
	#: Only for intermediary (on-behalf-of) systems: the taxpayer TIN to act for.
	on_behalf_of: str = ""

	@property
	def api_base(self) -> str:
		return SANDBOX_API if self.sandbox else PRODUCTION_API

	@property
	def identity_base(self) -> str:
		return SANDBOX_IDENTITY if self.sandbox else PRODUCTION_IDENTITY

	def cache_key(self) -> tuple[str, str, str]:
		return (self.identity_base, self.client_id, self.on_behalf_of)


class MyInvoisError(Exception):
	"""Any failure talking to MyInvois, with the LHDN error payload attached."""

	def __init__(
		self,
		message: str,
		*,
		status_code: int | None = None,
		code: str = "",
		details: list[Any] | None = None,
	):
		self.status_code = status_code
		self.code = code
		self.details = details or []
		super().__init__(message)

	@property
	def is_retryable(self) -> bool:
		return self.status_code in RETRYABLE_STATUS or (self.status_code is None and self.code == "network")

	def describe(self) -> str:
		"""One-paragraph message suitable for an Error Log / submission log row."""
		parts = [str(self)]
		if self.status_code:
			parts.append(f"HTTP {self.status_code}")
		if self.code:
			parts.append(f"code {self.code}")
		for detail in self.details:
			if isinstance(detail, dict):
				property_path = detail.get("propertyPath") or detail.get("target") or ""
				detail_message = detail.get("message") or detail.get("error") or ""
				if property_path or detail_message:
					parts.append(f"{property_path}: {detail_message}".strip(": "))
			elif detail:
				parts.append(str(detail))
		return " | ".join(part for part in parts if part)


class MyInvoisAuthError(MyInvoisError):
	"""Credentials rejected (bad client id/secret, expired certificate, disabled taxpayer)."""


# --------------------------------------------------------------------------- token cache

_TOKENS: dict[tuple[str, str, str], tuple[str, float]] = {}
_TOKENS_LOCK = Lock()

#: Refresh a little before LHDN's expiry so a slow request never races the clock.
TOKEN_SAFETY_MARGIN = 60


def clear_token_cache() -> None:
	"""Drop cached access tokens (called when settings change)."""
	with _TOKENS_LOCK:
		_TOKENS.clear()


def _cached_token(config: ClientConfig) -> str | None:
	with _TOKENS_LOCK:
		cached = _TOKENS.get(config.cache_key())
	if not cached:
		return None
	token, expires_at = cached
	if time.time() >= expires_at:
		with _TOKENS_LOCK:
			_TOKENS.pop(config.cache_key(), None)
		return None
	return token


def _store_token(config: ClientConfig, token: str, expires_in: int) -> None:
	lifetime = max(int(expires_in) - TOKEN_SAFETY_MARGIN, 30)
	with _TOKENS_LOCK:
		_TOKENS[config.cache_key()] = (token, time.time() + lifetime)


# --------------------------------------------------------------------------- client


class MyInvoisClient:
	"""Thin, explicit wrapper over the MyInvois REST API."""

	def __init__(self, config: ClientConfig, *, sleep=time.sleep):
		if not config.client_id or not config.client_secret:
			raise MyInvoisAuthError("MyInvois Client ID and Client Secret are required")
		self.config = config
		self._sleep = sleep

	# ------------------------------------------------------------------ auth

	def get_access_token(self, *, force: bool = False) -> str:
		if not force:
			cached = _cached_token(self.config)
			if cached:
				return cached

		payload = {
			"grant_type": "client_credentials",
			"client_id": self.config.client_id,
			"client_secret": self.config.client_secret,
			"scope": "InvoicingAPI",
		}
		if self.config.on_behalf_of:
			payload["onbehalfof"] = self.config.on_behalf_of

		body = urllib.parse.urlencode(payload).encode("utf-8")
		status, data, _headers = self._raw_request(
			"POST",
			self.config.identity_base + TOKEN_PATH,
			body=body,
			content_type="application/x-www-form-urlencoded",
			auth=False,
		)

		if status >= 400 or not isinstance(data, dict) or not data.get("access_token"):
			raise MyInvoisAuthError(
				_error_message(data, "MyInvois rejected the credentials"),
				status_code=status,
				code=_error_code(data),
				details=_error_details(data),
			)

		_store_token(self.config, data["access_token"], data.get("expires_in") or 3600)
		return data["access_token"]

	# ------------------------------------------------------------------ documents

	def submit_documents(self, documents: list[tuple[str, bytes]], *, document_format: str = "JSON") -> dict:
		"""Submit one or more signed documents.

		``documents`` is a list of ``(code_number, payload_bytes)``. Returns LHDN's JSON:
		``submissionUid``, ``acceptedDocuments`` and ``rejectedDocuments``.
		"""
		if not documents:
			raise ValueError("Nothing to submit")
		payload = build_submission_payload(documents, document_format=document_format)
		return self._request("POST", SUBMISSIONS_PATH, json_body=payload)

	def get_submission(self, submission_uid: str, *, page_no: int = 1, page_size: int = 100) -> dict:
		if not submission_uid:
			raise ValueError(CANNOT_VALIDATE_UUID)
		return self._request(
			"GET",
			SUBMISSIONS_PATH + urllib.parse.quote(submission_uid),
			params={"pageNo": page_no, "pageSize": page_size},
		)

	def get_document_details(self, uuid: str) -> dict:
		if not uuid:
			raise ValueError(CANNOT_VALIDATE_UUID)
		return self._request("GET", DOCUMENT_DETAILS_PATH.format(uuid=urllib.parse.quote(uuid)))

	def search_documents(
		self, *, invoice_code_number: str = "", page_no: int = 1, page_size: int = 20
	) -> dict:
		"""Find documents by invoice number — used to recover from a lost submit response."""
		params: dict[str, Any] = {"pageNo": page_no, "pageSize": page_size}
		if invoice_code_number:
			params["invoiceCodeNumber"] = invoice_code_number
		return self._request("GET", DOCUMENT_SEARCH_PATH, params=params)

	def get_document_raw(self, uuid: str) -> dict:
		if not uuid:
			raise ValueError(CANNOT_VALIDATE_UUID)
		return self._request("GET", DOCUMENT_RAW_PATH.format(uuid=urllib.parse.quote(uuid)))

	def cancel_document(self, uuid: str, reason: str) -> dict:
		"""Cancel a validated document (LHDN allows this for 72 hours after validation)."""
		return self._update_state(uuid, "cancelled", reason)

	def reject_document(self, uuid: str, reason: str) -> dict:
		"""Reject a document issued *to* you — the supplier still has to cancel it."""
		return self._update_state(uuid, "rejected", reason)

	def _update_state(self, uuid: str, status: str, reason: str) -> dict:
		if not uuid:
			raise ValueError(CANNOT_VALIDATE_UUID)
		reason = (reason or "").strip()
		if not reason:
			raise ValueError("LHDN requires a reason when changing a document's state")
		if len(reason) > MAX_REASON_LENGTH:
			raise ValueError(f"The reason must be at most {MAX_REASON_LENGTH} characters")
		return self._request(
			"PUT",
			DOCUMENT_STATE_PATH.format(uuid=urllib.parse.quote(uuid)),
			json_body={"status": status, "reason": reason},
		)

	# ------------------------------------------------------------------ taxpayers

	def validate_tin(self, tin: str, id_type: str, id_value: str) -> bool:
		"""Return ``True`` when LHDN knows this TIN/registration combination."""
		if not tin:
			raise ValueError("A TIN is required")
		try:
			self._request(
				"GET",
				VALIDATE_TIN_PATH.format(tin=urllib.parse.quote(tin)),
				params={"idType": id_type, "idValue": id_value},
			)
		except MyInvoisError as error:
			if error.status_code == 404:
				return False
			raise
		return True

	def search_tin(self, id_type: str, id_value: str, taxpayer_name: str = "") -> dict:
		params = {"idType": id_type, "idValue": id_value}
		if taxpayer_name:
			params["taxpayerName"] = taxpayer_name
		return self._request("GET", SEARCH_TIN_PATH, params=params)

	def get_document_types(self) -> dict:
		return self._request("GET", DOCUMENT_TYPES_PATH)

	# ------------------------------------------------------------------ transport

	def _request(
		self,
		method: str,
		path: str,
		*,
		json_body: dict | None = None,
		params: dict | None = None,
	) -> dict:
		"""Authenticated call with one transparent token refresh on 401."""
		token = self.get_access_token()
		body = json.dumps(json_body).encode("utf-8") if json_body is not None else None

		url = self.config.api_base + path
		if params:
			url = f"{url}?{urllib.parse.urlencode(params)}"

		try:
			status, data, _headers = self._raw_request(
				method,
				url,
				body=body,
				content_type="application/json" if body else None,
				auth=True,
				token=token,
			)
		except MyInvoisAuthError as error:
			# LHDN tokens can be revoked before their stated expiry (certificate rotation,
			# taxpayer suspension). Refresh once, then let a second 401 through.
			if error.status_code != 401:
				raise
			logger.info("MyInvois rejected the access token, refreshing once")
			status, data, _headers = self._raw_request(
				method,
				url,
				body=body,
				content_type="application/json" if body else None,
				auth=True,
				token=self.get_access_token(force=True),
				retry=False,
			)

		if status >= 400:
			raise _error_from_response(status, data, method, path)

		return data if isinstance(data, dict) else {"data": data}

	def _raw_request(
		self,
		method: str,
		url: str,
		*,
		body: bytes | None = None,
		content_type: str | None = None,
		auth: bool = True,
		token: str | None = None,
		retry: bool = True,
	) -> tuple[int, Any, dict]:
		"""Perform one HTTP call, retrying throttling and gateway errors."""
		attempts = max(1, self.config.max_retries) if retry else 1
		last_error: MyInvoisError | None = None

		for attempt in range(1, attempts + 1):
			headers = {"Accept": "application/json", "User-Agent": "erpnext-malaysia/myinvois"}
			if content_type:
				headers["Content-Type"] = content_type
			if auth and token:
				headers["Authorization"] = f"Bearer {token}"

			request = urllib.request.Request(url, data=body, headers=headers, method=method)
			try:
				with urllib.request.urlopen(request, timeout=self.config.timeout) as response:
					return response.status, _decode(response.read()), dict(response.headers)
			except urllib.error.HTTPError as error:
				payload = _decode(error.read())
				status = error.code
				last_error = _error_from_response(status, payload, method, url)
				if status in RETRYABLE_STATUS and attempt < attempts:
					self._sleep(_retry_delay(attempt, error.headers))
					continue
				raise last_error from None
			except urllib.error.URLError as error:
				last_error = MyInvoisError(f"Could not reach MyInvois: {error.reason}", code="network")
				if attempt < attempts:
					self._sleep(_retry_delay(attempt, None))
					continue
				raise last_error from None
			except TimeoutError:
				last_error = MyInvoisError("Timed out talking to MyInvois", code="network")
				if attempt < attempts:
					self._sleep(_retry_delay(attempt, None))
					continue
				raise last_error from None

		raise last_error or MyInvoisError("MyInvois request failed")


# --------------------------------------------------------------------------- helpers


def _decode(raw: bytes) -> Any:
	if not raw:
		return {}
	try:
		return json.loads(raw.decode("utf-8"))
	except (UnicodeDecodeError, json.JSONDecodeError):
		return {"raw": raw.decode("utf-8", "replace")}


def _retry_delay(attempt: int, headers) -> float:
	"""Honour ``Retry-After`` when LHDN sends one, otherwise back off exponentially."""
	if headers is not None:
		retry_after = headers.get("Retry-After") if hasattr(headers, "get") else None
		if retry_after:
			try:
				return min(float(retry_after), 60.0)
			except (TypeError, ValueError):
				pass
	return min(2.0 ** (attempt - 1), 30.0)


def _error_code(payload: Any) -> str:
	if isinstance(payload, dict):
		error = payload.get("error")
		if isinstance(error, dict):
			return str(error.get("code") or "")
		if isinstance(error, str):
			return error
		return str(payload.get("errorCode") or payload.get("code") or "")
	return ""


def _error_details(payload: Any) -> list[Any]:
	if isinstance(payload, dict):
		error = payload.get("error")
		if isinstance(error, dict):
			details = error.get("details")
			if isinstance(details, list):
				return details
			message = error.get("message")
			return [message] if message else []
		if isinstance(error, str):
			return [error]
	return []


def _error_message(payload: Any, fallback: str) -> str:
	"""Best-effort human message from an LHDN error payload."""
	if isinstance(payload, dict):
		error = payload.get("error")
		if isinstance(error, dict) and error.get("message"):
			return str(error["message"])
		if isinstance(error, list) and error:
			first = error[0]
			if isinstance(first, dict) and first.get("message"):
				return str(first["message"])
		for key in ("message", "error_description", "error", "raw"):
			if payload.get(key):
				return str(payload[key])
	return fallback


def _error_from_response(status: int, payload: Any, method: str, url: str) -> MyInvoisError:
	message = _error_message(payload, f"MyInvois returned HTTP {status}")
	code = _error_code(payload)
	details = _error_details(payload)
	endpoint = url.split("?")[0]
	if status in (401, 403):
		return MyInvoisAuthError(
			f"{message} ({method} {endpoint})", status_code=status, code=code, details=details
		)
	return MyInvoisError(f"{message} ({method} {endpoint})", status_code=status, code=code, details=details)
