# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Normalise the status strings MyInvois returns onto this app's own vocabulary.

LHDN answers with ``Submitted``, ``Valid``, ``Invalid``, ``Cancelled`` and
``Requested for Rejection``; ERPNext's Select field uses the same words so the two never drift.
Pure Python so it can be unit tested without a bench.
"""

from __future__ import annotations

#: Values of the ``status`` Select on E Invoice Submission Log and the Sales Invoice flag.
LOG_STATUSES = (
	"Not Submitted",
	"Queued",
	"Submitting",
	"Submitted",
	"Valid",
	"Invalid",
	"Cancelled",
	"Rejected",
	"Retry",
	"Error",
	"Skipped",
)

#: LHDN may send lower case ("cancelled") or a descriptive phrase.
_ALIASES = {
	"submitted": "Submitted",
	"valid": "Valid",
	"invalid": "Invalid",
	"cancelled": "Cancelled",
	"canceled": "Cancelled",
	"rejected": "Rejected",
	"requested for rejection": "Rejected",
	"not submitted": "Not Submitted",
	"error": "Error",
}

DEFAULT_STATUS = "Submitted"


def status_title(value: str | None) -> str:
	"""Map an LHDN status onto one of :data:`LOG_STATUSES` (unknown values become ``Submitted``)."""
	if not value:
		return DEFAULT_STATUS
	normalised = " ".join(str(value).replace("_", " ").split()).strip().lower()
	if normalised in _ALIASES:
		return _ALIASES[normalised]
	# Tolerate "Validated" / "Validation Failed" style wording. Check the negative cases
	# first: "validation failed" contains "valid".
	if "invalid" in normalised or "fail" in normalised:
		return "Invalid"
	if "cancel" in normalised:
		return "Cancelled"
	if "valid" in normalised:
		return "Valid"
	return DEFAULT_STATUS
