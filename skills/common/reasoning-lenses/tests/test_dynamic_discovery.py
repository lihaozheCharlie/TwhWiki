#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/list_lenses.py"
SPEC = importlib.util.spec_from_file_location("list_lenses", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"无法加载 {SCRIPT}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def lens_text(lens_id: str, display_name: str) -> str:
    headings = "\n\n".join(
        f"{heading}\n\n测试内容。" for heading in MODULE.REQUIRED_HEADINGS
    )
    return f'''---
lens_id: "{lens_id}"
display_name: "{display_name}"
attention: "测试注意力"
signals: "测试信号"
helper_use: "测试辅助边界"
---

# {display_name}

{headings}
'''


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="reasoning-lenses-") as tmp:
        root = Path(tmp)
        (root / "first-lens.md").write_text(
            lens_text("first-lens", "第一视角"), encoding="utf-8"
        )
        lenses, errors = MODULE.load_lenses(root)
        assert not errors, errors
        assert [lens["lens_id"] for lens in lenses] == ["first-lens"]

        # 模拟后续只新增人物文件；发现器和下游协议均不修改。
        (root / "future-lens.md").write_text(
            lens_text("future-lens", "未来视角"), encoding="utf-8"
        )
        lenses, errors = MODULE.load_lenses(root)
        assert not errors, errors
        assert [lens["lens_id"] for lens in lenses] == [
            "first-lens",
            "future-lens",
        ]

        cli = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(root), "--json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        assert cli.returncode == 0, cli.stderr
        discovered = json.loads(cli.stdout)
        assert [lens["lens_id"] for lens in discovered] == [
            "first-lens",
            "future-lens",
        ]

        (root / "broken-lens.md").write_text(
            '---\nlens_id: "broken-lens"\n---\n# 不完整视角\n',
            encoding="utf-8",
        )
        _, errors = MODULE.load_lenses(root)
        assert errors, "不完整人物文件必须校验失败"

        cli = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(root), "--check"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        assert cli.returncode != 0, "命令行校验必须拒绝不完整人物文件"

    print("dynamic-discovery=ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
