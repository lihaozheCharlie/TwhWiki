---
name: build-knowledge-adjustment
description: "仅当用户明确要求修改 wiki 分类、模板、抽取规则或 Skill 行为时执行规则变更并重跑受影响内容。分析、审查或问题报告不触发写入。"
---

# 构建：知识调整

仅当用户明确要求修改、修复、调整或重跑时使用。若用户只要求分析、
审查、解释或列出问题，改用 `common-skill-system` 并保持只读。

## 契约

1. 通过根 `AGENTS.md` 的唯一路由表和 `skills/common/skill-system/module-map.md` 判断涉及的 wiki 类别和负责 Skill。
2. 记录用户明确授权的修改范围；不要把一次修复扩展为无关重构。
3. 先更新唯一负责的 Skill 或共享约定。
4. 保留已有模板里有价值的内容，把用户的新规则合进去。
5. 仅在用户要求或规则变更会使现有输出错误时，基于原始证据重跑受影响类别。
6. 应用 `skills/common/quality-gate/SKILL.md`。
7. 在 `wiki/log.md` 追加规则变更、授权范围和重跑范围。

## 示例

- 人物页重复啰嗦 -> 更新 `skills/build/people/SKILL.md`，再重跑相关人物页。
- 事件页出现占位符 -> 更新 `skills/common/quality-gate/SKILL.md` 和 `skills/build/life-review/SKILL.md`，再重跑事件页。
- 城市模板需要调整 -> 只更新唯一负责人 `skills/build/life-experience/SKILL.md`，再重跑生活过的城市页。

## 反模式

当用户明确要求修复可重复的规则、模板、抽取器或类别标准时，不能只
修补生成出来的 wiki 页面。若只是在报告问题，则保持只读。
