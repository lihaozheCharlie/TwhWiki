#!/usr/bin/env python3
"""Collect per-person evidence for the personal wiki.

This script is intentionally deterministic and context-saving. It searches raw
notes for a canonical person name and aliases, strips generated metadata/index
sections, and prints structured evidence to stdout for the model to synthesize.
It does not write temporary evidence files.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path.cwd().resolve()
DEFAULT_RAW_DIRS = [
    "原始知识库/日记",
    "原始知识库/对话分析",
]
GENERIC_ALIASES = {
    "老师",
    "领导",
    "老板",
    "同学",
    "朋友",
    "小明",
    "老王",
    "哥哥",
    "姐姐",
    "妹妹",
    "逗比",
}

DATE_RE = re.compile(r"(20\d{2}|19\d{2})[.\-/年](\d{1,2})?[.\-/月]?(\d{1,2})?")
ALIAS_INLINE_RE = re.compile(r"^aliases:[ \t]*(.*)$", re.M)
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")

CATEGORY_WORDS = {
    "组织位置": ["汇报", "领导", "manager", "老板", "绩效", "职级", "组织", "团队", "owner", "负责", "接口人", "scope"],
    "业务协作": ["需求", "项目", "方案", "数据", "实验", "上线", "评审", "会议", "排期", "交付", "合作", "协作", "产品", "技术", "搜索", "推荐", "模型", "策略"],
    "沟通反馈": ["聊", "说", "问", "反馈", "提醒", "建议", "沟通", "交流", "评价", "夸", "批评", "骂"],
    "关系边界": ["冲突", "矛盾", "压力", "焦虑", "难受", "失望", "抱怨", "边界", "信任", "利益", "风险", "不满", "误解", "怼", "拒绝", "翻脸", "分寸", "改变别人", "保留判断", "抵触", "离职", "瓜分", "遥控", "投诉"],
    "私人互动": ["吃饭", "聚", "喝", "玩", "婚礼", "结婚", "伴郎", "旅行", "家里", "生日", "送", "朋友", "出差", "见面"],
}


@dataclass
class Evidence:
    date: str
    category: str
    source_path: str
    source_title: str
    snippet: str
    matched_names: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect raw-note evidence for person pages.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--person", help="Canonical person name.")
    target.add_argument("--page", help="Existing person page path; name and aliases are parsed from it.")
    target.add_argument("--all", action="store_true", help="Collect summaries for all known-person pages.")
    parser.add_argument("--aliases", default="", help="Comma/Chinese-comma separated aliases.")
    parser.add_argument("--people-root", default="wiki/07 人物与城市/人物/认识的人")
    parser.add_argument("--raw-dir", action="append", default=[], help="Raw note directory. Can repeat.")
    parser.add_argument("--format", choices=["json", "summary"], default="json", help="Stdout format.")
    parser.add_argument("--max-per-person", type=int, default=240)
    return parser.parse_args()


def split_frontmatter(text: str) -> tuple[str, str]:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[: end + 4], text[end + 4 :].lstrip("\n")
    return "", text


def aliases_from_frontmatter(text: str) -> list[str]:
    fm, _ = split_frontmatter(text)
    aliases: list[str] = []
    match = ALIAS_INLINE_RE.search(fm)
    if not match:
        return aliases
    rest = match.group(1).strip()
    if rest.startswith("[") and rest.endswith("]"):
        aliases.extend(x.strip().strip("\"'") for x in re.split(r"[,，]", rest[1:-1]) if x.strip())
    else:
        for line in fm[match.end() :].splitlines():
            if line.startswith("  - "):
                aliases.append(line[4:].strip().strip("\"'"))
            elif line.strip() and not line.startswith(" "):
                break
    return normalize_names(aliases)


def normalize_names(names: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for name in names:
        n = name.strip().strip("`\"' ")
        if not n or len(n) <= 1 or n in GENERIC_ALIASES or n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


def person_from_page(path: Path) -> tuple[str, list[str]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    return path.stem, aliases_from_frontmatter(text)


def strip_generated_sections(text: str) -> str:
    _, body = split_frontmatter(text)
    kept: list[str] = []
    skip = False
    for line in body.splitlines():
        stripped = line.strip()
        if re.match(r"^##\s*(相关日记|关联|状态追踪)\b", stripped):
            skip = True
            continue
        if skip and stripped.startswith("## "):
            skip = False
        if skip:
            continue
        if stripped.startswith(("- 主题/", "- 实体/", "- 日记/", "- 来源/", "- 类型/", "- 索引/", "- 阶段/")):
            continue
        kept.append(line)
    return "\n".join(kept)


def is_latin(name: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_.-]+", name))


def find_matches(text: str, names: list[str]) -> list[str]:
    hits: list[str] = []
    for name in names:
        if is_latin(name):
            if re.search(r"(?<![A-Za-z0-9_.-])" + re.escape(name) + r"(?![A-Za-z0-9_.-])", text, re.I):
                hits.append(name)
        elif name in text:
            hits.append(name)
    return hits


def date_from(path: Path, text: str) -> str:
    match = DATE_RE.search(path.stem + " " + text[:80])
    if not match:
        return ""
    year, month, day = match.groups()
    if month and day:
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    if month:
        return f"{int(year):04d}-{int(month):02d}"
    return year


def split_sentences(text: str) -> list[str]:
    clean = re.sub(r"```.*?```", "", text, flags=re.S)
    clean = re.sub(r"\s+", " ", clean)
    parts = re.split(r"(?<=[。！？!?])\s*", clean)
    return [p.strip() for p in parts if p.strip()]


def compact(text: str, limit: int = 240) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "..."


def bad_snippet(text: str) -> bool:
    stripped = text.strip()
    return (
        len(stripped) < 10
        or stripped.startswith(("---", "##", "]]"))
        or stripped.count("[[") > 5
        or "tags:" in stripped
    )


def category_for(snippet: str) -> str:
    scores: Counter[str] = Counter()
    lower = snippet.lower()
    for category, words in CATEGORY_WORDS.items():
        for word in words:
            if word.lower() in lower:
                scores[category] += 1
    if not scores:
        return "一般记录"
    order = ["关系边界", "沟通反馈", "业务协作", "组织位置", "私人互动", "一般记录"]
    return max(scores, key=lambda key: (scores[key], -order.index(key) if key in order else -99))


def collect_for_person(name: str, aliases: list[str], raw_dirs: list[Path], max_items: int) -> list[Evidence]:
    names = normalize_names([name] + aliases)
    evidence: list[Evidence] = []
    seen: set[tuple[str, str]] = set()
    for raw_dir in raw_dirs:
        if not raw_dir.exists():
            continue
        for path in sorted(raw_dir.rglob("*.md")):
            text = path.read_text(encoding="utf-8", errors="ignore")
            body = strip_generated_sections(text)
            matches_in_doc = find_matches(body, names)
            if not matches_in_doc:
                continue
            date = date_from(path, body)
            for sentence in split_sentences(body):
                matched_names = find_matches(sentence, names)
                if not matched_names or bad_snippet(sentence):
                    continue
                snippet = compact(sentence)
                key = (str(path), snippet)
                if key in seen:
                    continue
                seen.add(key)
                source_rel = path.resolve().relative_to(ROOT).as_posix()
                evidence.append(
                    Evidence(
                        date=date,
                        category=category_for(snippet),
                        source_path=source_rel,
                        source_title=path.stem,
                        snippet=snippet,
                        matched_names=matched_names,
                    )
                )
                if len(evidence) >= max_items:
                    return sorted(evidence, key=lambda item: (item.date or "9999", item.source_path))
    return sorted(evidence, key=lambda item: (item.date or "9999", item.source_path))


def bundle_data(name: str, aliases: list[str], evidence: list[Evidence]) -> dict[str, object]:
    names = normalize_names([name] + aliases)
    sources = sorted({item.source_path for item in evidence})
    counts = Counter(item.category for item in evidence)
    return {
        "name": name,
        "aliases": aliases,
        "search_names": names,
        "evidence_count": len(evidence),
        "source_count": len(sources),
        "category_counts": dict(counts),
        "sources": sources,
        "evidence": [asdict(item) for item in evidence],
    }


def collect_targets(args: argparse.Namespace) -> list[tuple[str, list[str]]]:
    if args.person:
        aliases = normalize_names(re.split(r"[,，]", args.aliases) if args.aliases else [])
        return [(args.person, aliases)]
    if args.page:
        return [person_from_page(Path(args.page))]
    people_root = Path(args.people_root)
    targets: list[tuple[str, list[str]]] = []
    for page in sorted(people_root.rglob("*.md")):
        if page.name in {"自己.md", "同学与同辈总览.md"}:
            continue
        targets.append(person_from_page(page))
    return targets


def main() -> None:
    args = parse_args()
    raw_dirs = [Path(p) for p in (args.raw_dir or DEFAULT_RAW_DIRS)]
    summary: list[dict[str, object]] = []
    payloads: list[dict[str, object]] = []
    for name, aliases in collect_targets(args):
        evidence = collect_for_person(name, aliases, raw_dirs, args.max_per_person)
        data = bundle_data(name, aliases, evidence)
        payloads.append(data)
        summary.append(
            {
                "name": name,
                "aliases": aliases,
                "evidence_count": data["evidence_count"],
                "source_count": data["source_count"],
                "category_counts": data["category_counts"],
            }
        )
        if not args.all:
            if args.format == "json":
                print(json.dumps(data, ensure_ascii=False, indent=2))
            else:
                print(json.dumps(summary[-1], ensure_ascii=False, indent=2))
            return
    if args.format == "json":
        print(json.dumps(payloads, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
