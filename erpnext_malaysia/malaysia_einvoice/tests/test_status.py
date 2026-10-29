# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Tests for the MyInvois status normaliser."""

from __future__ import annotations

import unittest

from malaysia_einvoice.services.status import LOG_STATUSES, status_title


class TestStatusTitle(unittest.TestCase):
	def test_known_statuses(self):
		self.assertEqual(status_title("Valid"), "Valid")
		self.assertEqual(status_title("valid"), "Valid")
		self.assertEqual(status_title("Invalid"), "Invalid")
		self.assertEqual(status_title("Submitted"), "Submitted")
		self.assertEqual(status_title("Cancelled"), "Cancelled")
		self.assertEqual(status_title("canceled"), "Cancelled")

	def test_rejection_request_is_reported_as_rejected(self):
		self.assertEqual(status_title("Requested for Rejection"), "Rejected")

	def test_descriptive_wording(self):
		self.assertEqual(status_title("Validated"), "Valid")
		self.assertEqual(status_title("validation failed"), "Invalid")
		self.assertEqual(status_title("CANCEL_requested"), "Cancelled")

	def test_blank_and_unknown_fall_back_to_submitted(self):
		self.assertEqual(status_title(None), "Submitted")
		self.assertEqual(status_title(""), "Submitted")
		self.assertEqual(status_title("something new"), "Submitted")

	def test_every_result_is_a_select_option(self):
		for value in (None, "valid", "weird", "cancelled", "Requested for Rejection"):
			self.assertIn(status_title(value), LOG_STATUSES)


if __name__ == "__main__":
	unittest.main()
