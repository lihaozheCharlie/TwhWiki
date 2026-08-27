# The Way Here 工作区智能体协议

本文件是全工作区唯一的顶层入口，只承载协作边界与任务分发。产品工程规则由目录级协议负责，Wiki 路由由公共 Skill 注册表负责；`vault/` 内不得再放智能体入口。

## 工作区边界

- `studio/`：GUI、服务端、索引器、Codex 桥接、测试与产品文档。处理产品代码时进入该目录并读取 `studio/AGENTS.md`，不得顺带改写 `vault/` 私人内容。
- `vault/<id>/`：彼此隔离的知识资产，只保存原始来源、Wiki、库级内容约定和编辑器配置；`personal` 与匿名 `demo` 都遵守同一目录边界。
- `knowledge-engine/`：全部知识库共享的 Skills、路由注册表与确定性工具，不得复制进单个知识库。
- `the-way-here.config.yaml`：知识库注册、共享路径、默认知识库和质量门的唯一运行时配置源。

## 任务分发

1. 产品代码、API、UI、索引器或运行管理任务：读取并遵守 `studio/AGENTS.md`。
2. Wiki 查询、摄取、规则、质量或 Skill 任务：先选择知识库，再读取 `knowledge-engine/skills/registry.yaml`，按其中 `triggers`、`modes` 和 `path` 加载最小必要 Skill。
3. 跨产品与 Wiki 的任务必须分别遵守两侧边界；产品实现不得复制 Wiki 判断规则，Wiki 构建不得修改 Studio。

## 知识库选择

1. 用户明确指定知识库时使用指定 ID；否则使用 `the-way-here.config.yaml` 的 `defaultKnowledgeBase`。
2. 从根配置读取该库的 Wiki 与来源路径；若存在 `wiki/99 维护规则/Wiki 结构与约定.md`，再读取它了解内容结构。
3. 公共工具始终从项目根运行，并显式设置 `THE_WAY_HERE_KNOWLEDGE_BASE=<id>`。
4. 一次 AI 任务从启动、审批、验证到差异收集必须绑定同一个知识库 ID，不得使用界面后来切换到的活动库。

## 授权边界

- 查询、分析、审查、诊断、解释和问题报告默认只读。
- 只有用户明确要求修改、摄取、重跑、重建或修复时，才能写入 Wiki、调整规则或修改产品代码。
- 识别到耐久信号本身不构成写入授权；规则调整只处理获授权范围。
- 直接问题优先走只读查询；只读检查不得转成自动修复。
- 有实质 Wiki 或 Skill 修改后必须串联 `common-quality-gate`。

## 核心知识规则

- 不改写原始笔记正文；只有明确需要时才添加 Wiki 管道所需元数据或关联区块。
- Wiki 判断必须能追溯到原始笔记、获授权的对话材料或既有综合页；推断必须标明。
- 按主要对象归档，新洞见进入它实际改变的页面；用户原话构成洞见时保留准确措辞。

## Wiki 修改后的验证

```bash
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/update_obsidian_tags.py
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/update_obsidian_tags.py
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/validate_wiki_links.py
```

第二次标签运行必须报告 `updated=0`，链接验证必须报告 `missing=0 ambiguous=0`。修改 Skill、路由注册表、智能体协议或维护工具后还要运行：

```bash
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/validate_skill_system.py
```
