# LifeWiki Forge 智能体工作协议

本仓库把 `原始知识库/` 视为证据层，把 `wiki/` 视为经过整理、可修订的综合层。

## 读取顺序

1. 先读本文件，判断请求是只读消费、获授权构建、规则调整还是体系维护。
2. 再读 `wiki/AGENTS.md`，了解 Wiki 结构和当前约定。
3. 按下方唯一路由表读取相关 `SKILL.md`；只加载被选中 Skill 要求的参考文件。
4. `AGENTS.md` 是唯一运行入口，`skills/` 是唯一 Skill 内容源。

## 授权边界

- 查询、分析、审查、诊断、解释和问题报告默认只读。
- 只有用户明确要求修改、摄取、重跑、重建或修复时，才能写入 Wiki 或调整规则。
- 识别到值得沉淀的信号，本身不构成写入授权。
- 不改写原始笔记正文；任务明确需要时，只能追加 Wiki 管道区块或元数据。

## 唯一路由表

| 请求类型 | 必读流程 |
|---|---|
| 查询、综合、导航或引用现有 Wiki | `skills/consume/query/SKILL.md` |
| “跑一下 Wiki”、新增日记、多来源更新、对话或其他来源摄取 | `skills/build/wiki-build/SKILL.md` |
| 获授权更新个人主线、人生阶段、事件决策、反复循环、思维模型或金句 | `skills/build/life-review/SKILL.md` |
| 获授权更新人物、别名、关系功能或人物关系图谱 | `skills/build/people/SKILL.md` |
| 获授权更新现实系统、城市、组织、项目或地点 | `skills/build/life-experience/SKILL.md` |
| 获授权更新当前状态和趋势证据 | `skills/build/state-tracking/SKILL.md` |
| 明确要求近况回信、朋友式回应，或摄取流程要求生成回信 | `skills/build/companion-reflection/SKILL.md` |
| 明确要求修改分类、模板、抽取规则或 Skill 行为 | `skills/build/knowledge-adjustment/SKILL.md` |
| Wiki 或 Skill 修改后的质量检查 | `skills/common/quality-gate/SKILL.md` |
| Skill 体系分析、设计、路由、职责图或验证器调整 | `skills/common/skill-system/SKILL.md` |
| 明确要求使用人物视角、比较多种视角，或领域 Skill 需要解释性推理 | `skills/common/reasoning-lenses/SKILL.md` |
| 获授权维护期间的耐久信号分类，或信号路由诊断 | `skills/common/signal-detector/SKILL.md` |

## 路由消歧

- 直接问题无论涉及人物、阶段还是系统，都先走只读查询流程。
- 事实查询只走查询流程；解释性查询可以同时使用共享推理视角。
- 宽泛构建或任何来源摄取先走统一构建流程，并填写 `skills/build/wiki-build/impact-matrix.md` 的每一行。
- 模板、分类、抽取或 Skill 规则变更先走知识调整流程，再只重跑确实受影响的内容。
- 有实质修改后必须串联质量门；只读检查不得自动变成修复。

## 始终执行的信号扫描

快速识别新想法、原句、人物、地点、项目、新来源和规则变更，但未经明确授权不得写入。只有在维护或调试信号路由时，才读取 `skills/common/signal-detector/SKILL.md`。

## 核心规则

- Wiki 判断必须能追溯到原始笔记、获授权对话或既有综合页。
- 推断必须标为“推断”或“待查”。
- 按主要对象归档，不使用泛化暂存页代替领域页面。
- 用户原话本身构成洞见时，保留准确措辞。
- 模板没有证据支持的章节可以省略，不能生成占位内容。

## 修改后的验证

Markdown 修改后运行：

```bash
python3 tools/update_obsidian_tags.py
python3 tools/update_obsidian_tags.py
python3 tools/validate_wiki_links.py
```

第二次标签运行必须报告 `updated=0`，链接验证必须报告 `missing=0 ambiguous=0`。

修改 Skill、路由规则或维护工具后还要运行：

```bash
python3 tools/validate_skill_system.py
```

公开或共享仓库前运行：

```bash
python3 tools/privacy_scan.py
```
