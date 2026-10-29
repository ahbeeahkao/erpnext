#!/usr/bin/env python3
# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

"""Static self-check for the app: run it before pushing, and in CI without a bench.

    python3 erpnext_malaysia/scripts/check_app.py

Verifies, without importing frappe:
  * every DocType JSON is structurally sound (field_order covers exactly the fields it lists),
  * each DocType has a controller whose class name matches,
  * Link fields point at a DocType that exists in this app or in the ERPNext tree,
  * every hook dotted path in hooks.py resolves to a real module attribute,
  * every ``custom_*`` field referenced from Python is declared in setup/install.py.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = APP_ROOT.parent
FIELDTYPES_WITHOUT_FIELDNAME = {"Section Break", "Column Break", "Tab Break", "Fold"}


def scrubbed(name: str) -> str:
	return re.sub(r"[^a-z0-9_]", "_", name.lower().replace(" ", "_"))


def camel(name: str) -> str:
	"""``LHDN Classification Code`` -> ``LHDNClassificationCode`` (Frappe's class naming)."""
	parts = [part for part in re.split(r"[^A-Za-z0-9]+", name) if part]
	return "".join(part[:1].upper() + part[1:] for part in parts)


class Checker:
	def __init__(self) -> None:
		self.errors: list[str] = []
		self.checks = 0

	def check(self, condition: bool, message: str) -> bool:
		self.checks += 1
		if not condition:
			self.errors.append(message)
		return condition


def load_doctypes(checker: Checker) -> dict[str, dict]:
	doctypes: dict[str, dict] = {}
	doctype_root = APP_ROOT / "malaysia_einvoice" / "doctype"
	for json_path in sorted(doctype_root.glob("*/*.json")):
		with json_path.open(encoding="utf-8") as handle:
			data = json.load(handle)
		name = data.get("name", "")
		checker.check(data.get("doctype") == "DocType", f"{json_path}: doctype != DocType")
		checker.check(name == data.get("name"), f"{json_path}: name mismatch")
		checker.check(bool(data.get("module")), f"{json_path}: missing module")
		checker.check(
			scrubbed(name) == json_path.parent.name,
			f"{json_path}: folder {json_path.parent.name} != scrubbed doctype {scrubbed(name)}",
		)
		checker.check(
			(data.get("issingle") or data.get("istable") or bool(data.get("permissions"))),
			f"{json_path}: standard DocType without permissions",
		)

		fields = data.get("fields") or []
		fieldnames = [field.get("fieldname") for field in fields]
		checker.check(len(fieldnames) == len(set(fieldnames)), f"{json_path}: duplicate fieldnames")
		for field in fields:
			checker.check(bool(field.get("fieldtype")), f"{json_path}: field without fieldtype")
			if field.get("fieldtype") not in FIELDTYPES_WITHOUT_FIELDNAME:
				checker.check(bool(field.get("fieldname")), f"{json_path}: field without fieldname")
			if field.get("fieldtype") in ("Select", "Link", "Table", "Table MultiSelect"):
				checker.check(
					bool(field.get("options")), f"{json_path}: {field['fieldname']} without options"
				)
			if field.get("fieldtype") == "Link" and field.get("options"):
				doctypes.setdefault("_links", []).append((json_path.name, field["options"]))

		field_order = data.get("field_order") or []
		listed = set(field_order)
		checker.check(
			listed == set(fieldnames),
			f"{json_path}: field_order {sorted(listed ^ set(fieldnames))} differs from fields",
		)
		for fieldname in field_order:
			checker.check(
				fieldname in fieldnames,
				f"{json_path}: field_order references unknown field {fieldname}",
			)

		doctypes[name] = data
		check_controller(checker, json_path.with_suffix(".py"), name)

	return doctypes


def check_controller(checker: Checker, path: Path, doctype: str) -> None:
	if not checker.check(path.exists(), f"{path}: missing controller"):
		return
	tree = ast.parse(path.read_text(encoding="utf-8"))
	classes = {node.name for node in tree.body if isinstance(node, ast.ClassDef)}
	checker.check(camel(doctype) in classes, f"{path}: no controller class")


def doctype_exists(name: str) -> bool:
	if not name:
		return False
	app_dir = APP_ROOT / "malaysia_einvoice" / "doctype" / scrubbed(name)
	if app_dir.is_dir():
		return True
	return any((REPO_ROOT / "erpnext").glob(f"**/doctype/{scrubbed(name)}/{scrubbed(name)}.json"))


def check_hooks(checker: Checker) -> None:
	hooks_path = APP_ROOT / "hooks.py"
	tree = ast.parse(hooks_path.read_text(encoding="utf-8"))
	assignments: dict[str, ast.AST] = {}
	for node in tree.body:
		if isinstance(node, ast.Assign) and len(node.targets) == 1:
			target = node.targets[0]
			if isinstance(target, ast.Name):
				assignments[target.id] = node.value

	for key in ("after_install", "after_migrate", "before_uninstall", "doc_events", "scheduler_events"):
		checker.check(key in assignments, f"hooks.py: missing {key}")

	paths: list[str] = []
	for key in ("after_install", "after_migrate", "before_uninstall"):
		node = assignments.get(key)
		if isinstance(node, ast.Constant) and isinstance(node.value, str):
			paths.append(node.value)
	for key in ("doc_events", "scheduler_events"):
		node = assignments.get(key)
		if node is not None:
			paths.extend(_collect_strings(node, module_like_only=True))

	for dotted in paths:
		checker.check(resolve_hook(dotted), f"hooks.py: cannot resolve {dotted}")

	doctype_js = assignments.get("doctype_js")
	if isinstance(doctype_js, ast.Dict):
		for value in doctype_js.values:
			if isinstance(value, ast.Constant):
				checker.check(
					(APP_ROOT / str(value.value)).exists(),
					f"hooks.py: doctype_js file {value.value} is missing",
				)


def _collect_strings(node: ast.AST, module_like_only: bool = False) -> list[str]:
	found: list[str] = []
	for child in ast.walk(node):
		if isinstance(child, ast.Constant) and isinstance(child.value, str):
			if not module_like_only or child.value.startswith("malaysia_einvoice."):
				found.append(child.value)
	return found


def resolve_hook(dotted: str) -> bool:
	parts = dotted.split(".")
	for split in range(len(parts), 0, -1):
		module_path = APP_ROOT / Path(*parts[:split]).with_suffix(".py")
		if not module_path.exists():
			continue
		tree = ast.parse(module_path.read_text(encoding="utf-8"))
		names = {
			node.name
			for node in tree.body
			if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)
		}
		names |= {
			target.id
			for node in tree.body
			if isinstance(node, ast.Assign)
			for target in node.targets
			if isinstance(target, ast.Name)
		}
		return all(part in names for part in parts[split:])
	return False


