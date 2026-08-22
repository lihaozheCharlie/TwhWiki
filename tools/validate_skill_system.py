#!/usr/bin/env python3
"""Validate the single-entry Skill architecture with standard-library checks."""

from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL_GLOBS = ("skills/build/*/SKILL.md", "skills/common/*/SKILL.md", "skills/consume/*/SKILL.md")
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
INLINE_CODE_RE = re.compile(r"`([^`\n]+)`")
MARKDOWN_LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)\n]+)\)")
MATRIX_ROWS = (
    "个人主线", "人生阶段", "反复循环", "思维模型", "现实系统", "事件/决策", "人物与关系",
    "城市、组织与地点", "状态追踪", "来源索引", "公共导航", "金句集锦", "近况对话",
)


def skill_files() -> list[Path]:
    found: set[Path] = set()
    for pattern in SKILL_GLOBS:
        found.update(ROOT.glob(pattern))
    return sorted(found)


def frontmatter(path: Path, errors: list[str]) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        errors.append(f"{path.relative_to(ROOT)}: invalid frontmatter")
        return {}
    raw = text[4 : text.find("\n---\n", 4)]
    fields: dict[str, str] = {}
    for line in raw.splitlines():
        match = re.match(r"^(name|description):\s*(.+)$", line)
        if not match:
            continue
        value = match.group(2).strip()
        if value.startswith(("'", '"')):
            try:
                value = ast.literal_eval(value)
            except (SyntaxError, ValueError):
                errors.append(f"{path.relative_to(ROOT)}: invalid quoted {match.group(1)}")
                continue
        fields[match.group(1)] = value
    for key in ("name", "description"):
        if not fields.get(key):
            errors.append(f"{path.relative_to(ROOT)}: missing {key}")
    return fields


def referenced_path(source: Path, raw: str) -> Path | None:
    value = raw.strip().strip("<>").split("#", 1)[0]
    if not value or value.startswith(("http://", "https://", "mailto:", "#")):
        return None
    if any(token in value for token in ("*", "{", "}", "YYYY")):
        return None
    if value.startswith("references/"):
        target = source.parent / value
    elif value in {"AGENTS.md", "Makefile"} or value.startswith(("skills/", "tools/", "wiki/", "docs/", "原始知识库/")):
        target = ROOT / value
    else:
        return None
    if not value.endswith((".md", ".py", ".json", ".yml", ".yaml")):
        return None
    return target


def check_references(errors: list[str]) -> None:
    docs = sorted((ROOT / "skills").rglob("*.md")) + [ROOT / "AGENTS.md", ROOT / "wiki/AGENTS.md"]
    for path in docs:
        text = path.read_text(encoding="utf-8")
        for raw in INLINE_CODE_RE.findall(text) + MARKDOWN_LINK_RE.findall(text):
            target = referenced_path(path, raw)
            if target is not None and not target.exists():
                errors.append(f"{path.relative_to(ROOT)}: missing reference {raw!r}")


def run(command: list[str], label: str, errors: list[str]) -> None:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        detail = (result.stdout + result.stderr).strip()
        errors.append(f"{label} failed: {detail}")


def main() -> int:
    errors: list[str] = []
    files = skill_files()
    names: dict[str, Path] = {}
    for path in files:
        fields = frontmatter(path, errors)
        name = fields.get("name", "")
        if name and not NAME_RE.fullmatch(name):
            errors.append(f"{path.relative_to(ROOT)}: invalid name {name!r}")
        if name in names:
            errors.append(f"duplicate skill name: {name}")
        elif name:
            names[name] = path

    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    try:
        route = agents.split("## 唯一路由表", 1)[1].split("## 路由消歧", 1)[0]
    except IndexError:
        route = ""
        errors.append("AGENTS.md: incomplete 唯一路由表")
    for name, path in names.items():
        relative = path.relative_to(ROOT).as_posix()
        count = route.count(relative)
        if count != 1:
            errors.append(f"AGENTS.md: route for {name} appears {count} times")

    check_references(errors)

    matrix = (ROOT / "skills/build/wiki-build/impact-matrix.md").read_text(encoding="utf-8")
    for row in MATRIX_ROWS:
        if f"| {row} |" not in matrix:
            errors.append(f"impact matrix missing row: {row}")

    trigger_path = ROOT / "skills/common/skill-system/trigger-cases.json"
    try:
        cases = json.loads(trigger_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        cases = []
        errors.append(f"invalid trigger cases: {exc}")
    covered: set[str] = set()
    for index, case in enumerate(cases if isinstance(cases, list) else []):
        if case.get("mode") not in {"read-only", "write"}:
            errors.append(f"trigger case {index}: invalid mode")
        expected = case.get("expected", [])
        must_not = case.get("must_not", [])
        if set(expected) & set(must_not):
            errors.append(f"trigger case {index}: expected overlaps must_not")
        for name in expected + must_not:
            if name not in names:
                errors.append(f"trigger case {index}: unknown skill {name}")
        covered.update(expected)
    for name in sorted(set(names) - covered):
        errors.append(f"trigger cases do not cover skill: {name}")

    for script in sorted((ROOT / "skills").rglob("*.py")) + sorted((ROOT / "tools").glob("*.py")):
        try:
            compile(script.read_text(encoding="utf-8"), str(script), "exec")
        except SyntaxError as exc:
            errors.append(f"{script.relative_to(ROOT)}: {exc}")

    lens_script = ROOT / "skills/common/reasoning-lenses/scripts/list_lenses.py"
    run([sys.executable, str(lens_script), "--check"], "reasoning lens discovery", errors)
    dynamic_test = ROOT / "skills/common/reasoning-lenses/tests/test_dynamic_discovery.py"
    run([sys.executable, str(dynamic_test)], "dynamic lens regression", errors)

    query = (ROOT / "skills/consume/query/SKILL.md").read_text(encoding="utf-8")
    if "严格只读" not in query:
        errors.append("consume-query must remain explicitly read-only")

    for error in errors:
        print(f"ERROR {error}")
    print(f"skills={len(files)} routing_specs={len(cases) if isinstance(cases, list) else 0} errors={len(errors)}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
