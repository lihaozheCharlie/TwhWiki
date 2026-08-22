#!/usr/bin/env python3
"""Validate Obsidian wiki links across the vault."""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")


def md_files() -> list[Path]:
    roots = (ROOT / "wiki", ROOT / "原始知识库")
    return sorted(p for base in roots if base.exists() for p in base.rglob("*.md"))


def normalize_target(raw: str) -> str:
    target = raw.split("|", 1)[0].split("#", 1)[0].strip()
    target = target.replace("\\", "/").strip("/")
    if target.endswith(".md"):
        target = target[:-3]
    return target


def candidates_for(path: Path) -> set[str]:
    rel_path = path.relative_to(ROOT)
    rel = rel_path.with_suffix("").as_posix() if rel_path.suffix == ".md" else rel_path.as_posix()
    return {rel, path.stem}


def aliases_for(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("---\n"):
        return set()
    end = text.find("\n---\n", 4)
    if end == -1:
        return set()
    aliases: set[str] = set()
    lines = text[4:end].splitlines()
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("aliases: [") and stripped.endswith("]"):
            inner = stripped[len("aliases: [") : -1].strip()
            for item in inner.split(","):
                cleaned = item.strip().strip("'\"")
                if cleaned:
                    aliases.add(cleaned)
        if stripped == "aliases:":
            j = i + 1
            while j < len(lines) and lines[j].startswith("  - "):
                cleaned = lines[j][4:].strip().strip("'\"")
                if cleaned:
                    aliases.add(cleaned)
                j += 1
    return aliases


def strip_md_suffix(path: Path) -> str:
    rel = path.relative_to(ROOT)
    if rel.suffix == ".md":
        rel = rel.with_suffix("")
    return rel.as_posix()


def main() -> None:
    files = md_files()
    by_key_sets: dict[str, set[Path]] = defaultdict(set)
    for path in files:
        for key in candidates_for(path):
            by_key_sets[key].add(path)
        for alias in aliases_for(path):
            by_key_sets[alias].add(path)
    by_key = {key: sorted(paths) for key, paths in by_key_sets.items()}

    missing: list[tuple[Path, str]] = []
    ambiguous: list[tuple[Path, str, list[Path]]] = []

    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in WIKILINK_RE.finditer(text):
            target = normalize_target(match.group(1))
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved: list[Path] = []
            if target.startswith("."):
                rel = (path.parent / target).resolve()
                try:
                    rel_key = strip_md_suffix(rel)
                    resolved = by_key.get(rel_key, [])
                except ValueError:
                    resolved = []
            elif "/" in target:
                resolved = by_key.get(target, [])
                if not resolved and (ROOT / target).is_dir():
                    resolved = [ROOT / target]
            else:
                resolved = by_key.get(target, [])
            if not resolved:
                missing.append((path, target))
            elif len(resolved) > 1:
                ambiguous.append((path, target, resolved))

    print(f"files={len(files)} missing={len(missing)} ambiguous={len(ambiguous)}")
    if missing:
        print("\nMISSING")
        for path, target in missing[:300]:
            print(f"{path.relative_to(ROOT)} -> {target}")
    if ambiguous:
        print("\nAMBIGUOUS")
        for path, target, resolved in ambiguous[:300]:
            choices = ", ".join(p.relative_to(ROOT).as_posix() for p in resolved[:5])
            print(f"{path.relative_to(ROOT)} -> {target} :: {choices}")


if __name__ == "__main__":
    main()
