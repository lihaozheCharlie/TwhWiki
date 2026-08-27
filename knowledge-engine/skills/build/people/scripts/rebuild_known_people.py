#!/usr/bin/env python3
"""Rebuild known-person pages from in-memory per-person evidence.

The output is intentionally substantive: relationship development is written as
evidence-backed phases, never as category-count summaries.
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


WORKSPACE_ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(WORKSPACE_ROOT / "knowledge-engine" / "tools"))
from vault_context import KNOWLEDGE_BASE_ROOT  # noqa: E402

ROOT = KNOWLEDGE_BASE_ROOT
PEOPLE_ROOT = ROOT / "wiki/07 人物与城市/人物/认识的人"
COLLECTOR_PATH = WORKSPACE_ROOT / "knowledge-engine/skills/build/people/scripts/collect_person_evidence.py"

EXCLUDE = {"自己.md", "同学与同辈总览.md"}
DOMAIN_LABELS = {
    "工作": "工作关系",
    "室友": "室友/长期同辈",
    "亲人": "亲人/家庭关系",
    "同学与同辈": "同学与同辈",
    "朋友": "朋友关系",
    "科协": "科协关系",
}
HIGH_IMPACT_NAMES = {"老婆", "女儿", "母亲", "父亲"}


def load_collector():
    spec = importlib.util.spec_from_file_location("collect_person_evidence", COLLECTOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load collector: {COLLECTOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


collector = load_collector()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rebuild known-person pages from evidence.")
    parser.add_argument("--people-root", default=str(PEOPLE_ROOT))
    parser.add_argument("--only", help="Only rebuild one page path or person name.")
    parser.add_argument("--max-per-person", type=int, default=260)
    parser.add_argument("--max-episodes", type=int, default=10)
    return parser.parse_args()


def split_frontmatter(text: str) -> tuple[str, str]:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[: end + 4].strip(), text[end + 4 :].lstrip("\n")
    return "", text


def aliases_from_frontmatter(text: str) -> list[str]:
    return collector.aliases_from_frontmatter(text)


def replace_source_frontmatter(fm: str, sources: list[str]) -> str:
    lines = fm.splitlines()
    if not lines:
        lines = ["---", 'type: "entity"', "status: \"active\"", "---"]
    out: list[str] = []
    i = 0
    replaced = False
    while i < len(lines):
        line = lines[i]
        if line.startswith("source:"):
            out.append("source:")
            out.extend(f'  - "{src.removesuffix(".md")}"' for src in sources)
            replaced = True
            i += 1
            while i < len(lines) and lines[i].startswith("  - "):
                i += 1
            continue
        out.append(line)
        i += 1
    if not replaced:
        insert_at = len(out) - 1 if out and out[-1] == "---" else len(out)
        out[insert_at:insert_at] = ["source:"] + [f'  - "{src.removesuffix(".md")}"' for src in sources]
    return "\n".join(out)


def replace_scalar_frontmatter(fm: str, key: str, value: str) -> str:
    lines = fm.splitlines()
    out: list[str] = []
    replaced = False
    for line in lines:
        if line.startswith(f"{key}:"):
            out.append(f"{key}: {value}")
            replaced = True
        else:
            out.append(line)
    if not replaced and value:
        insert_at = len(out) - 1 if out and out[-1] == "---" else len(out)
        out.insert(insert_at, f"{key}: {value}")
    return "\n".join(out)


def set_status_frontmatter(fm: str, evidence_count: int) -> str:
    return replace_scalar_frontmatter(fm, "status", '"active"' if evidence_count else '"seed"')


def display_aliases(name: str, aliases: list[str]) -> list[str]:
    return [alias for alias in aliases if alias != name]


def domain_for(page: Path) -> str:
    rel = page.resolve().relative_to(PEOPLE_ROOT)
    return rel.parts[0] if len(rel.parts) > 1 else "认识的人"


def domain_label(domain: str) -> str:
    return DOMAIN_LABELS.get(domain, domain)


def source_link(src: str) -> str:
    path = Path(src)
    stem = path.stem
    return f"[[{path.with_suffix('').as_posix()}|{stem}]]"


def compact(text: str, limit: int = 110) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1] + "..."


def clean_event(snippet: str, name: str, aliases: list[str]) -> str:
    text = snippet.replace("\\|", "|")
    text = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    return compact(text, 150)


def finish_sentence(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    return text if text.endswith(("。", "！", "？", "...", "…")) else text + "。"


def category_order(category: str) -> int:
    order = {
        "关系边界": 0,
        "组织位置": 1,
        "业务协作": 2,
        "沟通反馈": 3,
        "私人互动": 4,
        "一般记录": 5,
    }
    return order.get(category, 9)


def pick_episodes(evidence: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in evidence:
        by_category[item["category"]].append(item)
    picked: list[dict[str, Any]] = []
    for category in sorted(by_category, key=category_order):
        rows = by_category[category]
        if not rows:
            continue
        candidates = [rows[0]]
        if len(rows) > 2:
            candidates.append(rows[len(rows) // 2])
        if len(rows) > 1:
            candidates.append(rows[-1])
        for item in candidates:
            if item not in picked:
                picked.append(item)
    picked.sort(key=lambda item: (item.get("date") or "9999", category_order(item["category"])))
    return picked[:limit]


def pick_first(evidence: list[dict[str, Any]], categories: set[str] | None = None) -> dict[str, Any] | None:
    rows = [item for item in evidence if categories is None or item["category"] in categories]
    if not rows:
        return None
    return rows[0]


def pick_last(evidence: list[dict[str, Any]], categories: set[str] | None = None) -> dict[str, Any] | None:
    rows = [item for item in evidence if categories is None or item["category"] in categories]
    if not rows:
        return None
    return rows[-1]


def relationship_process(name: str, aliases: list[str], evidence: list[dict[str, Any]], domain: str) -> list[str]:
    lines: list[str] = []
    first = pick_first(evidence)
    if first:
        lines.append(
            f"- 最早交集：{first['date']} 的记录里，{clean_event(first['snippet'], name, aliases)}（{source_link(first['source_path'])}）。"
        )
    work_core = pick_first(evidence, {"业务协作", "组织位置"})
    if work_core:
        if domain == "工作":
            lines.append(
                f"- 工作推进：后续关系主要进入具体业务和组织协作场景，代表事件是 {clean_event(work_core['snippet'], name, aliases)}（{source_link(work_core['source_path'])}）。"
            )
        else:
            lines.append(
                f"- 事务交集：后续关系有共同处理事务的记录，代表事件是 {clean_event(work_core['snippet'], name, aliases)}（{source_link(work_core['source_path'])}）。"
            )
    comm = pick_first(evidence, {"沟通反馈"})
    if comm and comm is not first:
        lines.append(
            f"- 沟通方式：这段关系里有明确对话或反馈场景，例如 {clean_event(comm['snippet'], name, aliases)}（{source_link(comm['source_path'])}）。"
        )
    boundary = pick_last(evidence, {"关系边界"})
    if boundary:
        label = "关键转折" if domain == "工作" else "关系边界"
        lines.append(
            f"- {label}：后来的记录显示这段关系触及边界和判断问题，典型证据是 {clean_event(boundary['snippet'], name, aliases)}（{source_link(boundary['source_path'])}）。"
        )
    private = pick_first(evidence, {"私人互动"})
    if private:
        lines.append(
            f"- 生活侧记：除正式关系外，也有生活或非正式互动，如 {clean_event(private['snippet'], name, aliases)}（{source_link(private['source_path'])}）。"
        )
    latest = pick_last(evidence)
    if latest and latest is not first:
        lines.append(
            f"- 近期状态：最新可见证据是 {latest['date']} 的 {clean_event(latest['snippet'], name, aliases)}（{source_link(latest['source_path'])}）。"
        )
    # Deduplicate by text prefix.
    dedup: list[str] = []
    seen = set()
    for line in lines:
        key = re.sub(r"（.*?）", "", line)
        if key not in seen:
            seen.add(key)
            dedup.append(line)
    return dedup[:5]


def core_position(name: str, aliases: list[str], evidence: list[dict[str, Any]], domain: str) -> str:
    first = pick_first(evidence)
    boundary = pick_last(evidence, {"关系边界"})
    work = pick_first(evidence, {"业务协作", "组织位置"})
    private = pick_first(evidence, {"私人互动"})
    if domain == "工作" and boundary:
        return f"{name}是职业阶段的重要工作关系，既涉及业务/组织协作，也在后期暴露出责任边界和组织判断问题。"
    if domain == "工作" and work:
        return f"{name}是职业阶段的工作关系，主要通过具体业务协作、信息沟通和组织场景留下证据。"
    if domain in {"室友", "同学与同辈", "科协"} and private:
        return f"{name}是{domain_label(domain)}中的长期关系节点，证据集中在共同经历、生活互动和阶段性关系反馈。"
    if domain == "亲人":
        return f"{name}是家庭系统里的关系支点，证据集中在共同生活、家庭责任和情绪边界上。"
    if first:
        return f"{name}是{domain_label(domain)}中的关系节点，目前可确认的核心证据是：{finish_sentence(clean_event(first['snippet'], name, aliases))}"
    return f"{name}是{domain_label(domain)}中的关系节点。"


def impact_for(item: dict[str, Any], domain: str) -> str:
    cat = item["category"]
    if cat == "关系边界":
        if domain == "工作":
            return "改变了对组织责任、信任边界或利益结构的判断。"
        return "提供了理解表达分寸、关系边界或长期相处方式的证据。"
    if cat == "组织位置":
        return "帮助判断他在组织结构、责任链或团队关系中的位置。"
    if cat == "业务协作":
        return "记录了具体协作、项目推进或共同处理事务的方式。"
    if cat == "沟通反馈":
        return "呈现了双方沟通、提醒、评价或反馈的实际场景。"
    if cat == "私人互动":
        return "补充了这段关系的生活侧面和情感温度。"
    return "提供了关系存在、阶段位置或后续判断的背景证据。"


def tier_for(name: str, evidence: list[dict[str, Any]], domain: str) -> str:
    count = len(evidence)
    cats = Counter(item["category"] for item in evidence)
    if count == 0:
        return "seed"
    if name in HIGH_IMPACT_NAMES:
        return "high-impact"
    if count >= 12:
        return "high-impact"
    if domain == "亲人" and count >= 8:
        return "high-impact"
    if domain == "工作" and count >= 8 and (cats.get("关系边界", 0) or cats.get("组织位置", 0)):
        return "high-impact"
    if domain in {"室友", "科协"} and count >= 8:
        return "high-impact"
    return "standard"


def relationship_function(evidence: list[dict[str, Any]], domain: str) -> str:
    cats = Counter(item["category"] for item in evidence)
    if domain == "工作":
        if cats.get("关系边界", 0) or cats.get("组织位置", 0):
            return "组织信号源 / 责任边界样本"
        if cats.get("业务协作", 0):
            return "业务协作关系"
        if cats.get("沟通反馈", 0):
            return "沟通方式参照"
        return "工作关系线索"
    if domain == "亲人":
        return "家庭系统关系支点"
    if domain in {"室友", "同学与同辈", "科协"}:
        if cats.get("关系边界", 0):
            return "阶段关系参照 / 表达边界提醒"
        if cats.get("私人互动", 0):
            return "阶段陪伴与共同经历"
        if cats.get("沟通反馈", 0):
            return "沟通方式参照"
        return "校园/同辈关系线索"
    return f"{domain_label(domain)}线索"


def evidence_bullet(item: dict[str, Any], name: str, aliases: list[str], domain: str) -> str:
    event = clean_event(item["snippet"], name, aliases)
    impact = impact_for(item, domain).rstrip("。")
    return f"- {item['date'] or '未标年'}：{event}（{source_link(item['source_path'])}）。影响：{impact}。"


def seed_body(page: Path, name: str, aliases: list[str]) -> str:
    domain = domain_for(page)
    label = domain_label(domain)
    visible_aliases = display_aliases(name, aliases)
    lines: list[str] = [f"# {name}", "", "## 核心定位", ""]
    lines.append(f"{name}是{label}中的消歧节点；当前没有足够原始日记证据展开关系判断。")
    lines.extend(["", "## 已知信息", ""])
    lines.append(f"- 关系领域：{label}")
    if visible_aliases:
        lines.append(f"- 别名：{'、'.join(visible_aliases)}")
    lines.append("- 证据状态：轻量人物；只保留身份和索引功能。")
    lines.extend(["", "## 关联", ""])
    lines.append("- 相关索引：[[wiki/07 人物与城市/人物/人物总览|人物总览]]")
    return "\n".join(lines).rstrip() + "\n"


def standard_body(page: Path, name: str, aliases: list[str], data: dict[str, Any], max_episodes: int) -> str:
    evidence = data["evidence"]
    domain = domain_for(page)
    label = domain_label(domain)
    visible_aliases = display_aliases(name, aliases)
    episodes = pick_episodes(evidence, min(max_episodes, 6))
    lines: list[str] = [f"# {name}", "", "## 核心判断", ""]
    lines.append(core_position(name, aliases, evidence, domain))
    lines.extend(["", "## 关键证据", ""])
    for item in episodes:
        lines.append(evidence_bullet(item, name, aliases, domain))
    lines.extend(["", "## 关系功能", ""])
    lines.append(f"- 关系领域：{label}")
    if visible_aliases:
        lines.append(f"- 别名：{'、'.join(visible_aliases)}")
    lines.append(f"- 功能判断：{relationship_function(evidence, domain)}。")
    lines.extend(["", "## 关联", ""])
    lines.append("- 相关索引：[[wiki/07 人物与城市/人物/人物总览|人物总览]]")
    if domain == "工作":
        lines.append("- 关联组织：工作相关组织")
    lines.append(f"- 原始来源：见 frontmatter `source`，共 {len(data['sources'])} 条。")
    return "\n".join(lines).rstrip() + "\n"


def phase_lines(name: str, aliases: list[str], evidence: list[dict[str, Any]], domain: str) -> list[str]:
    lines = relationship_process(name, aliases, evidence, domain)
    return lines or [evidence_bullet(item, name, aliases, domain) for item in pick_episodes(evidence, 3)]


def high_impact_body(page: Path, name: str, aliases: list[str], data: dict[str, Any], max_episodes: int) -> str:
    evidence = data["evidence"]
    domain = domain_for(page)
    label = domain_label(domain)
    visible_aliases = display_aliases(name, aliases)
    lines: list[str] = [f"# {name}", "", "## 核心判断", ""]
    lines.append(core_position(name, aliases, evidence, domain))
    lines.extend(["", "## 关系演化", ""])
    lines.extend(phase_lines(name, aliases, evidence, domain))
    lines.extend(["", "## 关键事件", ""])
    for item in pick_episodes(evidence, min(max_episodes, 10)):
        lines.append(evidence_bullet(item, name, aliases, domain))
    cognition = stable_cognition(name, aliases, evidence, domain)
    if cognition:
        lines.extend(["", "## 稳定认知", ""])
        lines.extend(cognition)
    notes = interaction_notes(evidence, domain)
    if notes:
        lines.extend(["", "## 相处原则", ""])
        lines.extend(notes)
    lines.extend(["", "## 关联", ""])
    lines.append(f"- 关系领域：{label}")
    if visible_aliases:
        lines.append(f"- 别名：{'、'.join(visible_aliases)}")
    lines.append(f"- 功能判断：{relationship_function(evidence, domain)}。")
    if domain == "工作":
        lines.append("- 关联组织：工作相关组织")
    lines.append(f"- 原始来源：见 frontmatter `source`，共 {len(data['sources'])} 条。")
    return "\n".join(lines).rstrip() + "\n"


def stable_cognition(name: str, aliases: list[str], evidence: list[dict[str, Any]], domain: str) -> list[str]:
    lines: list[str] = []
    comm = pick_first(evidence, {"沟通反馈"})
    if comm:
        lines.append(f"- 沟通方式：更适合围绕具体事和具体反馈理解这个人；证据是 {clean_event(comm['snippet'], name, aliases)}（{source_link(comm['source_path'])}）。")
    work = pick_first(evidence, {"业务协作", "组织位置"})
    if work and domain == "工作":
        lines.append(f"- 做事 / 组织风格：他在记录中经常和业务推进、团队规划或责任分配连在一起；代表证据是 {clean_event(work['snippet'], name, aliases)}（{source_link(work['source_path'])}）。")
    elif work:
        lines.append(f"- 做事风格：可从共同处理事务的细节观察，而不是抽象评价；代表证据是 {clean_event(work['snippet'], name, aliases)}（{source_link(work['source_path'])}）。")
    boundary = pick_last(evidence, {"关系边界"})
    if boundary:
        if domain == "工作":
            text = "局限 / 风险：和他相关的后期证据需要放进组织利益、责任链和信任边界里判断"
        elif domain == "亲人":
            text = "关系边界：相关证据更适合放进家庭责任、情绪表达和长期相处里判断"
        else:
            text = "关系边界：相关证据提醒后续相处要注意表达分寸和判断边界"
        lines.append(f"- {text}；代表证据是 {clean_event(boundary['snippet'], name, aliases)}（{source_link(boundary['source_path'])}）。")
    private = pick_first(evidence, {"私人互动"})
    if private:
        lines.append(f"- 情感温度：这段关系不只是名单或任务关系，也有生活现场；证据是 {clean_event(private['snippet'], name, aliases)}（{source_link(private['source_path'])}）。")
    return lines


def relationship_value(name: str, aliases: list[str], evidence: list[dict[str, Any]], domain: str) -> list[str]:
    lines: list[str] = []
    work = pick_first(evidence, {"业务协作", "组织位置"})
    boundary = pick_last(evidence, {"关系边界"})
    private = pick_first(evidence, {"私人互动"})
    comm = pick_first(evidence, {"沟通反馈"})
    if work and domain == "工作":
        lines.append("- 合作价值：这段关系帮助还原当时的业务推进、组织责任和团队信息流。")
    elif work:
        lines.append("- 事务价值：这段关系提供了共同处理事情、互相配合或阶段性互相参照的证据。")
    if comm:
        lines.append("- 学到的东西：这段关系提供了真实沟通、反馈和判断方式的样本。")
    if boundary:
        if domain == "工作":
            lines.append("- 对我的影响：相关边界事件推动你更重视选择权、留痕、责任链和外部机会。")
        else:
            lines.append("- 对我的影响：相关边界事件推动你更重视表达分寸、关系边界和长期相处方式。")
    if private:
        lines.append("- 情感价值：生活互动说明这段关系有具体场景和情绪记忆，不只是抽象关系。")
    return lines


def interaction_notes(evidence: list[dict[str, Any]], domain: str) -> list[str]:
    cats = {item["category"] for item in evidence}
    lines: list[str] = []
    if "沟通反馈" in cats:
        lines.append("- 适合的沟通方式：围绕具体事实、具体场景和下一步动作沟通。")
    if "关系边界" in cats:
        if domain == "工作":
            lines.append("- 重要边界：涉及 scope、绩效、资源、责任归属时，先拆清事实、责任链和利益结构。")
        elif domain == "亲人":
            lines.append("- 重要边界：涉及家庭观念或情绪表达时，区分事实、感受和长期责任。")
        else:
            lines.append("- 重要边界：涉及评价、玩笑或关系分歧时，保留判断但避免急于改变对方。")
    if domain == "工作" and ("业务协作" in cats or "组织位置" in cats):
        lines.append("- 合作偏好：明确目标、责任人、时间点和结果标准。")
    return lines


def build_body(page: Path, name: str, aliases: list[str], data: dict[str, Any], max_episodes: int) -> str:
    evidence = data["evidence"]
    tier = tier_for(name, evidence, domain_for(page))
    if tier == "seed":
        return seed_body(page, name, aliases)
    if tier == "high-impact":
        return high_impact_body(page, name, aliases, data, max_episodes)
    return standard_body(page, name, aliases, data, max_episodes)


def rebuild_page(page: Path, args: argparse.Namespace) -> bool:
    text = page.read_text(encoding="utf-8")
    fm, _ = split_frontmatter(text)
    name = page.stem
    aliases = aliases_from_frontmatter(text)
    raw_dirs = [Path(p) for p in collector.DEFAULT_RAW_DIRS]
    evidence = collector.collect_for_person(name, aliases, raw_dirs, args.max_per_person)
    data = collector.bundle_data(name, aliases, evidence)
    sources = data["sources"]
    new_fm = fm
    if sources:
        new_fm = replace_source_frontmatter(new_fm, sources)
    new_fm = set_status_frontmatter(new_fm, len(evidence))
    dates = [item.get("date") for item in data["evidence"] if item.get("date")]
    if dates:
        new_fm = replace_scalar_frontmatter(new_fm, "Start", dates[0])
        new_fm = replace_scalar_frontmatter(new_fm, "end", dates[-1])
    body = build_body(page, name, aliases, data, args.max_episodes)
    page.write_text(new_fm.rstrip() + "\n\n" + body, encoding="utf-8")
    return True


def page_targets(args: argparse.Namespace) -> list[Path]:
    root = Path(args.people_root).resolve()
    if args.only:
        candidate = Path(args.only).resolve()
        if candidate.exists():
            return [candidate]
        return [p for p in root.rglob("*.md") if p.stem == args.only and p.name not in EXCLUDE]
    return [p for p in sorted(root.rglob("*.md")) if p.name not in EXCLUDE]


def main() -> None:
    args = parse_args()
    rebuilt = 0
    skipped = 0
    for page in page_targets(args):
        if rebuild_page(page, args):
            rebuilt += 1
        else:
            skipped += 1
    print(f"rebuilt={rebuilt} skipped={skipped}")


if __name__ == "__main__":
    main()