def check_custom_fields(checker: Checker) -> None:
	install = (APP_ROOT / "malaysia_einvoice" / "setup" / "install.py").read_text(encoding="utf-8")
	tree = ast.parse(install)
	declared: set[str] = set()
	for node in ast.walk(tree):
		if isinstance(node, ast.Dict):
			for value in node.values:
				if isinstance(value, ast.Constant) and isinstance(value.value, str):
					if value.value.startswith("custom_"):
						declared.add(value.value)

	referenced: set[str] = set()
	for path in APP_ROOT.rglob("*.py"):
		text = path.read_text(encoding="utf-8")
		referenced |= set(re.findall(r"['\"](custom_malaysia_[a-z_]+)['\"]", text))
		referenced |= set(re.findall(r"custom_malaysia_[a-z_]+", text))
	referenced = {name for name in referenced if name.startswith("custom_malaysia_")}

	# Fields declared with Python identifiers instead of string literals still count.
	declared |= set(re.findall(r'"(custom_malaysia_[a-z_]+)"', install))
	missing = {name for name in referenced if name not in declared}
	checker.check(not missing, f"custom fields referenced but never created: {sorted(missing)}")


def check_insert_after(checker: Checker) -> None:
	"""Every ``insert_after`` must name a real field of the target DocType (or an earlier custom one)."""
	install = (APP_ROOT / "malaysia_einvoice" / "setup" / "install.py").read_text(encoding="utf-8")
	tree = ast.parse(install)
	namespace: dict[str, object] = {}
	for node in tree.body:
		if isinstance(node, ast.Assign) and len(node.targets) == 1:
			target = node.targets[0]
			if isinstance(target, ast.Name) and target.id != "CUSTOM_FIELDS":
				try:
					namespace[target.id] = ast.literal_eval(node.value)
				except ValueError:
					pass

	custom: dict[str, list[dict]] = {}
	for node in tree.body:
		if not isinstance(node, ast.AnnAssign):
			continue
		if not (isinstance(node.target, ast.Name) and node.target.id == "CUSTOM_FIELDS"):
			continue
		for doctype_node, fields_node in zip(node.value.keys, node.value.values, strict=True):
			doctype = ast.literal_eval(doctype_node)
			custom[doctype] = [
				eval(
					compile(ast.Expression(element), "<install>", "eval"),
					{"__builtins__": {}},
					namespace,
				)
				for element in fields_node.elts
			]

	for doctype, fields in custom.items():
		existing = doctype_fieldnames(doctype)
		if existing is None:
			checker.errors.append(f"setup/install.py: DocType {doctype!r} not found in the tree")
			continue
		available = set(existing)
		for field in fields:
			anchor = field.get("insert_after")
			checker.check(
				anchor in available,
				f"setup/install.py: {doctype}.{field['fieldname']} inserts after unknown {anchor!r}",
			)
			available.add(field["fieldname"])


def doctype_fieldnames(doctype: str) -> set[str] | None:
	matches = list((REPO_ROOT / "erpnext").glob(f"**/doctype/{scrubbed(doctype)}/{scrubbed(doctype)}.json"))
	if not matches:
		return None
	data = json.loads(matches[0].read_text(encoding="utf-8"))
	return {field.get("fieldname") for field in data.get("fields") or []}


def check_syntax(checker: Checker) -> None:
	for path in APP_ROOT.rglob("*.py"):
		if "__pycache__" in path.parts:
			continue
		try:
			ast.parse(path.read_text(encoding="utf-8"))
		except SyntaxError as error:  # pragma: no cover - only on a broken tree
			checker.errors.append(f"{path}: {error}")


def main() -> int:
	checker = Checker()
	check_syntax(checker)
	doctypes = load_doctypes(checker)
	for filename, target in doctypes.pop("_links", []):
		checker.check(doctype_exists(target), f"{filename}: Link target {target!r} does not exist")
	check_hooks(checker)
	check_custom_fields(checker)
	check_insert_after(checker)

	if checker.errors:
		print(f"FAILED ({len(checker.errors)} problems, {checker.checks} checks)")
		for error in checker.errors:
			print(f"  - {error}")
		return 1

	print(f"OK: {checker.checks} static checks passed across {len(doctypes)} DocTypes")
	return 0


if __name__ == "__main__":
	sys.exit(main())
