"""Resolve the active knowledge base inside a multi-library Vault workspace."""

from __future__ import annotations

import os
from pathlib import Path

import yaml


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = WORKSPACE_ROOT / "the-way-here.config.yaml"


def _config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    value = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    if not isinstance(value, dict):
        raise RuntimeError("the-way-here.config.yaml 顶层必须是对象")
    return value


def _workspace_path(value: str, label: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        raise RuntimeError(f"{label} 必须使用工作区相对路径")
    resolved = (WORKSPACE_ROOT / path).resolve()
    if resolved != WORKSPACE_ROOT and WORKSPACE_ROOT not in resolved.parents:
        raise RuntimeError(f"{label} 超出工作区边界")
    return resolved


CONFIG = _config()
BASES = CONFIG.get("knowledgeBases") or {}
if BASES and not isinstance(BASES, dict):
    raise RuntimeError("knowledgeBases 必须是对象")

KNOWLEDGE_BASE_ID = os.environ.get("THE_WAY_HERE_KNOWLEDGE_BASE") or CONFIG.get("defaultKnowledgeBase") or next(iter(BASES), "demo")
if BASES and KNOWLEDGE_BASE_ID not in BASES:
    raise RuntimeError(f"知识库不存在：{KNOWLEDGE_BASE_ID}")

selected = BASES.get(KNOWLEDGE_BASE_ID, {}) if BASES else {}
if not isinstance(selected, dict):
    raise RuntimeError(f"知识库 {KNOWLEDGE_BASE_ID} 的配置必须是对象")
paths = {**(CONFIG.get("paths") or {}), **(selected.get("paths") or {})}
WIKI_ROOT = _workspace_path(str(paths.get("wiki", "wiki")), f"{KNOWLEDGE_BASE_ID}.paths.wiki")
SOURCES_ROOT = _workspace_path(str(paths.get("sources", "sources")), f"{KNOWLEDGE_BASE_ID}.paths.sources")
if WIKI_ROOT.parent != SOURCES_ROOT.parent:
    raise RuntimeError(f"知识库 {KNOWLEDGE_BASE_ID} 的 Wiki 与来源目录必须位于同一个库根目录")
KNOWLEDGE_BASE_ROOT = WIKI_ROOT.parent


if not KNOWLEDGE_BASE_ROOT.is_dir():
    raise RuntimeError(f"知识库目录不存在：{KNOWLEDGE_BASE_ROOT}")
