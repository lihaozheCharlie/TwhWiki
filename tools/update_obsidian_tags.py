#!/usr/bin/env python3
"""Maintain a small, path-derived Obsidian tag namespace.

Only 来源/, 类型/, and 领域/ are managed. All other user tags are preserved.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANAGED_PREFIXES = ("来源/", "类型/", "领域/")
NUMBERED_DIR_RE = re.compile(r"^\d{2}\s+(.+)$")


def markdown_files() -> list[Path]:
    roots = (ROOT / "wiki", ROOT / "原始知识库")
    return sorted(path for base in roots if base.exists() for path in base.rglob("*.md"))


def managed_tags_for(path: Path) -> list[str]:
    rel = path.relative_to(ROOT)
    if rel.parts[0] == "wiki":
        tags = ["来源/wiki", "类型/wiki"]
        if len(rel.parts) > 1:
            match = NUMBERED_DIR_RE.match(rel.parts[1])
            if match:
                tags.append(f"领域/{match.group(1)}")
        return tags

    source = "日记" if len(rel.parts) > 1 and rel.parts[1] == "日记" else "原始知识库"
    return [f"来源/{source}", "类型/原始笔记"]


def split_frontmatter(text: str) -> tuple[list[str] | None, str]:
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end < 0:
        return None, text
    return text[4:end].splitlines(), text[end + 5 :]


def parse_tags(lines: list[str]) -> tuple[list[str], int | None, int | None]:
    tags: list[str] = []
    start: int | None = None
    end: int | None = None
    for index, line in enumerate(lines):
        if not line.startswith("tags:"):
            continue
        start = index
        inline = line.split(":", 1)[1].strip()
        if inline.startswith("[") and inline.endswith("]"):
            tags.extend(item.strip().strip("'\"") for item in inline[1:-1].split(",") if item.strip())
            end = index + 1
            break
        cursor = index + 1
        while cursor < len(lines) and lines[cursor].startswith("  - "):
            tags.append(lines[cursor][4:].strip().strip("'\""))
            cursor += 1
        end = cursor
        break
    return tags, start, end


def render(path: Path, text: str) -> str:
    frontmatter, body = split_frontmatter(text)
    if frontmatter is None:
        return text

    existing, start, end = parse_tags(frontmatter)
    preserved = [tag for tag in existing if tag and not tag.startswith(MANAGED_PREFIXES)]
    desired = sorted(dict.fromkeys(managed_tags_for(path) + preserved))
    block = ["tags:"] + [f'  - "{tag}"' for tag in desired]

    if start is None or end is None:
        insert_at = len(frontmatter)
        frontmatter[insert_at:insert_at] = block
    else:
        frontmatter[start:end] = block
    return "---\n" + "\n".join(frontmatter) + "\n---\n" + body


def main() -> int:
    scanned = 0
    updated = 0
    for path in markdown_files():
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            continue
        scanned += 1
        new_text = render(path, text)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            updated += 1
    print(f"scanned={scanned} updated={updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
