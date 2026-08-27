#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import collections
import datetime as dt
import os
import re
import tempfile
from pathlib import Path

from vault_context import KNOWLEDGE_BASE_ROOT


ROOT = KNOWLEDGE_BASE_ROOT
DIARY_DIRS = [
    ROOT / "原始知识库" / "日记2013-2017",
    ROOT / "原始知识库" / "日记2018-2023",
    ROOT / "原始知识库" / "日记2024至今",
]
WIKI_ENTITY_ROOT = ROOT / "wiki" / "07 人物与城市"
WIKI_PERSON_ROOT = WIKI_ENTITY_ROOT / "人物"
OUT = ROOT / "wiki" / "08 来源索引" / "日记实体抽取索引.md"


CITY_TERMS = [
    "庞口", "高阳", "高阳县", "保定", "保定市", "哈尔滨", "南京", "杭州", "北京",
    "上海", "深圳", "日本", "瑞典", "云南", "西湖", "河北", "广州", "成都", "武汉",
    "西安", "苏州", "无锡", "天津", "香港", "澳门", "重庆", "厦门", "青岛", "宁波",
    "长沙", "郑州", "海南", "东京", "大阪", "京都", "名古屋",
]

ORG_PROJECT_TERMS = [
    "科协", "华为", "字节", "阿里", "阿里云", "腾讯", "百度", "中兴", "海思",
    "DataTalks", "Databot", "Sophon", "sophon", "deerflow", "Claude", "claude",
    "ChatGPT", "U2000", "IPMaster", "MDE", "TRIZ", "飞书", "数据平台", "知识中心",
    "大模型", "多维表格", "云启", "活水",
]

PERSON_CONTEXT_RE = re.compile(
    r"(?P<name>[一-龥A-Za-z]{1,3}|[A-Za-z]{2,4})(?P<title>老师|学长|学姐|师兄|师姐|同学|书记|主管|leader|总)"
)
LOWER_ALIAS_RE = re.compile(r"(?<![A-Za-z])([a-z]{2,4})(?![A-Za-z])")
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]")
ASCII_ENTITY_RE = re.compile(r"(?<![A-Za-z0-9]){term}(?![A-Za-z0-9])")
DATE_PREFIX_RE = re.compile(r"^(?P<year>20\d{2})[.\-](?P<month>\d{1,2})[.\-](?P<day>\d{1,2})")

SURNAMES = set("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查後荆红游竺权逯盖益桓公")

STOP_NAMES = {
    "自己", "别人", "大家", "有人", "一个人", "这个人", "普通人", "年轻人", "成年人",
    "女朋友", "男朋友", "父母", "家人", "同事", "领导", "主管", "老师", "学长", "同学",
    "孩子", "宝宝", "女儿", "老婆", "母亲", "父亲", "奶奶", "姥姥", "姥爷",
}


def strip_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            return text[end + 5 :]
    return text


def title_for(path: Path) -> str:
    return path.stem


def wiki_link(path: Path, label: str | None = None) -> str:
    rel = path.relative_to(ROOT).with_suffix("").as_posix()
    return f"[[{rel}|{label or path.stem}]]"


def load_existing_people() -> set[str]:
    names: set[str] = set()
    for path in WIKI_PERSON_ROOT.rglob("*.md"):
        names.add(path.stem)
        text = path.read_text(encoding="utf-8")
        if text.startswith("---\n"):
            end = text.find("\n---\n", 4)
            if end != -1:
                fm = text[:end]
                alias_match = re.search(r"^aliases:\n(?P<body>(?:\s+- .+\n)*)", fm, re.MULTILINE)
                alias_body = alias_match.group("body") if alias_match else ""
                for alias in re.findall(r'^\s*-\s+"?([^"\n]+)"?\s*$', alias_body, re.MULTILINE):
                    if alias:
                        names.add(alias.strip())
    return names


def add_hit(bucket, entity: str, path: Path, line_no: int, line: str) -> None:
    if entity in STOP_NAMES:
        return
    bucket[entity].append((path, line_no, line.strip()))


