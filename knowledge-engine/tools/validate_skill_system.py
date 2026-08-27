#!/usr/bin/env python3
from __future__ import annotations

import ast
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

from vault_context import CONFIG, KNOWLEDGE_BASE_ID, KNOWLEDGE_BASE_ROOT, WORKSPACE_ROOT


ROOT = WORKSPACE_ROOT
REGISTRY_PATH = ROOT / "knowledge-engine/skills/registry.yaml"
CANONICAL_GLOBS = (
    "knowledge-engine/skills/build/*/SKILL.md",
    "knowledge-engine/skills/common/*/SKILL.md",
    "knowledge-engine/skills/consume/*/SKILL.md",
)
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TOP_LEVEL_FIELD_RE = re.compile(r"^(?P<key>[A-Za-z][A-Za-z0-9_-]*):(?P<value>.*)$")
INLINE_CODE_RE = re.compile(r"`([^`\n]+)`")
MARKDOWN_LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)\n]+)\)")
CJK_RE = re.compile(r"[\u3400-\u9fff]")
ALLOWED_FRONTMATTER_KEYS = {
    "name",
    "description",
    "allowed-tools",
    "license",
    "metadata",
}
REQUIRED_MATRIX_ROWS = (
    "个人主线",
    "人生阶段",
    "反复循环",
    "思维模型",
    "现实系统",
    "事件/决策",
    "人物与关系",
    "城市、组织与地点",
    "状态追踪",
    "来源索引",
    "公共导航",
    "金句集锦",
    "近况对话",
)
REQUIRED_SUMMARY_KEYS = (
    "personal-line=",
    "life-stage=",
    "cycle=",
    "thinking-model=",
    "system=",
    "event=",
    "people=",
    "experience=",
    "state=",
    "index=",
    "public-navigation=",
    "quote-collection=",
    "companion=",
)
MATRIX_ACTION_TARGETS = {
    "个人主线": (
        "knowledge-engine/skills/build/life-review/SKILL.md",
        "knowledge-engine/skills/build/life-review/references/personal-line.md",
    ),
    "人生阶段": (
        "knowledge-engine/skills/build/life-review/SKILL.md",
        "knowledge-engine/skills/build/life-review/references/life-stage.md",
    ),
    "反复循环": (
        "knowledge-engine/skills/build/life-review/SKILL.md",
        "knowledge-engine/skills/build/life-review/references/recurring-cycle.md",
    ),
    "思维模型": (
        "knowledge-engine/skills/build/life-review/SKILL.md",
        "knowledge-engine/skills/build/life-review/references/thinking-model.md",
    ),
    "现实系统": ("knowledge-engine/skills/build/life-experience/SKILL.md",),
    "事件/决策": (
        "knowledge-engine/skills/build/life-review/SKILL.md",
        "knowledge-engine/skills/build/life-review/references/event-decision.md",
    ),
    "人物与关系": ("knowledge-engine/skills/build/people/SKILL.md",),
    "城市、组织与地点": ("knowledge-engine/skills/build/life-experience/SKILL.md",),
    "状态追踪": ("knowledge-engine/skills/build/state-tracking/SKILL.md",),
    "来源索引": (
        "knowledge-engine/skills/build/wiki-build/SKILL.md",
        "knowledge-engine/skills/build/wiki-build/references/source-index.md",
    ),
    "公共导航": ("knowledge-engine/skills/build/wiki-build/SKILL.md",),
    "金句集锦": (
        "knowledge-engine/skills/build/life-review/SKILL.md",
        "knowledge-engine/skills/build/life-review/references/quote-collection.md",
    ),
    "近况对话": ("knowledge-engine/skills/build/companion-reflection/SKILL.md",),
}
GENERATED_OUTPUTS = (
    KNOWLEDGE_BASE_ROOT / "wiki/08 来源索引/日记实体抽取索引.md",
    KNOWLEDGE_BASE_ROOT / "wiki/08 来源索引/逐篇日记实体索引.md",
    KNOWLEDGE_BASE_ROOT / "wiki/08 来源索引/同学与同辈实体索引.md",
)
AUDIT_SCRIPTS = (
    ROOT / "knowledge-engine/tools/diary_entity_audit.py",
    ROOT / "knowledge-engine/tools/diary_entity_deep_audit.py",
)
CONTROL_DOCUMENTS = (
    ROOT / "AGENTS.md",
    KNOWLEDGE_BASE_ROOT / "wiki/99 维护规则/Wiki 结构与约定.md",
    KNOWLEDGE_BASE_ROOT / "wiki/index.md",
    KNOWLEDGE_BASE_ROOT / "wiki/99 维护规则/维护手册 v2.md",
)
RETIRED_ROUTING_MARKERS = (
    ".agents/skills",
    "knowledge-engine/skills/RESOLVER",
    "[[knowledge-engine/skills/RESOLVER",
    "原生发现",
)
REASONING_LENS_CONSUMERS = (
    "knowledge-engine/skills/consume/query/SKILL.md",
    "knowledge-engine/skills/build/wiki-build/SKILL.md",
    "knowledge-engine/skills/build/life-review/SKILL.md",
    "knowledge-engine/skills/build/life-experience/SKILL.md",
    "knowledge-engine/skills/build/people/SKILL.md",
    "knowledge-engine/skills/build/state-tracking/SKILL.md",
    "knowledge-engine/skills/build/companion-reflection/SKILL.md",
    "knowledge-engine/skills/common/quality-gate/SKILL.md",
)


