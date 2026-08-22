#!/usr/bin/env python3
"""Run the repository's deterministic quality checks."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKS = (
    ("tag idempotence", [sys.executable, "tools/update_obsidian_tags.py"]),
    ("WikiLink integrity", [sys.executable, "tools/validate_wiki_links.py"]),
    ("Skill architecture", [sys.executable, "tools/validate_skill_system.py"]),
    ("privacy", [sys.executable, "tools/privacy_scan.py"]),
)


def main() -> int:
    failures = 0
    for label, command in CHECKS:
        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
        output = (result.stdout + result.stderr).strip()
        print(f"[{label}] {output}")
        if result.returncode != 0:
            failures += 1
        elif label == "tag idempotence":
            match = re.search(r"updated=(\d+)", output)
            if match is None or int(match.group(1)) != 0:
                print("[tag idempotence] repository was not clean; run the tag updater twice and commit the result")
                failures += 1
    print(f"checks={len(CHECKS)} failures={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
