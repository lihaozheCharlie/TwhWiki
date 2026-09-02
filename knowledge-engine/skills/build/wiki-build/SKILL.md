---
name: build-wiki
description: "编排个人 wiki 摄取，适用于宽泛运行、变更日记、值得沉淀的对话材料或非日记来源。填写完整影响矩阵并分发给唯一负责的 Skill；纯查询不要使用。"
---

# 构建：Wiki 构建

这是摄取与公共导航编排器。它不负责领域模板。普通问题先由查询 Skill 回答；若同一轮出现具体、耐久、证据充分的新材料，并满足根 `AGENTS.md` 的 Wiki 变更判断，再转入本 Skill。

## 选择一个入口模式

| 请求 | 读取的参考文件 |
|---|---|
| 宽泛的“运行/更新 wiki”或混合来源 | `references/orchestrator.md` |
| 发生变化的日记文件 | `references/diary-ingest.md` |
| 值得沉淀的对话材料 | `references/dialogue-ingest.md` |
| 读书、历史、文章或其他来源 | `references/source-ingest.md` |
| 来源索引维护 | `references/source-index.md` |

始终读取 `knowledge-engine/skills/build/wiki-build/impact-matrix.md` 和 `knowledge-engine/skills/common/quality-gate/SKILL.md`。只读取所选模式的参考文件，以及矩阵中标为 `update` 的行所对应的负责人 Skill。

当 `update` 涉及个人主线、人生阶段、事件复盘、循环、思维模型、现实系统、城市、关系综合或近况回信时，由各领域负责人按 `knowledge-engine/skills/common/reasoning-lenses/SKILL.md` 选择视角。编排器不得为整篇来源指定一个统一人物：同一来源进入不同层可以使用不同视角，来源索引和中性事实始终不使用。

## 分发负责人

- 个人主线、人生阶段、事件/决策、反复循环、思维模型和金句集锦：`knowledge-engine/skills/build/life-review/SKILL.md`
- 人物、别名和关系功能：`knowledge-engine/skills/build/people/SKILL.md`
- 现实系统、城市、组织、项目和地点：`knowledge-engine/skills/build/life-experience/SKILL.md`
- 状态追踪：`knowledge-engine/skills/build/state-tracking/SKILL.md`
- 近况回信：`knowledge-engine/skills/build/companion-reflection/SKILL.md`
- 来源索引和公共导航：本 Skill

## 公共导航职责

本 Skill 负责 `wiki/00 总入口/`、`wiki/index.md`、`wiki/08 来源索引/`、`wiki/99 维护规则/` 和 `wiki/log.md` 的导航更新。人生阶段内容及其总览只由 `build-life-review` 负责。

只有本次运行改变了可发现性、覆盖范围、数量或 Wiki 构建规则时，才更新公共导航。`wiki/log.md` 只记录实际发生的 Wiki 摄取、构建，以及直接改变 Wiki 产物的规则或质量维护；Studio、前后端、仓库目录等产品工程变更必须留在项目级变更记录，不得写入个人 Wiki 构建日志。只读检查和普通问题也不追加日志。

## 核心契约

1. 综合前先读取证据。
2. 影响矩阵每一行都必须填写 `update`、`link-only`、`no-op` 或 `defer`。
3. 每个 `update` 都路由到唯一负责人，不要跨 Skill 复制模板。
4. 保留本次受影响范围之外的用户既有修改。
5. 应用质量门，并报告延期或跳过的工作。
6. 领域负责人通过动态发现脚本读取人物库；编排器和影响矩阵不维护人物名单。