def knowledge_base_validation_enabled() -> bool:
    bases = CONFIG.get("knowledgeBases") or {}
    selected = bases.get(KNOWLEDGE_BASE_ID, {}) if isinstance(bases, dict) else {}
    validation = selected.get("validation") if isinstance(selected, dict) else None
    return not (isinstance(validation, dict) and validation.get("commands") == [])


def canonical_skill_files() -> list[Path]:
    found = set()
    for pattern in CANONICAL_GLOBS:
        found.update(ROOT.glob(pattern))
    return sorted(found)


def parse_scalar(raw: str, path: Path, key: str, errors: list[str]) -> str:
    value = raw.strip()
    if not value:
        errors.append(f"{path}: empty {key}")
        return ""
    if value[0] in {'"', "'"}:
        try:
            parsed = ast.literal_eval(value)
        except (SyntaxError, ValueError) as exc:
            errors.append(f"{path}: invalid quoted {key}: {exc}")
            return ""
        if not isinstance(parsed, str):
            errors.append(f"{path}: {key} must be a string")
            return ""
        return parsed
    if ": " in value:
        errors.append(f"{path}: unquoted ': ' makes {key} invalid YAML")
    return value


def parse_frontmatter(path: Path, errors: list[str]) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        errors.append(f"{path}: missing opening frontmatter fence")
        return {}
    end = text.find("\n---\n", 4)
    if end < 0:
        errors.append(f"{path}: missing closing frontmatter fence")
        return {}

    fields: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if line.startswith((" ", "\t", "-")):
            continue
        match = TOP_LEVEL_FIELD_RE.match(line)
        if not match:
            continue
        key = match.group("key")
        if key not in ALLOWED_FRONTMATTER_KEYS:
            errors.append(f"{path}: unsupported frontmatter key {key!r}")
        if key in {"name", "description"}:
            if key in fields:
                errors.append(f"{path}: duplicate {key}")
            fields[key] = parse_scalar(match.group("value"), path, key, errors)

    for required in ("name", "description"):
        if required not in fields:
            errors.append(f"{path}: missing required {required}")
    return fields


def digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def documentation_files() -> list[Path]:
    files = set((ROOT / "knowledge-engine/skills").rglob("*.md"))
    files.update((ROOT / "AGENTS.md", KNOWLEDGE_BASE_ROOT / "wiki/99 维护规则/Wiki 结构与约定.md"))
    return sorted(path for path in files if path.exists())


def routing_control_files() -> list[Path]:
    files = set((ROOT / "knowledge-engine/skills").rglob("*.md"))
    files.update(CONTROL_DOCUMENTS)
    return sorted(path for path in files if path.exists())


