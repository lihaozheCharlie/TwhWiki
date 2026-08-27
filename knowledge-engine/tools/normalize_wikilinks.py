#!/usr/bin/env python3
"""Normalize Obsidian wiki-link targets to vault-root paths where needed."""

from __future__ import annotations

import re
from pathlib import Path

from vault_context import KNOWLEDGE_BASE_ROOT


ROOT = KNOWLEDGE_BASE_ROOT
WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
WIKI_PREFIXES = (
    "00 总入口/",
    "01 个人主线/",
    "02 人生阶段/",
    "03 关键事件与决策/",
    "04 反复循环/",
    "05 人物关系图谱/",
    "06 现实系统/",
    "07 人物与城市/",
    "08 来源索引/",
    "09 思维模型/",
    "10 时间线/",
    "99 维护规则/",
)


def normalize_target(target: str) -> str:
    if "原始知识库/" in target:
        return target[target.index("原始知识库/") :].strip("/")
    for prefix in WIKI_PREFIXES:
        if target.startswith(prefix):
            return f"wiki/{target}"
    return target


def normalize_link(match: re.Match[str]) -> str:
    inner = match.group(1)
    target, sep, rest = inner.partition("|")
    heading = ""
    if "#" in target:
        target, _, heading = target.partition("#")
        heading = f"#{heading}"
    normalized = normalize_target(target.strip()) + heading
    if sep:
        return f"[[{normalized}|{rest}]]"
    return f"[[{normalized}]]"


def main() -> None:
    changed = 0
    for path in sorted(ROOT.rglob("*.md")):
        if any(part in {".obsidian", ".idea"} for part in path.relative_to(ROOT).parts):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        new_text = WIKILINK_RE.sub(normalize_link, text)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            changed += 1
    print(f"normalized={changed}")


if __name__ == "__main__":
    main()
