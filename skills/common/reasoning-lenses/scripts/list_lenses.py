#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path


DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "references/figures"
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FIELD_RE = re.compile(r"^(?P<key>[a-z_]+):(?P<value>.*)$")
REQUIRED_FIELDS = (
    "lens_id",
    "display_name",
    "attention",
    "signals",
    "helper_use",
)
REQUIRED_HEADINGS = (
    "## 稳定特质与表达风格",
    "## 核心关注",
    "## 推理起点",
    "## 推理路径",
    "## 什么算洞见",
    "## 怎样处理矛盾与未知",
    "## 何时停止",
    "## 自然成文倾向",
    "## 禁止迁移",
    "## 辅助接口",
    "## 忠实度自检",
    "## 适用边界",
    "## 可核实的原则与格言",
    "## 一手或官方来源",
)


def parse_quoted_scalar(raw: str, path: Path, key: str, errors: list[str]) -> str:
    value = raw.strip()
    if not value:
        errors.append(f"{path}: {key} 不能为空")
        return ""
    try:
        parsed = ast.literal_eval(value)
    except (SyntaxError, ValueError):
        errors.append(f"{path}: {key} 必须是带引号的单行字符串")
        return ""
    if not isinstance(parsed, str) or not parsed.strip():
        errors.append(f"{path}: {key} 必须是非空字符串")
        return ""
    return parsed.strip()


def parse_lens(path: Path, errors: list[str]) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        errors.append(f"{path}: 缺少路由 frontmatter")
        return {}
    end = text.find("\n---\n", 4)
    if end < 0:
        errors.append(f"{path}: frontmatter 未闭合")
        return {}

    fields: dict[str, str] = {}
    for line in text[4:end].splitlines():
        match = FIELD_RE.match(line)
        if not match:
            continue
        key = match.group("key")
        if key in REQUIRED_FIELDS:
            if key in fields:
                errors.append(f"{path}: {key} 重复")
            fields[key] = parse_quoted_scalar(
                match.group("value"), path, key, errors
            )

    for key in REQUIRED_FIELDS:
        if key not in fields:
            errors.append(f"{path}: 缺少 {key}")

    lens_id = fields.get("lens_id", "")
    if lens_id and not ID_RE.fullmatch(lens_id):
        errors.append(f"{path}: lens_id 格式无效: {lens_id!r}")
    if lens_id and path.stem != lens_id:
        errors.append(
            f"{path}: 文件名必须与 lens_id 一致，应为 {lens_id}.md"
        )

    for heading in REQUIRED_HEADINGS:
        if heading not in text:
            errors.append(f"{path}: 缺少章节 {heading}")

    fields["file"] = path.as_posix()
    return fields


def load_lenses(root: Path) -> tuple[list[dict[str, str]], list[str]]:
    errors: list[str] = []
    paths = sorted(root.glob("*.md"))
    if not paths:
        errors.append(f"{root}: 没有人物视角文件")
        return [], errors

    lenses: list[dict[str, str]] = []
    seen_ids: dict[str, Path] = {}
    seen_names: dict[str, Path] = {}
    for path in paths:
        fields = parse_lens(path, errors)
        lens_id = fields.get("lens_id", "")
        display_name = fields.get("display_name", "")
        if lens_id:
            if lens_id in seen_ids:
                errors.append(
                    f"{path}: lens_id 与 {seen_ids[lens_id]} 重复: {lens_id}"
                )
            else:
                seen_ids[lens_id] = path
        if display_name:
            if display_name in seen_names:
                errors.append(
                    f"{path}: display_name 与 {seen_names[display_name]} 重复: "
                    f"{display_name}"
                )
            else:
                seen_names[display_name] = path
        if all(fields.get(key) for key in REQUIRED_FIELDS):
            lenses.append(fields)

    lenses.sort(key=lambda item: item["lens_id"])
    return lenses, errors


def markdown_table(lenses: list[dict[str, str]]) -> str:
    def clean(value: str) -> str:
        return value.replace("|", "｜").replace("\n", " ")

    lines = [
        "| lens_id | 人物 | 首先注意 | 适用信号 | 作为辅助 | 文件 |",
        "|---|---|---|---|---|---|",
    ]
    for lens in lenses:
        lines.append(
            "| {lens_id} | {display_name} | {attention} | {signals} | "
            "{helper_use} | {file} |".format(
                **{key: clean(value) for key, value in lens.items()}
            )
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="动态发现并校验共享人物推理视角。"
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--json", action="store_true", help="以 JSON 输出路由卡")
    mode.add_argument("--check", action="store_true", help="只校验人物库")
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_ROOT,
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()

    lenses, errors = load_lenses(args.root.resolve())
    if errors:
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        print(f"lenses={len(lenses)} errors={len(errors)}")
        return 1

    if args.check:
        print(f"lenses={len(lenses)} errors=0")
    elif args.json:
        print(json.dumps(lenses, ensure_ascii=False, indent=2))
    else:
        print(markdown_table(lenses))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
