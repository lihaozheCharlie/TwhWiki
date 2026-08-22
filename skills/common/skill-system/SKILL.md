---
name: common-skill-system
description: "分析、设计、验证或在明确授权后更新本 wiki 的 Codex Skill 体系、AGENTS.md 唯一路由、职责图和验证规则。只要求分析时保持只读。"
---

# 通用：Skill 体系

用于创建、重构、验证或调试本 wiki 的 Skill 体系。

分析和验证保持只读。只有用户明确要求修改时才变更体系。

## 设计原则

- 单一入口：根 `AGENTS.md` 是唯一运行入口和路由来源，`skills/` 是唯一 Skill 内容源。
- 每个 `SKILL.md` 保持聚焦。较长的模式专用配方放入 `references/`，只读取当前选中的参考文件。
- 确定性工作放进工具，需要判断的工作放进 Skill。
- 根 `AGENTS.md` 保持可直接执行：先区分读写模式，再把请求路由到准确的规范 Skill。
- 每个 wiki 类别只设一个负责 Skill。其他 Skill 路由给负责人，不复制其模板。
- 共享质量规则只放在 `skills/common/quality-gate/SKILL.md`。
- 只读请求绝不授权修复、摄取、追加日志或重新生成索引。

## 必需文件

- `AGENTS.md`：唯一入口、授权边界和分发映射。
- `skills/common/skill-system/module-map.md`：构建、通用、消费模块的职责和保留映射。
- `skills/build/*/SKILL.md`：构建模块入口。
- `skills/common/*/SKILL.md`：共享质量和 Skill 体系规则。
- `skills/consume/*/SKILL.md`：查询与消费流程。
- `skills/common/skill-system/trigger-cases.json`：供回归审阅的正向和负向路由规格。
- `tools/validate_skill_system.py`：确定性的结构和安全检查。

`trigger-cases.json` 是静态路由规格。验证器检查覆盖、冲突和引用，不会调用模型，因此不能把它的通过等同于真实的自动触发评测；高风险路由变化仍需独立行为评测。

## 更新要求

修改 Skill 体系时：

1. 更新根 `AGENTS.md` 中的唯一路由表。
2. 映射变化时更新 `skills/common/skill-system/module-map.md`。
3. 人与模型的工作流变化时，更新 `AGENTS.md`、`wiki/AGENTS.md` 和 `wiki/99 维护规则/维护手册 v2.md`。
4. 通过引用或迁移详细配方，保留旧模板中有价值的内容。
5. 追加 `wiki/log.md`。
6. 运行质量门。

## 体系检查清单

- 每个 Skill 是否都有清晰的前置元数据 `name` 和 `description`？
- 每个规范 Skill 是否都由根 `AGENTS.md` 的唯一路由表覆盖？
- 每个 Skill 是否说明了使用时机、先读内容以及所需输出或验证？
- 分析触发与修改触发是否明确分离？
- 每个 wiki 类别是否恰好只有一个模板负责人？
- 影响矩阵是否覆盖所有构建层？
- 脆弱的确定性步骤是否被表示为命令或工具？
- 审计工具是否默认使用只读或检查模式？
- 在能防止重复错误的地方，是否记录了失败模式和反模式？

## 验证

```bash
python3 tools/validate_skill_system.py
```
