#!/usr/bin/env python3
"""Scan repository text files for common secrets and personal identifiers."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", "__pycache__", ".venv", "venv", ".idea"}
SKIP_NAMES = {".privacy-denylist"}
TEXT_SUFFIXES = {"", ".md", ".py", ".json", ".yml", ".yaml", ".toml", ".txt", ".cff"}
PATTERNS = {
    "macOS absolute user path": re.compile(r"/Users/[A-Za-z0-9._-]+/"),
    "Windows absolute user path": re.compile(r"[A-Za-z]:\\\\Users\\\\[^\\\s]+"),
    "email address": re.compile(r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![\w.-])"),
    "mainland China phone number": re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
    "OpenAI-like secret": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "GitHub token": re.compile(r"\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "private key block": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
}


def candidate_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.name in SKIP_NAMES:
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name in {"Makefile", "LICENSE"}:
            files.append(path)
    return sorted(files)


def denylist() -> list[str]:
    path = ROOT / ".privacy-denylist"
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.lstrip().startswith("#")]


def main() -> int:
    findings: list[tuple[Path, int, str, str]] = []
    custom = denylist()
    for path in candidate_files():
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(lines, 1):
            for label, pattern in PATTERNS.items():
                match = pattern.search(line)
                if match:
                    findings.append((path, number, label, match.group(0)))
            for term in custom:
                if term in line:
                    findings.append((path, number, "custom denylist", term))

    for path, number, label, value in findings:
        rel = path.relative_to(ROOT)
        print(f"{rel}:{number}: {label}: {value!r}")
    print(f"files={len(candidate_files())} findings={len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
