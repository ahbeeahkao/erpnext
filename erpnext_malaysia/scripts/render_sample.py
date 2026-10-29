#!/usr/bin/env python3
# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Render the committed sample e-Invoice from the pure layer (no bench, no credentials).

    python3 erpnext_malaysia/scripts/render_sample.py            # print to stdout
    python3 erpnext_malaysia/scripts/render_sample.py --write    # refresh samples/

The committed sample doubles as a golden file: ``tests/test_services.py`` fails if the builder's
output ever drifts from it, which makes a payload change show up in review as a diff.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_DIR = APP_ROOT / "samples"
SAMPLE_FILE = SAMPLE_DIR / "sample-einvoice.json"

sys.path.insert(0, str(APP_ROOT))

from malaysia_einvoice.services.ubl import build_ubl_invoice
from malaysia_einvoice.tests.test_services import invoice


def main(argv: list[str]) -> int:
	document = build_ubl_invoice(invoice())
	text = json.dumps(document, indent=1, ensure_ascii=False)

	if "--write" in argv:
		SAMPLE_DIR.mkdir(exist_ok=True)
		SAMPLE_FILE.write_text(text + "\n", encoding="utf-8")
		print(f"wrote {SAMPLE_FILE.relative_to(APP_ROOT.parent)}")
	else:
		print(text)
	return 0


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))
