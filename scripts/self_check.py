#!/usr/bin/env python3
"""Deterministic, offline self-check for PRODUCT:OS Spec Driven."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_JSON = (".claude-plugin/marketplace.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".factory-plugin/plugin.json", ".factory-plugin/marketplace.json")
REQUIRED_FILES = ("README.md", "LICENSE", "PRIVACY.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "CHANGELOG.md", "llms.txt", "docs/cookbook.md", "commands/doctor.md", "prompts/doctor.md", "tools/run/doctor.mjs")

def main() -> int:
    failed = False
    for rel in REQUIRED_JSON:
        try:
            value = json.loads((ROOT / rel).read_text(encoding="utf-8"))
            if not isinstance(value, dict): raise ValueError("top-level value is not an object")
        except Exception as exc:
            print(f"FAIL: {rel}: {exc}"); failed = True
        else: print(f"PASS: {rel}")
    for rel in REQUIRED_FILES:
        target = ROOT / rel
        if target.is_file() and target.stat().st_size > 0: print(f"PASS: {rel}")
        else: print(f"FAIL: missing or empty {rel}"); failed = True
    node = shutil.which("node")
    if node is None: print("SKIPPED: kit doctor (node is unavailable)")
    else:
        result = subprocess.run([node, "tools/run/doctor.mjs"], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
        print(result.stdout.rstrip())
        fails = [line for line in result.stdout.splitlines() if line.startswith("FAIL ")]
        # Ajv is optional in a fresh clone; it may be skipped only when it is the doctor's sole failure (exit 1).
        ajv_only = result.returncode == 1 and len(fails) == 1 and fails[0].startswith("FAIL Ajv 2020:")
        if result.returncode == 0: print("PASS: kit doctor")
        elif ajv_only: print("SKIPPED: kit doctor Ajv check (Ajv 2020 is optional for a fresh clone); every other doctor check passed")
        else: print(f"FAIL: kit doctor exited {result.returncode}"); failed = True
    return 1 if failed else 0

if __name__ == "__main__": raise SystemExit(main())
