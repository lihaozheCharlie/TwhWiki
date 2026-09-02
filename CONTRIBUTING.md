# Contributing to the-way-here

感谢你帮助这套个人 Wiki 构建框架变得更可靠、更容易理解。

## 适合贡献的内容

- 新的来源摄取流程或领域 Skill。
- 更清晰的模板、影响矩阵问题和证据护栏。
- 跨平台、无第三方依赖的验证工具。
- 完全虚构或充分匿名化的示例。
- 文档、翻译和 Obsidian 使用体验改进。

## 开始之前

1. 不要提交未经当事人许可的日记、聊天记录、联系方式、公司内部信息或可识别附件。
2. 示例优先使用虚构人物、虚构组织和经过改写的日期。
3. 新 Skill 必须职责单一，并由根 `AGENTS.md` 的唯一路由表覆盖。
4. 查询 Skill 自身必须保持只读；普通对话由 Agent 按当前目标、耐久价值、证据质量和影响范围判断是否转入构建 Skill。

## 本地检查

```bash
cd studio
pnpm typecheck
pnpm test
pnpm build
```

若修改了演示 Wiki，回到仓库根目录并设置 `THE_WAY_HERE_KNOWLEDGE_BASE=demo`，连续运行两次标签更新，再运行链接检查；第二次标签更新必须显示 `updated=0`。修改 Skill、路由或维护工具时还要运行 `knowledge-engine/tools/validate_skill_system.py`。

## Pull Request 建议

- 说明解决的问题，而不只是罗列文件变化。
- 标明是否改变了 Wiki 分类、Skill 路由或生成结果。
- 为可重复的规则变化增加触发用例或回归样例。
- 保持提交范围聚焦，不顺带重写无关页面。

提交贡献即表示你有权许可其中的内容，并同意该贡献按项目的 MIT License 发布。
