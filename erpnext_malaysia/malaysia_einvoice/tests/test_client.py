# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Tests for the MyInvois REST client.

``urllib.request.urlopen`` is replaced with a scripted fake, so the whole client — OAuth,
submit, status, cancel, TIN validation, retries — is exercised without network access.
"""

from __future__ import annotations

import hashlib
import io
import json
import unittest
import urllib.error
import urllib.parse
from unittest import mock

from malaysia_einvoice.services.client import (
	MAX_REASON_LENGTH,
	ClientConfig,
	MyInvoisAuthError,
	MyInvoisClient,
	MyInvoisError,
	clear_token_cache,
)
from malaysia_einvoice.services.ubl import build_ubl_document
from malaysia_einvoice.tests.test_services import invoice

API = "https://preprod-api.myinvois.hasil.gov.my"
IDENTITY = "https://preprod-identity.myinvois.hasil.gov.my"


class FakeResponse:
	def __init__(self, status: int, payload, headers: dict | None = None):
		self.status = status
		self._body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
		self.headers = headers or {}

	def read(self) -> bytes:
		return self._body

	def __enter__(self):
		return self

	def __exit__(self, *exc_info):
		return False


class FakeHTTPError(urllib.error.HTTPError):
	def __init__(self, status: int, payload, headers: dict | None = None):
		body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
		super().__init__("https://example.invalid", status, "error", headers or {}, io.BytesIO(body))


class ScriptedTransport:
	"""Plays back scripted responses and records every request it was handed."""

	def __init__(self, *steps):
		self.steps = list(steps)
		self.requests: list[urllib.request.Request] = []

	def __call__(self, request, timeout=None):
		self.requests.append(request)
		if not self.steps:
			raise AssertionError("unexpected extra request")
		step = self.steps.pop(0)
		if isinstance(step, Exception):
			raise step
		if isinstance(step, FakeHTTPError):
			raise step
		return step

	def bodies(self) -> list[dict]:
		return [json.loads(request.data) for request in self.requests if request.data]

	def form(self) -> dict:
		body = urllib.parse.parse_qs(self.requests[0].data.decode("utf-8"))
		return {key: values[0] for key, values in body.items()}

	def headers(self, index: int) -> dict:
		return {key.lower(): value for key, value in self.requests[index].headers.items()}


def token_response(token: str = "token-1", expires_in: int = 3600) -> FakeResponse:
	return FakeResponse(200, {"access_token": token, "expires_in": expires_in, "token_type": "Bearer"})


def submission_response() -> FakeResponse:
	return FakeResponse(
		202,
		{
			"submissionUid": "TZRKK8MFZCPSTW9XCYWBMKME10",
			"acceptedDocuments": [{"uuid": "F9D425P6DS7D8IU", "invoiceCodeNumber": "INV-2026-0001"}],
			"rejectedDocuments": [],
		},
	)


class ClientTest(unittest.TestCase):
	def setUp(self):
		clear_token_cache()
		self.sleeps: list[float] = []
		self.config = ClientConfig(
			client_id="client-id",
			client_secret="client-secret",
			sandbox=True,
			max_retries=3,
		)

	def build(self, *steps) -> tuple[MyInvoisClient, ScriptedTransport]:
		transport = ScriptedTransport(*steps)
		client = MyInvoisClient(self.config, sleep=self.sleeps.append)
		patcher = mock.patch("urllib.request.urlopen", transport)
		patcher.start()
		self.addCleanup(patcher.stop)
		return client, transport


class TestAuthentication(ClientTest):
	def test_token_request_shape(self):
		client, transport = self.build(token_response())
		self.assertEqual(client.get_access_token(), "token-1")

		request = transport.requests[0]
		self.assertEqual(request.get_method(), "POST")
		self.assertEqual(request.full_url, f"{IDENTITY}/connect/token")
		self.assertEqual(transport.form()["grant_type"], "client_credentials")
		self.assertEqual(transport.form()["client_id"], "client-id")
		self.assertEqual(transport.form()["client_secret"], "client-secret")
		self.assertEqual(transport.form()["scope"], "InvoicingAPI")
		self.assertNotIn("onbehalfof", transport.form())
		self.assertEqual(transport.headers(0)["content-type"], "application/x-www-form-urlencoded")

	def test_token_is_cached(self):
		client, transport = self.build(token_response(), token_response("token-2"))
		self.assertEqual(client.get_access_token(), "token-1")
		self.assertEqual(client.get_access_token(), "token-1")
		self.assertEqual(len(transport.requests), 1)

	def test_force_refresh_obtains_a_new_token(self):
		client, transport = self.build(token_response(), token_response("token-2"))
		client.get_access_token()
		self.assertEqual(client.get_access_token(force=True), "token-2")

	def test_intermediary_passes_on_behalf_of(self):
		self.config = ClientConfig(
			client_id="client-id", client_secret="client-secret", on_behalf_of="C2584563200"
		)
		client, transport = self.build(token_response())
		client.get_access_token()
		self.assertEqual(transport.form()["onbehalfof"], "C2584563200")

	def test_missing_credentials_fail_fast(self):
		with self.assertRaises(MyInvoisAuthError):
			MyInvoisClient(ClientConfig(client_id="", client_secret=""))

	def test_rejected_credentials(self):
		payload = {"error": "invalid_client", "error_description": "Invalid client or client secret"}
		client, _ = self.build(FakeHTTPError(401, payload))
		with self.assertRaises(MyInvoisAuthError) as caught:
			client.get_access_token()
		self.assertIn("Invalid client or client secret", str(caught.exception))
		self.assertEqual(caught.exception.status_code, 401)

	def test_missing_access_token_in_a_200_body(self):
		client, _ = self.build(FakeResponse(200, {"token_type": "Bearer"}))
		with self.assertRaises(MyInvoisAuthError):
			client.get_access_token()


class TestSubmit(ClientTest):
	def test_submit_documents(self):
		payload = build_ubl_document(invoice())
		client, transport = self.build(token_response(), submission_response())

		response = client.submit_documents([("INV-2026-0001", payload)])

		self.assertEqual(response["submissionUid"], "TZRKK8MFZCPSTW9XCYWBMKME10")
		self.assertEqual(response["acceptedDocuments"][0]["uuid"], "F9D425P6DS7D8IU")

		submit = transport.requests[1]
		self.assertEqual(submit.get_method(), "POST")
		self.assertEqual(submit.full_url, f"{API}/api/v1.0/documentsubmissions/")
		self.assertEqual(transport.headers(1)["authorization"], "Bearer token-1")
		self.assertEqual(transport.headers(1)["content-type"], "application/json")

		document = json.loads(submit.data)["documents"][0]
		self.assertEqual(document["codeNumber"], "INV-2026-0001")
		self.assertEqual(document["format"], "JSON")
		self.assertEqual(document["documentHash"], hashlib.sha256(payload).hexdigest())

	def test_submit_multiple_documents(self):
		first = build_ubl_document(invoice())
		second = build_ubl_document(invoice(code_number="INV-2026-0002"))
		client, transport = self.build(token_response(), submission_response())
		client.submit_documents([("INV-2026-0001", first), ("INV-2026-0002", second)])
		documents = json.loads(transport.requests[1].data)["documents"]
		self.assertEqual([d["codeNumber"] for d in documents], ["INV-2026-0001", "INV-2026-0002"])
		self.assertNotEqual(documents[0]["document"], documents[1]["document"])

	def test_submit_nothing_is_rejected(self):
		client, _ = self.build()
		with self.assertRaises(ValueError):
			client.submit_documents([])

	def test_401_refreshes_the_token_once(self):
		client, transport = self.build(
			token_response("stale"),
			FakeHTTPError(401, {"error": {"code": "Unauthorized", "message": "Token expired"}}),
			token_response("fresh"),
			submission_response(),
		)
		response = client.submit_documents([("INV-2026-0001", b"{}")])
		self.assertIn("acceptedDocuments", response)
		self.assertEqual(len(transport.requests), 4)
		self.assertEqual(transport.headers(1)["authorization"], "Bearer stale")
		self.assertEqual(transport.headers(3)["authorization"], "Bearer fresh")

	def test_429_is_retried_with_backoff(self):
		client, transport = self.build(
			token_response(),
			FakeHTTPError(429, {"error": {"message": "Too many requests"}}, {"Retry-After": "7"}),
			submission_response(),
		)
		response = client.submit_documents([("INV-2026-0001", b"{}")])
		self.assertIn("submissionUid", response)
		self.assertEqual(self.sleeps, [7.0])

	def test_5xx_is_retried_then_succeeds(self):
		client, transport = self.build(
			token_response(),
			FakeHTTPError(503, {"error": {"message": "Service unavailable"}}),
			FakeHTTPError(502, {}),
			submission_response(),
		)
		client.submit_documents([("INV-2026-0001", b"{}")])
		self.assertEqual(len(transport.requests), 4)
		self.assertEqual(self.sleeps, [1.0, 2.0])

	def test_retries_are_bounded(self):
		client, _ = self.build(
			token_response(),
			FakeHTTPError(503, {}),
			FakeHTTPError(503, {}),
			FakeHTTPError(503, {}),
		)
		with self.assertRaises(MyInvoisError) as caught:
			client.submit_documents([("INV-2026-0001", b"{}")])
		self.assertEqual(caught.exception.status_code, 503)
		self.assertEqual(len(self.sleeps), 2)

	def test_network_error_is_retried_and_marked_retryable(self):
		client, _ = self.build(
			token_response(),
			urllib.error.URLError("connection reset"),
			urllib.error.URLError("connection reset"),
			urllib.error.URLError("connection reset"),
		)
		with self.assertRaises(MyInvoisError) as caught:
			client.submit_documents([("INV-2026-0001", b"{}")])
		self.assertIn("Could not reach MyInvois", str(caught.exception))
		self.assertTrue(caught.exception.is_retryable)

	def test_client_error_is_not_retried(self):
		client, transport = self.build(
			token_response(),
			FakeHTTPError(
				400,
				{
					"error": {
						"code": "ValidationError",
						"message": "Document validation failed",
						"details": [
							{"propertyPath": "Invoice.TaxTotal", "message": "Tax amount mismatch"},
						],
					}
				},
			),
		)
		with self.assertRaises(MyInvoisError) as caught:
			client.submit_documents([("INV-2026-0001", b"{}")])
		error = caught.exception
		self.assertEqual(error.status_code, 400)
		self.assertEqual(error.code, "ValidationError")
		self.assertEqual(len(transport.requests), 2)
		description = error.describe()
		self.assertIn("HTTP 400", description)
		self.assertIn("Invoice.TaxTotal: Tax amount mismatch", description)


class TestStatusAndCancel(ClientTest):
	def test_get_submission_paginates(self):
		client, transport = self.build(token_response(), FakeResponse(200, {"submissionUid": "abc"}))
		client.get_submission("abc", page_no=2, page_size=50)
		self.assertIn("pageNo=2", transport.requests[1].full_url)
		self.assertIn("pageSize=50", transport.requests[1].full_url)

	def test_document_details(self):
		client, transport = self.build(
			token_response(),
			FakeResponse(200, {"uuid": "F9D425P6DS7D8IU", "status": "Valid"}),
		)
		self.assertEqual(client.get_document_details("F9D425P6DS7D8IU")["status"], "Valid")
		self.assertEqual(
			transport.requests[1].full_url,
			f"{API}/api/v1.0/documents/F9D425P6DS7D8IU/details",
		)

	def test_search_documents(self):
		client, transport = self.build(
			token_response(), FakeResponse(200, {"result": [{"uuid": "F9D425P6DS7D8IU"}]})
		)
		result = client.search_documents(invoice_code_number="INV-2026-0001")
		self.assertEqual(result["result"][0]["uuid"], "F9D425P6DS7D8IU")
		self.assertIn("invoiceCodeNumber=INV-2026-0001", transport.requests[1].full_url)

	def test_document_raw(self):
		client, transport = self.build(token_response(), FakeResponse(200, {"document": "..."}))
		client.get_document_raw("F9D425P6DS7D8IU")
		self.assertEqual(
			transport.requests[1].full_url,
			f"{API}/api/v1.0/documents/F9D425P6DS7D8IU/raw",
		)

	def test_cancel_uses_put_state_endpoint(self):
		client, transport = self.build(
			token_response(),
			FakeResponse(200, {"uuid": "F9D425P6DS7D8IU", "status": "Cancelled"}),
		)
		response = client.cancel_document("F9D425P6DS7D8IU", "Wrong buyer details")
		self.assertEqual(response["status"], "Cancelled")

		request = transport.requests[1]
		self.assertEqual(request.get_method(), "PUT")
		self.assertEqual(
			request.full_url,
			f"{API}/api/v1.0/documents/state/F9D425P6DS7D8IU/state",
		)
		self.assertEqual(
			json.loads(request.data),
			{"status": "cancelled", "reason": "Wrong buyer details"},
		)

	def test_reject_uses_put_state_endpoint(self):
		client, transport = self.build(token_response(), FakeResponse(200, {"status": "Rejected"}))
		client.reject_document("F9D425P6DS7D8IU", "Wrong invoice details")
		self.assertEqual(
			json.loads(transport.requests[1].data),
			{"status": "rejected", "reason": "Wrong invoice details"},
		)

	def test_cancel_requires_a_reason(self):
		client, _ = self.build(token_response())
		with self.assertRaises(ValueError):
			client.cancel_document("F9D425P6DS7D8IU", "   ")

	def test_cancel_reason_length_limit(self):
		client, _ = self.build(token_response())
		with self.assertRaises(ValueError) as caught:
			client.cancel_document("F9D425P6DS7D8IU", "x" * (MAX_REASON_LENGTH + 1))
		self.assertIn("300", str(caught.exception))

	def test_cancel_outside_the_72_hour_window(self):
		client, _ = self.build(
			token_response(),
			FakeHTTPError(
				400,
				{"error": {"code": "OperationPeriodOver", "message": "The cancellation period is over"}},
			),
		)
		with self.assertRaises(MyInvoisError) as caught:
			client.cancel_document("F9D425P6DS7D8IU", "Too late")
		self.assertEqual(caught.exception.code, "OperationPeriodOver")


class TestTaxpayer(ClientTest):
	def test_validate_tin_success(self):
		client, transport = self.build(token_response(), FakeResponse(200, {}))
		self.assertTrue(client.validate_tin("C2584563200", "BRN", "201901009876"))
		self.assertEqual(
			transport.requests[1].full_url,
			f"{API}/api/v1.0/taxpayer/validate/C2584563200?idType=BRN&idValue=201901009876",
		)

	def test_validate_tin_not_found_returns_false(self):
		client, _ = self.build(token_response(), FakeHTTPError(404, {"error": {"code": "NotFound"}}))
		self.assertFalse(client.validate_tin("C2584563200", "BRN", "201901009876"))

	def test_validate_tin_other_errors_raise(self):
		client, _ = self.build(token_response(), FakeHTTPError(400, {"error": {"code": "BadArgument"}}))
		with self.assertRaises(MyInvoisError):
			client.validate_tin("C2584563200", "BRN", "x")

	def test_search_tin(self):
		client, transport = self.build(
			token_response(),
			FakeResponse(200, {"taxpayerName": "Arena Technologies Sdn Bhd"}),
		)
		result = client.search_tin("BRN", "201901009876", taxpayer_name="Arena")
		self.assertEqual(result["taxpayerName"], "Arena Technologies Sdn Bhd")
		self.assertIn("taxpayerName=Arena", transport.requests[1].full_url)


class TestEndpoints(ClientTest):
	def test_production_endpoints(self):
		config = ClientConfig(client_id="a", client_secret="b", sandbox=False)
		self.assertEqual(config.api_base, "https://api.myinvois.hasil.gov.my")
		self.assertEqual(config.identity_base, "https://identity.myinvois.hasil.gov.my")

	def test_sandbox_endpoints(self):
		self.assertEqual(self.config.api_base, API)
		self.assertEqual(self.config.identity_base, IDENTITY)


if __name__ == "__main__":
	unittest.main()
