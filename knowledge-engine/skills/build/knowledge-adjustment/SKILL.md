---
name: build-knowledge-adjustment
description: "仅当用户明确要求修改 wiki 分类、模板、抽取规则或 Skill 行为时执行规则变更并重跑受影响内容。分析、审查或问题报告不触发写入。"
---

# 构建：知识调整

仅当用户明确要求修改、修复、调整或重跑时使用。若用户只要求分析、
审查、解释或列出问题，改用 `common-skill-system` 并保持只读。

## 契约

1. 通过根 `AGENTS.md`、`knowledge-engine/skills/registry.yaml` 和 `knowledge-engine/skills/common/skill-system/module-map.md` 判断涉及的 wiki 类别和负责 Skill。
2. 记录用户明确授权的修改范围；不要把一次修复扩展为无关重构。
3. 先更新唯一负责的 Skill 或共享约定。
4. 保留已有模板里有价值的内容，把用户的新规则合进去。
5. 仅在用户要求或规则变更会使现有输出错误时，基于原始证据重跑受影响类别。
6. 应用 `knowledge-engine/skills/common/quality-gate/SKILL.md`。
7. 只有规则变更直接改变 Wiki 构建产物时，才在 `wiki/log.md` 追加规则变更、授权范围和重跑范围；产品工程变更不得写入。若本次任务只是删除一条越界的项目日志，不要再追加一条元日志。

## 示例

- 人物页重复啰嗦 -> 更新 `knowledge-engine/skills/build/people/SKILL.md`，再重跑相关人物页。
- 事件页出现占位符 -> 更新 `knowledge-engine/skills/common/quality-gate/SKILL.md` 和 `knowledge-engine/skills/build/life-review/SKILL.md`，再重跑事件页。
- 城市模板需要调整 -> 只更新唯一负责人 `knowledge-engine/skills/build/life-experience/SKILL.md`，再重跑生活过的城市页。

## 反模式

当用户明确要求修复可重复的规则、模板、抽取器或类别标准时，不能只
修补生成出来的 wiki 页面。若只是在报告问题，则保持只读。
