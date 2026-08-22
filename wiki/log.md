---
type: "log"
aliases:
  - "构建日志"
tags:
  - "来源/wiki"
  - "类型/wiki"
status: "active"
source:
  - "LifeWiki Forge sample"
---
# 构建日志

## [2026-08-22] 恢复完整人物视角库

- 纠正过度清理：此前按静态引用次数判断人物视角是否多余，这不适用于动态发现架构。
- 原样恢复爱因斯坦、富兰克林、乔布斯和巴菲特视角；连同芒格、费曼、雅尼和马斯克，完整库恢复为 8 个。
- 在共享推理视角 Skill 中增加保护规则：未经用户明确指定，不得把未被当前样例点名的人物视角当作冗余删除。
- README 改为说明 8 个完整视角，并重点展示其中 4 个。

## [2026-08-22] README 定位重写

- 授权范围：重新表达开源项目的核心价值，并让文档描述与实际能力一致。
- README 第一屏改为突出“把个人过往履历结构化成可索引的大脑”。
- 增加多人物推理视角与近况回信的完整说明，并恢复马斯克推理视角样例。
- 保留证据护栏：人物视角只改变解释方式，不改变日期、原句和可观察事实。

## [2026-08-22] 开源仓库瘦身

- 授权范围：删除公开项目中未被流程调用或仅为空占位的内容。
- 删除两个未引用脚本、五个未参与样例的推理视角文件，以及两个尚无数据的来源索引页。
- 规则调整：人物别名索引和对话分析索引改为首次有真实数据时创建。
- 保留范围：核心 Skills、三种代表性推理视角、验证工具、开源治理文件和完整来源到 Wiki 样例链路。

## [2026-02-03] 示例日记摄取

- 来源：[[原始知识库/日记/2026-02-03 先试验再决定]]。
- 影响矩阵：personal-line=update, life-stage=update, cycle=update, thinking-model=update, system=update, event=update, people=link-only, experience=no-op, state=update, index=update, public-navigation=link-only, quote-collection=update, companion=update.
- 说明：本条日志为虚构样例，用于展示完整构建记录。

## [2026-01-12] 示例日记摄取

- 来源：[[原始知识库/日记/2026-01-12 忙碌不是方向]]。
- 影响矩阵：personal-line=update, life-stage=update, cycle=update, thinking-model=link-only, system=update, event=update, people=update, experience=update, state=update, index=update, public-navigation=update, quote-collection=update, companion=update.
