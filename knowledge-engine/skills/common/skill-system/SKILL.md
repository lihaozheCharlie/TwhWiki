---
name: common-skill-system
description: "分析、设计、验证或在明确授权后更新本 wiki 的 Codex Skill 体系、AGENTS.md 唯一路由、职责图和验证规则。只要求分析时保持只读。"
---

# 通用：Skill 体系

用于创建、重构、验证或调试本 wiki 的 Skill 体系。

分析和验证保持只读。只有用户明确要求修改时才变更体系。

## 设计原则

- 顶层单一入口：根 `AGENTS.md` 只保存工作区协作边界和任务分发；`studio/AGENTS.md` 是目录级产品工程协议，不参与 Wiki 路由。
- 单一路由索引：`knowledge-engine/skills/registry.yaml` 是 Wiki Skill 的唯一机器可读索引，`knowledge-engine/skills/` 是唯一 Skill 内容源。
- 多知识库共享：每个知识库只保存自己的 `原始知识库/` 与 `wiki/`；`knowledge-engine/skills/`、`knowledge-engine/tools/` 和根路由协议位于工作区根，由全部知识库公用。
- 每个 `SKILL.md` 保持聚焦。较长的模式专用配方放入 `references/`，只读取当前选中的参考文件。
- 确定性工作放进工具，需要判断的工作放进 Skill。
- 根 `AGENTS.md` 保持可直接执行：先区分产品与 Wiki、再区分读写模式；Wiki 请求通过注册表路由到准确的规范 Skill。
- 每个 wiki 类别只设一个负责 Skill。其他 Skill 路由给负责人，不复制其模板。
- 共享质量规则只放在 `knowledge-engine/skills/common/quality-gate/SKILL.md`。
- 只读请求绝不授权修复、摄取、追加日志或重新生成索引。

## 必需文件

- `AGENTS.md`：顶层入口、授权边界和一级分发。
- `studio/AGENTS.md`：只适用于产品工程的目录级协作协议。
- `knowledge-engine/skills/registry.yaml`：规范 Skill 的 ID、路径、模式、职责和触发索引。
- `the-way-here.config.yaml`：知识库注册表、默认知识库和各库内容路径。
- `vault/<id>/`：彼此隔离的原始证据层与 Wiki 综合层。
- `knowledge-engine/skills/common/skill-system/module-map.md`：构建、通用、消费模块的职责和保留映射。
- `knowledge-engine/skills/build/*/SKILL.md`：构建模块入口。
- `knowledge-engine/skills/common/*/SKILL.md`：共享质量和 Skill 体系规则。
- `knowledge-engine/skills/consume/*/SKILL.md`：查询与消费流程。
- `knowledge-engine/skills/common/skill-system/trigger-cases.json`：供回归审阅的正向和负向路由规格。
- `knowledge-engine/tools/validate_skill_system.py`：确定性的结构和安全检查。

`trigger-cases.json` 是静态路由规格。验证器检查覆盖、冲突和引用，不会调用模型，因此不能把它的通过等同于真实的自动触发评测；高风险路由变化仍需独立行为评测。

## 更新要求

修改 Skill 体系时：

1. 更新 `knowledge-engine/skills/registry.yaml`；一级任务边界变化时同步更新根 `AGENTS.md`。
2. 映射变化时更新 `knowledge-engine/skills/common/skill-system/module-map.md`，它只作为人类可读职责视图。
3. 人与模型的工作流变化时，更新 `AGENTS.md`、目标知识库的 `wiki/99 维护规则/Wiki 结构与约定.md` 和 `wiki/99 维护规则/维护手册 v2.md`。
4. 通过引用或迁移详细配方，保留旧模板中有价值的内容。
5. 仅当体系修改直接改变 Wiki 构建行为或产物时，追加目标知识库的 `wiki/log.md`；Studio 与仓库工程重构不写入个人 Wiki 日志。
6. 运行质量门。

## 体系检查清单

- 每个 Skill 是否都有清晰的前置元数据 `name` 和 `description`？
- 每个规范 Skill 是否都在 `registry.yaml` 中恰好出现一次，且路径、模式和职责完整？
- 每个 Skill 是否说明了使用时机、先读内容以及所需输出或验证？
- 分析触发与修改触发是否明确分离？
- 每个 wiki 类别是否恰好只有一个模板负责人？
- 影响矩阵是否覆盖所有构建层？
- 脆弱的确定性步骤是否被表示为命令或工具？
- 审计工具是否默认使用只读或检查模式？
- 在能防止重复错误的地方，是否记录了失败模式和反模式？

## 验证

```bash
python3 knowledge-engine/tools/validate_skill_system.py
```

多知识库工作区可用 `THE_WAY_HERE_KNOWLEDGE_BASE=<id>` 指定验证目标；省略时验证注册表中的默认知识库。