def term_in_line(term: str, line: str) -> bool:
    if re.fullmatch(r"[A-Za-z0-9]+", term):
        return re.search(ASCII_ENTITY_RE.pattern.format(term=re.escape(term)), line) is not None
    return term in line


def clean_person_candidate(name: str, title: str) -> str | None:
    if re.fullmatch(r"[A-Za-z]{2,4}", name):
        return name + title
    name = name[-3:]
    while name and name[0] not in SURNAMES:
        name = name[1:]
    if not name:
        return None
    candidate = name + title
    if candidate in STOP_NAMES:
        return None
    return candidate


def scan_diary(path: Path, existing_people: set[str]):
    text = strip_frontmatter(path.read_text(encoding="utf-8"))
    buckets = {
        "known_people": collections.defaultdict(list),
        "candidate_people": collections.defaultdict(list),
        "cities": collections.defaultdict(list),
        "org_projects": collections.defaultdict(list),
        "wikilinks": collections.defaultdict(list),
    }

    for line_no, line in enumerate(text.splitlines(), 1):
        if line.strip().startswith("- [[日记索引"):
            continue
        for raw, alias in WIKILINK_RE.findall(line):
            name = (alias or Path(raw).stem).strip()
            add_hit(buckets["wikilinks"], name, path, line_no, line)

        for name in existing_people:
            if len(name) >= 2 and name in line:
                add_hit(buckets["known_people"], name, path, line_no, line)

        for city in CITY_TERMS:
            if city in line:
                add_hit(buckets["cities"], city, path, line_no, line)

        for term in ORG_PROJECT_TERMS:
            if term_in_line(term, line):
                add_hit(buckets["org_projects"], term, path, line_no, line)

        for m in PERSON_CONTEXT_RE.finditer(line):
            name = clean_person_candidate(m.group("name"), m.group("title"))
            if name and 2 <= len(name) <= 6:
                add_hit(buckets["candidate_people"], name, path, line_no, line)

        for m in LOWER_ALIAS_RE.finditer(line):
            alias = m.group(1)
            if alias in {"xm", "yl", "zz"}:
                add_hit(buckets["candidate_people"], alias, path, line_no, line)

    return buckets


def merge(all_buckets, diary_buckets):
    for key, bucket in diary_buckets.items():
        for entity, hits in bucket.items():
            all_buckets[key][entity].extend(hits)


def summarize(bucket, limit=80, min_docs=1):
    rows = []
    for entity, hits in bucket.items():
        docs = sorted({h[0] for h in hits}, key=lambda p: p.as_posix())
        if len(docs) < min_docs:
            continue
        rows.append((entity, len(docs), len(hits), docs, hits))
    rows.sort(key=lambda r: (-r[1], -r[2], r[0]))
    return rows[:limit]


def sample_hits(hits, n=3):
    seen = set()
    out = []
    for path, line_no, line in hits:
        if path in seen:
            continue
        seen.add(path)
        out.append(f"{wiki_link(path)}:{line_no}")
        if len(out) >= n:
            break
    return "；".join(out)


def render_table(title: str, rows, include_samples=True) -> list[str]:
    lines = [f"## {title}", "", "| 实体 | 覆盖日记数 | 命中次数 | 样例来源 |", "|---|---:|---:|---|"]
    for entity, doc_count, hit_count, docs, hits in rows:
        samples = sample_hits(hits) if include_samples else "；".join(wiki_link(p) for p in docs[:3])
        lines.append(f"| {entity} | {doc_count} | {hit_count} | {samples} |")
    lines.append("")
    return lines


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check or regenerate the diary entity extraction index."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check",
        action="store_true",
        help="Compare generated content without writing (default).",
    )
    mode.add_argument(
        "--write",
        action="store_true",
        help="Atomically update the generated index when content changed.",
    )
    return parser.parse_args()


