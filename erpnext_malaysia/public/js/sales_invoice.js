// Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.ui.form.on("Sales Invoice", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1) {
			return;
		}
		if (!frm.doc.custom_malaysia_einvoice_status) {
			return;
		}

		frm.add_custom_button(__("Preview e-Invoice"), () => preview_einvoice(frm), __("Malaysia e-Invoice"));

		if (
			["Not Submitted", "Error", "Retry", "Rejected"].includes(frm.doc.custom_malaysia_einvoice_status)
		) {
			frm.add_custom_button(
				__("Submit to MyInvois"),
				() => submit_einvoice(frm),
				__("Malaysia e-Invoice")
			);
		}

		frm.add_custom_button(__("e-Invoice Status"), () => show_status(frm), __("Malaysia e-Invoice"));
	},
});

function preview_einvoice(frm) {
	frappe.call({
		method: "malaysia_einvoice.api.preview_document",
		args: { sales_invoice: frm.doc.name },
		freeze: true,
		freeze_message: __("Building the UBL document…"),
		callback: (r) => {
			if (!r.message) {
				return;
			}
			const preview = r.message;
			const errors = (preview.errors || []).map(
				(error) => `<li>${frappe.utils.escape_html(error)}</li>`
			);
			const warnings = (preview.warnings || []).map(
				(warning) => `<li>${frappe.utils.escape_html(warning)}</li>`
			);

			const dialog = new frappe.ui.Dialog({
				title: __("MyInvois document preview"),
				size: "large",
				fields: [
					{
						fieldtype: "HTML",
						fieldname: "summary",
						options: `
							<div class="mb-3">
								<span class="indicator ${preview.ok ? "green" : "red"}">
									${preview.ok ? __("Ready to submit") : __("Needs attention")}
								</span>
							</div>
							${errors.length ? `<b>${__("Errors")}</b><ul>${errors.join("")}</ul>` : ""}
							${warnings.length ? `<b>${__("Warnings")}</b><ul>${warnings.join("")}</ul>` : ""}
							${preview.hash ? `<p class="text-muted">SHA-256: ${preview.hash}</p>` : ""}
						`,
					},
					{
						fieldtype: "Code",
						fieldname: "document",
						label: __("UBL 2.1 JSON"),
						options: "JSON",
						read_only: 1,
					},
				],
			});
			dialog.fields_dict.document.set_value(
				preview.document ? JSON.stringify(preview.document, null, 2) : ""
			);
			dialog.show();
		},
	});
}

function submit_einvoice(frm) {
	frappe.confirm(__("Submit {0} to LHDN MyInvois now?", [frm.doc.name]), () => {
		frappe.call({
			method: "malaysia_einvoice.api.submit_now",
			args: { sales_invoice: frm.doc.name },
			freeze: true,
			freeze_message: __("Submitting to MyInvois…"),
			callback: (r) => {
				if (!r.message) {
					return;
				}
				frappe.show_alert({
					message: r.message.message || __("Submitted"),
					indicator: r.message.status === "Rejected" ? "red" : "green",
				});
				frm.reload_doc();
			},
		});
	});
}

function show_status(frm) {
	frappe.call({
		method: "malaysia_einvoice.api.get_status",
		args: { sales_invoice: frm.doc.name },
		callback: (r) => {
			if (!r.message) {
				return;
			}
			const status = r.message;
			const dialog = new frappe.ui.Dialog({
				title: __("e-Invoice status"),
				fields: [
					{
						fieldtype: "HTML",
						fieldname: "details",
						options: `
							<table class="table table-sm">
								<tr><td>${__("Status")}</td><td>${frappe.utils.escape_html(status.status || "")}</td></tr>
								<tr><td>${__("Document UUID")}</td><td>${frappe.utils.escape_html(status.uuid || "—")}</td></tr>
								<tr><td>${__("Last checked")}</td><td>${frappe.utils.escape_html(status.last_checked_on || "—")}</td></tr>
							</table>
							${status.error ? `<pre class="small">${frappe.utils.escape_html(status.error)}</pre>` : ""}
						`,
					},
				],
				primary_action_label: __("Refresh from MyInvois"),
				primary_action: () => {
					frappe.call({
						method: "malaysia_einvoice.api.refresh_status",
						args: { log_name: status.log },
						freeze: true,
						callback: (res) => {
							dialog.hide();
							frappe.show_alert({
								message: __("Status: {0}", [res.message.status]),
								indicator: "blue",
							});
							frm.reload_doc();
						},
					});
				},
			});
			dialog.add_custom_action(__("Cancel e-Invoice"), () => {
				dialog.hide();
				cancel_einvoice(frm);
			});
			dialog.show();
		},
	});
}

function cancel_einvoice(frm) {
	frappe.prompt(
		[
			{
				fieldname: "reason",
				fieldtype: "Small Text",
				label: __("Reason for cancellation"),
				reqd: 1,
				description: __("LHDN requires a reason and only allows cancellation within 72 hours."),
			},
		],
		(values) => {
			frappe.call({
				method: "malaysia_einvoice.api.cancel",
				args: { sales_invoice: frm.doc.name, reason: values.reason },
				freeze: true,
				callback: (r) => {
					if (!r.message) {
						return;
					}
					frappe.show_alert({
						message: r.message.message || __("Cancelled"),
						indicator: "orange",
					});
					frm.reload_doc();
				},
			});
		},
		__("Cancel e-Invoice"),
		__("Cancel at MyInvois")
	);
}
