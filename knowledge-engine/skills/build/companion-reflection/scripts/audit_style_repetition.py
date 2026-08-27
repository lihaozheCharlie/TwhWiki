#!/usr/bin/env python3
"""检查近况回信中可由规则确定的模板化痕迹。"""

from __future__ import annotations

import argparse
import collections
import re
import sys
from pathlib import Path


DEFAULT_DIR = Path("wiki/12 近况对话")
OVERVIEW_NAME = "近况对话总览.md"

GENERIC_HEADINGS = {
    "我想先回应你的地方",
    "这和旧线怎么接上",
    "我会提醒你什么",
    "下次可以继续聊",
    "我的判断",
    "容易看错的地方",
    "接下来只管什么",
    "事实",
    "建议",
    "复查条件",
}

FORMULA_PATTERNS = {
    "主判断提示语": re.compile(r"我的主判断是|这篇日记的主判断"),
    "强制逆耳提示语": re.compile(r"一句不(?:太|那么)好听|不太温馨的提醒"),
    "固定三动作提示语": re.compile(r"接下来(?:只做|只留|我建议只做)三件"),
    "固定重心提示语": re.compile(r"我更在意的是|我真正想提醒你的"),
}

NOT_BUT_RE = re.compile(r"不是[^。！？\n]{0,80}而是")
WRITE_TO_YOU_RE = re.compile(r"^\d{4}-\d{2}-\d{2} 写给.*的你$")
THREE_ACTIONS_RE = re.compile(r"第一[，,].*?第二[，,].*?第三[，,]", re.S)


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---\n", 4)
    return text[end + 5 :] if end >= 0 else text


def collect_paths(raw_paths: list[str]) -> list[Path]:
    candidates: list[Path] = []
    if not raw_paths:
        candidates = sorted(DEFAULT_DIR.glob("*.md"))
    else:
        for raw in raw_paths:
            path = Path(raw)
            if path.is_dir():
                candidates.extend(sorted(path.glob("*.md")))
            else:
                candidates.append(path)
    return [
        path
        for path in candidates
        if path.is_file() and path.suffix == ".md" and path.name != OVERVIEW_NAME
    ]


def inspect(path: Path) -> dict[str, object]:
    body = strip_frontmatter(path.read_text(encoding="utf-8"))
    title_match = re.search(r"^# (.+)$", body, re.M)
    title = title_match.group(1).strip() if title_match else ""
    headings = [
        value.strip()
        for value in re.findall(r"^## (.+)$", body, re.M)
        if value.strip() != "依据"
    ]
    generic = [heading for heading in headings if heading in GENERIC_HEADINGS]
    formula_counts = {
        name: len(pattern.findall(body)) for name, pattern in FORMULA_PATTERNS.items()
    }
    return {
        "path": path,
        "title": title,
        "headings": headings,
        "generic": generic,
        "not_but": len(NOT_BUT_RE.findall(body)),
        "formula_counts": formula_counts,
        "three_actions": bool(THREE_ACTIONS_RE.search(body)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="报告近况回信中可由规则确定的重复模板痕迹。"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="当本轮页面违反硬性重复规则时返回非零状态",
    )
    parser.add_argument("paths", nargs="*", help="本轮变更的 Markdown 文件或目录")
    args = parser.parse_args()

    paths = collect_paths(args.paths)
    if not paths:
        print("files=0")
        return 0

    rows = [inspect(path) for path in paths]
    heading_counts: collections.Counter[str] = collections.Counter()
    shape_counts: collections.Counter[tuple[str, ...]] = collections.Counter()
    for row in rows:
        headings = row["headings"]
        assert isinstance(headings, list)
        heading_counts.update(headings)
        if headings:
            shape_counts[tuple(headings)] += 1

    generic_pages = [row for row in rows if row["generic"]]
    write_to_pages = [row for row in rows if WRITE_TO_YOU_RE.match(str(row["title"]))]
    not_but_total = sum(int(row["not_but"]) for row in rows)
    formula_pages = [
        row
        for row in rows
        if any(int(count) for count in dict(row["formula_counts"]).values())
    ]
    three_action_pages = [row for row in rows if row["three_actions"]]

    print(
        " ".join(
            [
                f"files={len(rows)}",
                f"generic_heading_pages={len(generic_pages)}",
                f"write_to_you_titles={len(write_to_pages)}",
                f"not_but_occurrences={not_but_total}",
                f"formula_marker_pages={len(formula_pages)}",
                f"three_action_pages={len(three_action_pages)}",
            ]
        )
    )

    for heading, count in heading_counts.most_common(8):
        if count > 1:
            print(f"repeated_heading count={count} heading={heading}")

    violations: list[str] = []
    for row in rows:
        path = row["path"]
        if row["generic"]:
            violations.append(f"{path}: generic headings {row['generic']}")
        if int(row["not_but"]) > 2:
            violations.append(f"{path}: 不是…而是… used {row['not_but']} times")
        marker_total = sum(int(value) for value in dict(row["formula_counts"]).values())
        if marker_total > 1:
            violations.append(f"{path}: {marker_total} formula markers")

    if len(rows) >= 3 and len(write_to_pages) / len(rows) > 0.4:
        violations.append(
            f"batch: 写给…的你 titles {len(write_to_pages)}/{len(rows)} exceeds 40%"
        )
    if len(rows) >= 3 and len(three_action_pages) / len(rows) > 0.5:
        violations.append(
            f"batch: three-action endings {len(three_action_pages)}/{len(rows)} exceeds 50%"
        )
    for shape, count in shape_counts.items():
        if count > 2:
            violations.append(f"batch: visible heading shape repeated {count} times: {shape}")

    if args.strict:
        for violation in violations:
            print(f"violation: {violation}")
    elif violations:
        print(f"violations_suppressed={len(violations)} rerun_with=--strict")

    return 1 if args.strict and violations else 0


if __name__ == "__main__":
    sys.exit(main())
