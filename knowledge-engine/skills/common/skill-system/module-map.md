---
type: "wiki"
aliases: []
tags:
  - "来源/wiki"
  - "类型/wiki"
status: "active"
source:
  - "skill体系重构思路"
---

# Skill 模块职责图

这是 `knowledge-engine/skills/` 下规范 Skill 的人类可读职责图。根 `AGENTS.md` 是顶层入口，`knowledge-engine/skills/registry.yaml` 是唯一 Wiki 路由索引；每个 wiki 类别只有一个模板负责人，编排 Skill 将任务路由给负责人，而不复制其规则。

## 构建模块

| 模块 Skill | 职责 | 配方覆盖 |
|---|---|---|
| `knowledge-engine/skills/build/wiki-build/SKILL.md` | 获授权的摄取编排、来源索引，以及 `wiki/00 总入口/`、`wiki/index.md`、`wiki/08 来源索引/`、`wiki/99 维护规则/` 和 `wiki/log.md` | 编排、日记/对话/来源/索引参考文件及 `impact-matrix.md` |
| `knowledge-engine/skills/build/life-review/SKILL.md` | `wiki/01`、`02`、`03`、`04`、`09` 和 `13` 模板的唯一负责人 | 个人主线、人生阶段、事件决策、反复循环、思维模型和金句参考文件 |
| `knowledge-engine/skills/build/people/SKILL.md` | 人物页、别名、`wiki/05 人物关系图谱/` 和 `wiki/07` 人物分支的唯一负责人 | 分层人物模板和证据收集脚本 |
| `knowledge-engine/skills/build/life-experience/SKILL.md` | 现实系统、生活过的城市、组织/项目和出现过的地点的唯一负责人 | 现实系统及城市/组织/地点模板 |
| `knowledge-engine/skills/build/state-tracking/SKILL.md` | 当前状态跟进、状态趋势证据和日记状态评估 | 状态追踪配方 |
| `knowledge-engine/skills/build/companion-reflection/SKILL.md` | `wiki/12 近况对话/` 的朋友式洞见回信层，以日记和少量 wiki 证据为基础；主视角决定完整推理，辅助视角只做有边界的盲点校验 | 朋友声音、回信语义回归和重复样式审计；人物库由共享推理视角统一维护 |
| `knowledge-engine/skills/build/knowledge-adjustment/SKILL.md` | 用户明确授权的 wiki、模板或 Skill 调整；不处理仅分析请求 | 受影响的负责 Skill 与质量门 |

## 通用模块

| 模块 Skill | 职责 | 配方覆盖 |
|---|---|---|
| `knowledge-engine/skills/common/quality-gate/SKILL.md` | 跨模块内容质量和区分读写模式的验证 | 标签/链接验证器、Skill 体系验证器和安全的生成索引检查 |
| `knowledge-engine/skills/common/skill-system/SKILL.md` | Skill 设计、`AGENTS.md` 路由健康和模块演进 | `AGENTS.md`、`knowledge-engine/skills/common/skill-system/module-map.md`、`skill体系重构思路.md` 和 GBrain 的 Skill 思路 |
| `knowledge-engine/skills/common/reasoning-lenses/SKILL.md` | 查询、回信和解释性构建共享的人物推理视角；只改变怎样理解证据，不负责归档，也不单独授权写入 | 动态人物发现、证据护栏、人物推理文件和跨领域语义回归 |
| `knowledge-engine/skills/common/signal-detector/SKILL.md` | 获授权维护或路由诊断期间，不写入的信号分类 | 信号检测配方 |

## 消费模块

| 模块 Skill | 职责 | 配方覆盖 |
|---|---|---|
| `knowledge-engine/skills/consume/query/SKILL.md` | 严格只读、wiki 优先的查询与综合 | 查询流程 |

## 设计说明

- 根 `AGENTS.md` 先区分产品与 Wiki；Wiki 请求再按注册表区分读写模式并选择规范 Skill。
- `vault/<id>/` 隔离各库的来源和 Wiki；根 `knowledge-engine/skills/`、`knowledge-engine/tools/` 与协议只维护一份，通过知识库 ID 选择内容目标。
- 详细对象配方放在负责 Skill 的 `references/` 目录中。
- 人物推理文件只保存在 `knowledge-engine/skills/common/reasoning-lenses/references/figures/`；下游通过动态发现脚本选择，不保存名单或副本。
- 构建 Skill 采用扇出方式；一个来源可以更新多种对象。
- 通用 Skill 提供可复用质量门，有实质修改后应串联使用。
- 消费 Skill 先从综合 wiki 回答，并且绝不写入；修改必须有独立、明确的构建请求。
