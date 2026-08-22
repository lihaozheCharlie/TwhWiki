# Wiki 影响矩阵

每次日记、对话材料或来源材料进入 wiki 时，都要使用这张矩阵。目的不是强行更新每一层，而是明确检查每一层，避免只更新最显眼的页面。

| 层级 | 状态 | 证据问题 | 标为 update 时的动作 |
|---|---|---|---|
| 个人主线 | update/link-only/no-op/defer | 这份材料是否改变长期自我叙事、身份感、野心、旧伤、家庭线或想要的人生方向？ | 使用 `skills/build/life-review/SKILL.md`，加载 `skills/build/life-review/references/personal-line.md` |
| 人生阶段 | update/link-only/no-op/defer | 这份材料是否改变某个学校、工作、家庭、城市或人生阶段的时间线、核心经历、认知升级、遗憾、重来规则或后续影响？ | 使用 `skills/build/life-review/SKILL.md`，加载 `skills/build/life-review/references/life-stage.md` |
| 反复循环 | update/link-only/no-op/defer | 这份材料是否重复了某个触发 -> 反应 -> 代价 -> 修正的模式？ | 使用 `skills/build/life-review/SKILL.md`，加载 `skills/build/life-review/references/recurring-cycle.md` |
| 思维模型 | update/link-only/no-op/defer | 这份材料是否形成、验证、限制或推翻了一个可复用的判断机制？ | 使用 `skills/build/life-review/SKILL.md`，加载 `skills/build/life-review/references/thinking-model.md` |
| 现实系统 | update/link-only/no-op/defer | 这份材料是否改变家庭、职业、身体、资产、注意力、表达、城市、时间或风险管理系统？ | 使用 `skills/build/life-experience/SKILL.md` 的“现实系统”流程 |
| 事件/决策 | update/link-only/no-op/defer | 这是否是重大人生节点，或是否验证/修正了既有事件或决策页？ | 使用 `skills/build/life-review/SKILL.md`，加载 `skills/build/life-review/references/event-decision.md` |
| 人物与关系 | update/link-only/no-op/defer | 人物、别名或关系功能是否获得了新的证据？ | 使用 `skills/build/people/SKILL.md` |
| 城市、组织与地点 | update/link-only/no-op/defer | 城市、组织、项目或地点是否获得了新的证据或现实功能？ | 使用 `skills/build/life-experience/SKILL.md` |
| 状态追踪 | update/link-only/no-op/defer | 这份材料是否显示优化、劣化、稳定或证据不足？ | 使用 `skills/build/state-tracking/SKILL.md` |
| 来源索引 | update/link-only/no-op/defer | 来源数量、代表条目、生成索引或导航是否发生变化？ | 使用 `skills/build/wiki-build/SKILL.md`，加载 `skills/build/wiki-build/references/source-index.md` |
| 公共导航 | update/link-only/no-op/defer | 总入口、wiki index、维护规则或日志是否需要反映本次覆盖变化？ | 使用 `skills/build/wiki-build/SKILL.md` 的“公共导航职责”流程 |
| 金句集锦 | update/link-only/no-op/defer | 是否出现用户明确认可、值得原样保存，或能用一句话唤回个人判断与动作的表达？ | 使用 `skills/build/life-review/SKILL.md`，加载 `skills/build/life-review/references/quote-collection.md` |
| 近况对话 | update/link-only/no-op/defer | 这份材料是否包含当前想法、状态、关系时刻或自我模型，值得用有洞见、像朋友一样的回信回应？ | 使用 `skills/build/companion-reflection/SKILL.md` |

## 最小运行日志

有实质 ingest 时，在 `wiki/log.md` 里总结矩阵：

```markdown
- 影响矩阵：personal-line=update, life-stage=link-only, cycle=no-op,
  thinking-model=update, system=update, event=link-only, people=update,
  experience=no-op, state=update, index=update, public-navigation=link-only,
  quote-collection=update, companion=update.
```

## defer 规则

遇到以下情况时用 `defer`，不要猜：

- 来源暗示可能有新的重大事件，但重要性还不清楚；
- 人生阶段重写需要读取尚未读取的来源；
- 某个人物可能值得建页，但目前只出现一次；
- 用户原句看起来重要，但意图或含义仍暧昧；
- 更新综合页需要调和互相冲突的证据。
