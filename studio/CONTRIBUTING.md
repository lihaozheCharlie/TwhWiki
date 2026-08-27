# Contributing

感谢参与 the-way-here。提交改动前请运行：

```bash
pnpm typecheck
pnpm test
pnpm build
```

开发时使用匿名演示库：

```bash
pnpm dev -- --vault .. --knowledge-base demo
```

请遵守这些边界：

- 不提交真实日记、人物资料、任务快照、Codex 线程内容或本机绝对路径。
- 新视图首先基于通用 metadata、目录分类和 Wiki 链接，不依赖某个用户的固定页面。
- 新写入接口必须限制在 Vault 配置允许的目录内，验证解析后的绝对路径，并处理并发修改。
- Codex 能力应继续尊重工作区根 `AGENTS.md`、Skill 注册表、Skills 和质量门，Studio 不复制业务判断规则。
- UI 文案优先面向非技术用户，错误信息应说明用户下一步能做什么。

涉及数据模型或任务协议的改动，请同步更新 `docs/ARCHITECTURE.md` 和演示库。
