"""CI runs tests/ in parallel (pytest-xdist); the plugin must be a declared dev dependency-group member.

`-n auto` fails with "unrecognized arguments" when the plugin is missing, which
would break every CI run, so the workflow flag and the dependency move together.
"""
from __future__ import annotations

import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_parallel_flag_requires_the_declared_plugin():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    uses_parallel = re.search(r"pytest tests/ [^\n]*-n (auto|\d+)", workflow) is not None
    dev = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))[
        "dependency-groups"
    ]["dev"]
    declared = any(dep.lower().startswith("pytest-xdist") for dep in dev)
    assert declared or not uses_parallel, "ci.yml uses -n but pytest-xdist is not in the dev dependency group"


def test_backend_suite_stays_serial_until_its_order_dependence_is_fixed():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    line = next(l for l in workflow.splitlines() if "pytest backend/tests/" in l)
    assert " -n " not in line