def resolve_document_reference(source: Path, raw: str) -> Path | None:
    value = raw.strip().split("#", 1)[0]
    if (
        not value
        or value in {"references/", "scripts/", "assets/"}
        or any(token in value for token in ("*", "<", ">", "{", "YYYY"))
    ):
        return None
    if value.startswith("references/"):
        candidate = source.parent / value
    elif value == "AGENTS.md" or value.startswith(("knowledge-engine/skills/", "knowledge-engine/tools/")):
        candidate = ROOT / value
    elif value.startswith("wiki/"):
        candidate = KNOWLEDGE_BASE_ROOT / value
    else:
        return None
    if not value.endswith(("/", ".md", ".py", ".json", ".yaml", ".yml")):
        return None
    return candidate


def resolve_markdown_reference(source: Path, raw: str) -> Path | None:
    value = raw.strip()
    if value.startswith("<") and value.endswith(">"):
        value = value[1:-1]
    value = value.split("#", 1)[0]
    if not value or value.startswith(("http://", "https://", "mailto:", "#")):
        return None
    if any(token in value for token in ("*", "<", ">", "{", "YYYY")):
        return None
    if value.startswith(("knowledge-engine/skills/", "knowledge-engine/tools/", "wiki/")):
        return (KNOWLEDGE_BASE_ROOT if value.startswith("wiki/") else ROOT) / value
    return (source.parent / value).resolve()


