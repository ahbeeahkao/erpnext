# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

app_name = "erpnext_malaysia"
app_title = "ERPNext Malaysia"
app_publisher = "Arena.ai"
app_description = "Malaysian localisation: LHDN MyInvois e-Invoicing (SST aware)"
app_email = "hello@arena.ai"
app_license = "gpl-3.0"
app_version = "0.1.0"
required_apps = ["frappe/erpnext"]

# --------------------------------------------------------------------------- install / migrate
after_install = "malaysia_einvoice.setup.install.after_install"
after_migrate = "malaysia_einvoice.setup.install.after_migrate"
before_uninstall = "malaysia_einvoice.setup.install.before_uninstall"

# --------------------------------------------------------------------------- document events
doc_events = {
	"Sales Invoice": {
		"on_submit": "malaysia_einvoice.services.submission.enqueue_submission",
		"on_cancel": "malaysia_einvoice.services.submission.on_sales_invoice_cancel",
	},
}

# --------------------------------------------------------------------------- scheduled jobs
scheduler_events = {
	"cron": {
		# Pull the asynchronous validation result from LHDN.
		"*/10 * * * *": [
			"malaysia_einvoice.services.submission.poll_pending_documents",
		],
		# Re-queue anything the queue lost (worker restart, deploy in the middle of a retry).
		"*/15 * * * *": [
			"malaysia_einvoice.services.submission.retry_pending",
		],
	},
}

# --------------------------------------------------------------------------- desk
# Adds a "Malaysia e-Invoice" block to the Sales Invoice form.
doctype_js = {
	"Sales Invoice": "public/js/sales_invoice.js",
}

# Lets Accounts users search submissions from the awesome bar / list view.
global_search_doctypes = {
	"Default": [
		{"doctype": "E Invoice Submission Log", "index": 3},
	],
}