def coverage_end(diaries: list[Path]) -> str:
    dates = []
    for path in diaries:
        match = DATE_PREFIX_RE.match(path.stem)
        if not match:
            continue
        try:
            dates.append(
                dt.date(
                    int(match.group("year")),
                    int(match.group("month")),
                    int(match.group("day")),
                )
            )
        except ValueError:
            continue
    return max(dates).isoformat() if dates else "2013-06-02"


def split_document(text: str) -> tuple[str, str]:
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end >= 0:
            return text[: end + 5], text[end + 5 :]
    return "", text


def apply_generated_output(path: Path, content: str, *, write: bool) -> bool:
    current = path.read_text(encoding="utf-8") if path.exists() else None
    generated_frontmatter, generated_body = split_document(content)
    current_frontmatter, current_body = split_document(current or "")
    if current is not None and current_body == generated_body:
        print(f"up_to_date {path.relative_to(ROOT)}")
        return False
    if not write:
        print(f"stale {path.relative_to(ROOT)}")
        return True

    final_content = (current_frontmatter or generated_frontmatter) + generated_body
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(final_content)
        target_mode = (path.stat().st_mode & 0o777) if path.exists() else 0o644
        os.chmod(tmp_name, target_mode)
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise
    print(f"wrote {path.relative_to(ROOT)}")
    return True


def main() -> int:
    args = parse_args()
    existing_people = load_existing_people()
    all_buckets = {
        "known_people": collections.defaultdict(list),
        "candidate_people": collections.defaultdict(list),
        "cities": collections.defaultdict(list),
        "org_projects": collections.defaultdict(list),
        "wikilinks": collections.defaultdict(list),
    }
    diaries = []
    for d in DIARY_DIRS:
        diaries.extend(sorted(p for p in d.glob("*.md") if p.is_file()))

    for path in diaries:
        merge(all_buckets, scan_diary(path, existing_people))

    existing_person_names = existing_people
    candidate_rows = []
    for row in summarize(all_buckets["candidate_people"], limit=140, min_docs=1):
        entity = row[0]
        if entity not in existing_person_names:
            candidate_rows.append(row)

    end_date = coverage_end(diaries)
    lines = [
        "---",
        'type: "source_index"',
        "aliases:",
        '  - "日记实体抽取索引"',
        "tags:",
        '  - "wiki/索引"',
        '  - "来源/wiki"',
        '  - "类型/wiki"',
        '  - "索引/日记"',
        'status: "active"',
        f"Start: 2013-06-02",
        f"end: {end_date}",
        "location: []",
        "source:",
        '  - "原始知识库/日记2013-2017"',
        '  - "原始知识库/日记2018-2023"',
        '  - "原始知识库/日记2024至今"',
        "---",
        "# 日记实体抽取索引",
        "",
        f"本页由 `knowledge-engine/tools/diary_entity_audit.py` 从 {len(diaries)} 篇原始日记逐篇扫描生成，用来发现尚未沉淀到人物、城市、组织和项目页中的实体线索。",
        "",
        "抽取规则偏保守：优先记录已有实体、显式 wiki-link、城市词表、组织/项目词表，以及带有老师、学长、同学、书记、主管、leader 等上下文的人物候选。候选人物需要人工复核后再建实体页。",
        "",
    ]
    lines += render_table("已有实体人物在日记中的覆盖", summarize(all_buckets["known_people"], limit=100, min_docs=2))
    lines += render_table("待复核人物候选", candidate_rows[:100])
    lines += render_table("城市与地点候选", summarize(all_buckets["cities"], limit=80, min_docs=1))
    lines += render_table("组织与项目候选", summarize(all_buckets["org_projects"], limit=80, min_docs=1))
    changed = apply_generated_output(OUT, "\n".join(lines), write=args.write)
    print(f"diaries={len(diaries)}")
    print(f"candidate_people={len(candidate_rows)} cities={len(all_buckets['cities'])} org_projects={len(all_buckets['org_projects'])}")
    return 1 if changed and not args.write else 0


if __name__ == "__main__":
    raise SystemExit(main())