def check_single_entry_architecture(
    by_name: dict[str, Path], errors: list[str]
) -> None:
    resolver = ROOT / "knowledge-engine/skills/RESOLVER.md"
    if resolver.exists():
        errors.append("retired routing file still exists: knowledge-engine/skills/RESOLVER.md")

    agents_path = ROOT / "AGENTS.md"
    try:
        agents_text = agents_path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"cannot read AGENTS.md: {exc}")
        agents_text = ""
    if agents_text.count("knowledge-engine/skills/registry.yaml") != 1:
        errors.append("AGENTS.md must reference the Skill registry exactly once")
    if "studio/AGENTS.md" not in agents_text:
        errors.append("AGENTS.md must route product engineering through studio/AGENTS.md")

    try:
        registry = yaml.safe_load(REGISTRY_PATH.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        errors.append(f"invalid Skill registry: {exc}")
        registry = {}
    entries = registry.get("skills", []) if isinstance(registry, dict) else []
    if not isinstance(entries, list):
        errors.append("Skill registry skills must be a list")
        entries = []
    registered: dict[str, str] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(f"Skill registry entry {index} must be an object")
            continue
        skill_id = entry.get("id")
        relative = entry.get("path")
        modes = entry.get("modes")
        triggers = entry.get("triggers")
        if not isinstance(skill_id, str) or not skill_id:
            errors.append(f"Skill registry entry {index} missing id")
            continue
        if skill_id in registered:
            errors.append(f"Skill registry duplicates {skill_id}")
        if not isinstance(relative, str) or not (ROOT / relative).is_file():
            errors.append(f"Skill registry {skill_id} has invalid path {relative!r}")
            relative = ""
        if not isinstance(modes, list) or not modes or set(modes) - {"read", "write"}:
            errors.append(f"Skill registry {skill_id} has invalid modes")
        if not isinstance(entry.get("responsibility"), str) or not entry.get("responsibility", "").strip():
            errors.append(f"Skill registry {skill_id} missing responsibility")
        if not isinstance(triggers, list) or not triggers or any(not isinstance(value, str) or not value.strip() for value in triggers):
            errors.append(f"Skill registry {skill_id} has invalid triggers")
        registered[skill_id] = relative

    for name, canonical in sorted(by_name.items()):
        expected = canonical.relative_to(ROOT).as_posix()
        if registered.get(name) != expected:
            errors.append(f"Skill registry route for {name} must be {expected}; found {registered.get(name)!r}")
    for name in sorted(set(registered) - set(by_name)):
        errors.append(f"Skill registry references unknown skill: {name}")

    for path in routing_control_files():
        text = path.read_text(encoding="utf-8")
        for marker in RETIRED_ROUTING_MARKERS:
            if marker in text:
                errors.append(
                    f"{path}: contains retired routing marker {marker!r}"
                )


def check_document_references(
    errors: list[str], check_knowledge_base_references: bool
) -> None:
    for path in documentation_files():
        text = path.read_text(encoding="utf-8")
        for raw in INLINE_CODE_RE.findall(text):
            target = resolve_document_reference(path, raw)
            if (
                target is not None
                and not target.exists()
                and (
                    check_knowledge_base_references
                    or not target.is_relative_to(KNOWLEDGE_BASE_ROOT)
                )
            ):
                errors.append(
                    f"{path}: missing reference {raw!r} "
                    f"(resolved to {target})"
                )
        for raw in MARKDOWN_LINK_RE.findall(text):
            target = resolve_markdown_reference(path, raw)
            if (
                target is not None
                and not target.exists()
                and (
                    check_knowledge_base_references
                    or not target.is_relative_to(KNOWLEDGE_BASE_ROOT)
                )
            ):
                errors.append(
                    f"{path}: missing Markdown link {raw!r} "
                    f"(resolved to {target})"
                )


def run_checked_command(
    command: list[str], label: str, errors: list[str]
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        details = (result.stdout + result.stderr).strip()
        errors.append(f"{label} failed with {result.returncode}: {details}")
    return result


def check_reasoning_lenses_and_companion(errors: list[str]) -> None:
    shared = ROOT / "knowledge-engine/skills/common/reasoning-lenses"
    shared_skill = shared / "SKILL.md"
    script = shared / "scripts/list_lenses.py"
    shared_text = shared_skill.read_text(encoding="utf-8")
    for required in (
        "下游 Skill 不得硬编码人物名单、数量或文件名",
        "人物视角不是证据",
        "本 Skill 默认只读",
        "四档使用强度",
        "中性证据卡",
        "视角任务卡",
        "辅助视角只能校验一个",
        "新增人物只需",
    ):
        if required not in shared_text:
            errors.append(f"reasoning-lenses missing architecture guard: {required}")

    if not script.exists():
        errors.append("reasoning-lenses missing dynamic discovery script")
        return
    compile(script.read_text(encoding="utf-8"), str(script), "exec")
    run_checked_command(
        [sys.executable, str(script), "--help"],
        "reasoning-lenses --help",
        errors,
    )
    unknown = subprocess.run(
        [sys.executable, str(script), "--definitely-unknown"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if unknown.returncode == 0:
        errors.append("reasoning-lenses unknown arguments must fail")
    check_run = run_checked_command(
        [sys.executable, str(script), "--check"],
        "reasoning-lenses --check",
        errors,
    )
    if check_run.returncode == 0 and not re.fullmatch(
        r"lenses=\d+ errors=0\n?", check_run.stdout
    ):
        errors.append("reasoning-lenses --check returned an invalid summary")
    json_run = run_checked_command(
        [sys.executable, str(script), "--json"],
        "reasoning-lenses --json",
        errors,
    )
    if json_run.returncode == 0:
        try:
            lenses = json.loads(json_run.stdout)
        except json.JSONDecodeError as exc:
            errors.append(f"reasoning-lenses --json returned invalid JSON: {exc}")
            lenses = []
        if not isinstance(lenses, list) or not lenses:
            errors.append("reasoning-lenses must dynamically discover at least one lens")
        for lens in lenses if isinstance(lenses, list) else []:
            if not isinstance(lens, dict) or not lens.get("file"):
                errors.append("reasoning-lenses JSON entries must include file routes")

    dynamic_test = shared / "tests/test_dynamic_discovery.py"
    if not dynamic_test.exists():
        errors.append("reasoning-lenses missing dynamic-addition regression")
    else:
        run_checked_command(
            [sys.executable, str(dynamic_test)],
            "reasoning-lenses dynamic-addition regression",
            errors,
        )

    regression = shared / "tests/cross-domain-regression.md"
    if not regression.exists():
        errors.append("reasoning-lenses missing cross-domain regression")
    else:
        regression_text = regression.read_text(encoding="utf-8")
        for required in (
            "同一来源，不同主视角",
            "同一主视角，不同输出层",
            "中性层不受污染",
            "辅助越权",
            "新人物动态发现",
        ):
            if required not in regression_text:
                errors.append(f"cross-domain regression missing case: {required}")

    for relative in REASONING_LENS_CONSUMERS:
        text = (ROOT / relative).read_text(encoding="utf-8")
        if "knowledge-engine/skills/common/reasoning-lenses/SKILL.md" not in text:
            errors.append(f"{relative}: must consume the shared reasoning-lenses Skill")

    companion = ROOT / "knowledge-engine/skills/build/companion-reflection"
    companion_text = (companion / "SKILL.md").read_text(encoding="utf-8")
    for required in (
        "references/friend-voice.md",
        "knowledge-engine/skills/common/reasoning-lenses/scripts/list_lenses.py",
        "中性证据卡",
        "主视角决定整封信",
        "最多 2 个辅助视角",
        "建议通常为 0-1 个",
    ):
        if required not in companion_text:
            errors.append(f"companion-reflection missing guard: {required}")
    for retired in (
        "munger-buffett-style-notes",
        "references/figure-index.md",
        "references/insight-and-friend-voice.md",
        "1200-2000",
        "最近 3-5 封",
    ):
        if retired in companion_text:
            errors.append(f"companion-reflection restored retired rule: {retired}")
    for retired_path in (
        companion / "references/figures",
        companion / "references/figure-index.md",
        companion / "references/insight-and-friend-voice.md",
    ):
        if retired_path.exists():
            errors.append(f"companion-reflection keeps a duplicate shared library: {retired_path}")

    companion_regression = companion / "tests/semantic-regression.md"
    if not companion_regression.exists():
        errors.append("companion-reflection missing semantic regression cases")
    else:
        companion_regression_text = companion_regression.read_text(encoding="utf-8")
        for required in (
            "用例一：2026-08-18",
            "用例二：2026-08-17",
            "用例三：2026-08-01",
            "朋友身份判定",
        ):
            if required not in companion_regression_text:
                errors.append(
                    f"companion semantic regression missing case: {required}"
                )


def check_matrix_actions(matrix: str, errors: list[str]) -> None:
    actions: dict[str, str] = {}
    for line in matrix.splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) >= 4 and cells[0] in MATRIX_ACTION_TARGETS:
            actions[cells[0]] = cells[3]
    for row, targets in MATRIX_ACTION_TARGETS.items():
        action = actions.get(row)
        if action is None:
            errors.append(f"impact matrix missing actionable row: {row}")
            continue
        for target in targets:
            if target not in action:
                errors.append(
                    f"impact matrix row {row} must route through {target}"
                )


def check_audit_cli(errors: list[str], check_generated_outputs: bool) -> None:
    before = (
        {path: digest(path) for path in GENERATED_OUTPUTS}
        if check_generated_outputs
        else {}
    )
    for script in AUDIT_SCRIPTS:
        compile(script.read_text(encoding="utf-8"), str(script), "exec")
        help_run = subprocess.run(
            [sys.executable, str(script), "--help"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if help_run.returncode != 0:
            errors.append(f"{script}: --help failed with {help_run.returncode}")
        unknown_run = subprocess.run(
            [sys.executable, str(script), "--definitely-unknown"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if unknown_run.returncode == 0:
            errors.append(f"{script}: unknown arguments must fail")
        if check_generated_outputs:
            check_run = subprocess.run(
                [sys.executable, str(script), "--check"],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
            if check_run.returncode != 0:
                details = (check_run.stdout + check_run.stderr).strip()
                errors.append(f"{script}: generated outputs are stale: {details}")
    if check_generated_outputs:
        after = {path: digest(path) for path in GENERATED_OUTPUTS}
        if before != after:
            errors.append("audit CLI checks modified generated outputs")


def main() -> int:
    errors: list[str] = []
    check_knowledge_base = knowledge_base_validation_enabled()
    skills = canonical_skill_files()
    if not skills:
        errors.append("no canonical skills found")

    by_name: dict[str, Path] = {}
    for path in skills:
        fields = parse_frontmatter(path, errors)
        name = fields.get("name", "")
        description = fields.get("description", "")
        if name and not NAME_RE.fullmatch(name):
            errors.append(f"{path}: invalid skill name {name!r}")
        if name in by_name:
            errors.append(f"duplicate skill name {name}: {by_name[name]} and {path}")
        elif name:
            by_name[name] = path
        if description and len(description) > 320:
            errors.append(f"{path}: description exceeds 320 characters")
        if description and not CJK_RE.search(description):
            errors.append(f"{path}: description must include Chinese routing text")

    check_single_entry_architecture(by_name, errors)
    check_document_references(errors, check_knowledge_base)
    check_reasoning_lenses_and_companion(errors)

    matrix = (ROOT / "knowledge-engine/skills/build/wiki-build/impact-matrix.md").read_text(
        encoding="utf-8"
    )
    for row in REQUIRED_MATRIX_ROWS:
        if f"| {row} |" not in matrix:
            errors.append(f"impact matrix missing row: {row}")
    check_matrix_actions(matrix, errors)

    diary_recipe = (
        ROOT / "knowledge-engine/skills/build/wiki-build/references/diary-ingest.md"
    ).read_text(encoding="utf-8")
    for key in REQUIRED_SUMMARY_KEYS:
        if key not in diary_recipe:
            errors.append(f"diary impact summary missing key: {key}")

    people_text = (ROOT / "knowledge-engine/skills/build/people/SKILL.md").read_text(encoding="utf-8")
    if "生活过的城市页标准" in people_text:
        errors.append("build-people duplicates the lived-city template")

    query_text = (ROOT / "knowledge-engine/skills/consume/query/SKILL.md").read_text(encoding="utf-8")
    if "严格只读" not in query_text or "## 写入" in query_text:
        errors.append("consume-query must remain explicitly read-only")

    adjustment_text = (
        ROOT / "knowledge-engine/skills/build/knowledge-adjustment/SKILL.md"
    ).read_text(encoding="utf-8")
    if "仅当用户明确要求" not in adjustment_text or "保持只读" not in adjustment_text:
        errors.append("knowledge-adjustment must separate analysis from mutation")

    trigger_path = ROOT / "knowledge-engine/skills/common/skill-system/trigger-cases.json"
    try:
        cases = json.loads(trigger_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"invalid trigger cases: {exc}")
        cases = []
    if not isinstance(cases, list):
        errors.append("trigger cases must be a JSON list")
        cases = []
    covered: set[str] = set()
    seen_prompts: set[str] = set()
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            errors.append(f"trigger case {index}: must be an object")
            continue
        prompt = case.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            errors.append(f"trigger case {index}: missing prompt")
        elif prompt in seen_prompts:
            errors.append(f"trigger case {index}: duplicate prompt")
        else:
            seen_prompts.add(prompt)
        if case.get("mode") not in {"read-only", "write"}:
            errors.append(f"trigger case {index}: invalid mode")
        expected = case.get("expected", [])
        must_not = case.get("must_not", [])
        if not isinstance(expected, list) or not expected:
            errors.append(f"trigger case {index}: expected must be a non-empty list")
            expected = []
        if not isinstance(must_not, list):
            errors.append(f"trigger case {index}: must_not must be a list")
            must_not = []
        overlap = set(expected) & set(must_not)
        if overlap:
            errors.append(
                f"trigger case {index}: skills appear in expected and must_not: "
                f"{sorted(overlap)}"
            )
        for field, names in (("expected", expected), ("must_not", must_not)):
            for name in names:
                if name not in by_name:
                    errors.append(f"trigger case {index}: unknown skill {name}")
        covered.update(name for name in expected if name in by_name)
    for name in sorted(set(by_name) - covered):
        errors.append(f"trigger cases do not positively cover skill: {name}")

    try:
        check_audit_cli(errors, check_knowledge_base)
        compile(Path(__file__).read_text(encoding="utf-8"), __file__, "exec")
    except (OSError, SyntaxError) as exc:
        errors.append(f"script validation failed: {exc}")

    for error in errors:
        print(f"ERROR {error}")
    validation_scope = "full" if check_knowledge_base else "static"
    print(
        f"skills={len(skills)} routing_specs={len(cases)} "
        f"validation_scope={validation_scope} errors={len(errors)}"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
