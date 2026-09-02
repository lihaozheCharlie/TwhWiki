---
name: build-life-review
description: "在 wiki/01-04、09 和 13 中构建或更新有证据支持的个人主线、人生阶段、关键事件与决策、反复循环、思维模型或金句集锦。只读问题不要使用。"
---

# 构建：人生复盘

仅用于当前任务中的复盘层构建或更新。先读 `knowledge-engine/skills/common/quality-gate/SKILL.md`，再根据影响矩阵中受影响的行，只选择确实需要的参考文件。

个人主线、人生阶段、事件事后判断、反复循环和思维模型属于解释层。处理这些内容时同时读取 `knowledge-engine/skills/common/reasoning-lenses/SKILL.md`，动态选择主视角；金句原句与来源身份保持中性。

## 职责与参考文件路由

| Wiki 层级 | 唯一模板参考文件 |
|---|---|
| `wiki/01 个人主线/` | `references/personal-line.md` |
| `wiki/02 人生阶段/` | `references/life-stage.md` |
| `wiki/03 关键事件与决策/` | `references/event-decision.md` |
| `wiki/04 反复循环/` | `references/recurring-cycle.md` |
| `wiki/09 思维模型/` | `references/thinking-model.md` |
| `wiki/13 金句集锦/` | `references/quote-collection.md` |

只读取标记为 `update` 的行所对应的参考文件。对于 `link-only`，只做最小且可追溯的导航修改；除非为了遵守契约确有必要，否则不要加载完整对象配方。

## 共享规则

- 修改综合判断前先读取来源证据。
- 保留有证据支持的既有判断和用户准确原话。
- 动机或因果不明确时标记为推断，并降低置信度。
- 省略无证据支持的字段和章节，不生成占位内容。
- 跨年份时间线归入 `wiki/02 人生阶段/`，不要新建 `wiki/10`。
- 金句用于唤回记忆；思维模型解释机制、边界、反例和行动。两者可以互链，但不能彼此替代。
- 人物模板路由到 `build-people`，现实系统和地点模板路由到 `build-life-experience`，当前状态证据路由到 `build-state-tracking`。

## 共享推理视角

1. 先完成时间、事件、原句、人物和结果等中性证据，再运行 `python3 knowledge-engine/skills/common/reasoning-lenses/scripts/list_lenses.py`。
2. 对个人主线、阶段意义、事件复盘、循环机制和思维模型使用强度 2：选择 1 个主视角完整推理，通常最多 1 个辅助视角校验盲点。
3. 页面结构仍由本 Skill 与对应参考文件负责；人物视角不能把主线页写成回信，也不能改变事件时间线和来源。
4. 正常摄取只有新证据改变判断时才更新；人物视角本身不是新证据。当前目标确实包含重解释既有页面时，保留仍成立的旧判断。
5. 默认不在正文点名人物。重大重构在 `wiki/log.md` 记录主视角与辅助任务。
6. 金句集锦使用强度 0：不得按人物风格改写原句，只能帮助内部检查它能唤回哪类判断。

## 完成标准

更新受影响的总览或导航页，保留来源链接，并应用 `knowledge-engine/skills/common/quality-gate/SKILL.md`。不要仅因主题相近就重写无关的复盘页。
