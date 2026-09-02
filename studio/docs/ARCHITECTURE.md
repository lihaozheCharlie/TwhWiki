# Architecture

## 工作区与知识库模型

```text
Project Workspace（用户拥有）
  ├─ AGENTS.md：顶层协作边界与一级分发
  ├─ the-way-here.config.yaml：知识库注册、共享路径与质量门
  ├─ vault/
  │   ├─ personal/：私人原始知识 + Wiki
  │   └─ demo/：匿名演示原始知识 + Wiki
  ├─ knowledge-engine/
  │   ├─ skills/：全部知识库共享的构建规则
  │   └─ tools/：公共质量与维护工具
  └─ studio/
      ├─ wiki-core：配置、Markdown、frontmatter、链接、搜索索引
      ├─ life-views：今天、阶段地图、人物、关系、回信、状态信号与“值得聊聊”问题池
      ├─ codex-bridge：Codex app-server JSONL 协议
      ├─ run-manager：任务、快照、差异、审批和验证记录
      ├─ server：本地 API、Agent 运行时、文件监控、SSE、静态页面与任务编排服务
      ├─ web：阅读、探索、编辑和任务工作台
      └─ AGENTS.md：仅适用于 Studio 的工程协作协议
```

Studio 不把知识构建规则重新写进 TypeScript。它提供编排、展示和安全边界；归档判断由根 `AGENTS.md`、Skill 注册表与 `knowledge-engine/skills/` 决定。启动时从配置选择知识库：显式指定的 ID 优先；未指定时优先打开已注册的非 `demo` 知识库，只有不存在个人库时才进入演示库。索引、编辑和运行记录只作用于该库声明的内容路径；Skills 与工具不复制到各库。

## 数据流

1. 启动时读取根注册表，优先选择显式指定或已注册的个人知识库，只在没有个人库时使用演示库，并只索引所选库的 Wiki 与来源 Markdown。
2. 浏览器通过本地 API 读取摘要、页面、搜索和派生视图。
3. 文件监控发现改动后重新索引，并通过 SSE 通知界面刷新。
4. 页面内统一的上下文 Agent 抽屉创建任务；Run 固化 `knowledgeBaseId` 与配置快照。页面 Agent 使用 `auto` 模式，根据用户原话识别读写意图，并预先记录受保护目录快照以便安全收集可能发生的改动。
5. `AgentRuntimeRegistry` 按用户选择与配置解析 Codex 或 Pi，适配器把两者事件统一为消息、工具、审批、诊断和回合完成事件；审批请求停在界面等待用户决定。
6. 回合完成后按 Run 绑定的知识库收集差异；只有实际发生改动时才运行质量门并重建索引。显式写入与 `auto` 任务按知识库串行化，不同知识库可以独立运行；重启时会从对应运行时的会话记录恢复状态。

消费账单走同一来源导入 seam，但由后端的账单深模块处理平台格式。模块以一份平台导出文件为接口，内部完成编码识别、交易规范化、退款归并，以及重复商户、共同地点、异地旅程、单日复合活动和跨日期主题聚类；输出一份 UTF-8 原始 CSV、一份可索引的 Markdown 聚类报告和前端可展示的旅程摘要。聚类只作为 Agent 回忆访谈的候选线索，用户对经历的确认与后续 Wiki 摄取仍遵守证据边界和 Skill 路由。

“值得聊聊”遵循同样的知识边界：`build-state-tracking` 在 Wiki 中维护带有当前理解、提问时机、仍然未知和相关知识链接的问题池；`life-views` 只做确定性解析并通过 `TodayView.conversationPrompts` 暴露给产品。前端以按日期稳定的加权顺序展示，不在 TypeScript 中复制问题生成判断，也不会因一次刷新改变用户正在阅读的内容。状态信号仍独立服务证据工作区，不与对话问题混成同一个模型。

## Agent 运行时

`RunCoordinator` 只依赖通用的 `AgentRuntimeProvider` seam，不包含 Codex 或 Pi 的协议分支。Codex 适配器继续复用 `codex-bridge`；Pi 适配器使用 `pi-agent-core` 驱动用户配置的模型，并提供限定范围的列表、搜索、读取和写入工具。只读任务没有写工具；`auto` 模式由 Agent 按当前目标、耐久价值、证据质量与影响范围判断是否更新 Wiki，不要求额外写入确认。所有写入只允许落在当前 Run 固化的 Wiki 或来源目录，已有文件还要求读取时返回的 SHA-256，避免并发覆盖；规则、目录、批量重跑或难以撤销的操作仍需先确认范围。

根 `the-way-here.config.yaml` 的 `agents` 字段负责工作区能力开关和初始值。例如：

```yaml
agents:
  defaultRuntime: auto
  runtimes:
    codex:
      enabled: true
      command: codex
      transport: stdio
    pi:
      enabled: true
      providers:
        - id: my-openai-compatible
          name: My Model Service
          protocol: openai-completions
          baseUrl: https://example.com/v1
          apiKeyEnv: MY_MODEL_API_KEY
          models:
            - id: my-model
              displayName: My Model
              reasoning: true
              contextWindow: 32768
              maxOutputTokens: 8192
```

用户实际选择保存在操作系统应用数据目录的工作区级 `agent-settings.json`，因此切换知识库或从任意 Agent 入口打开设置时都会读到同一份配置。Codex 只保存模型和思考深度；第三方模型由 Pi 执行。`third-party-provider-catalog.ts` 是厂商、官网服务地址、协议、模型枚举和模型思考能力的唯一目录，当前覆盖 DeepSeek、智谱 GLM、阿里云千问、Kimi、MiniMax、OpenAI 与 Anthropic。浏览器只读取公开的厂商/模型预设，不接触或提交服务地址；用户按厂商填写 API Key 即可。每个厂商的 Key 会分别记忆，只写入权限为 `0600` 的本机状态文件，不进入知识库、Run 配置快照、事件广播或接口响应；`GET /api/agent-settings` 只返回哪些厂商已经配置。旧版接口地址设置会在读取时迁移到匹配的厂商预设，根配置中的 provider 与 `apiKeyEnv` 仍可作为首次启动的兼容初始值。

更新全局设置后，`AgentRuntimeRegistry` 会清除运行时目录缓存，并为后续 Pi 任务换用新的模型目录；已经开始的 Agent 回合继续持有创建时的适配器，不会因设置变化而中断。

## 本地 API

- `GET /api/vault`：当前知识库、可用知识库、数量和 Agent 运行时摘要。
- `POST /api/vault`：创建与演示库隔离的个人知识库、写入注册表并切换到新库。
- `DELETE /api/vault/:knowledgeBaseId`：删除独立管理的私人知识库目录并原子更新注册表；演示库、共享/自定义目录和存在活动任务的知识库会被拒绝。
- `POST /api/vault/select`：在当前服务进程中切换活动知识库。
- `GET /api/agent-runtimes`、`GET /api/agent-models`：可用运行时、当前模型和思考深度。
- `GET /api/agent-provider-presets`：第三方厂商、模型枚举及每个模型支持的思考深度；官网服务地址不会暴露给前端。
- `GET /api/agent-settings`、`PUT /api/agent-settings`：读取或更新工作区级全局 Agent 设置；密钥字段只写不读。
- `GET /api/pages`、`GET /api/pages/*`：页面列表与正文。
- `DELETE /api/sources/file`、`DELETE /api/sources/folder`：删除当前知识库内的一份生活记录或一个非根文件夹；文件删除带并发检测，文件夹删除受来源根目录边界保护。
- `GET /api/search`、`GET /api/views/*`：搜索与个人成长派生视图。
- `PUT /api/pages/*`：编辑当前知识库内的 Wiki 或来源，带并发检测。
- `GET /api/events`：文件、索引、任务、审批和验证 SSE。
- `POST /api/runs` 与 `/api/runs/:id/*`：启动和控制任务；创建请求显式携带知识库 ID，支持 `auto`、只读、写入与质量检查模式。人物视角重读可附带经过校验的 `letter-version` 结果目标；非法模式、目标和审批值在服务端拒绝。

## 运行记录

运行记录放在操作系统应用数据目录下的 `the-way-here/vaults/<workspace-hash>/`。记录包含知识库 ID、创建时配置、`runtimeId`、通用会话/回合 ID、provider、model、最终结果和可选的 `outputTarget`；Pi 对话也保存在该目录的 `agent-sessions/pi/`，不会写入知识文件。完成的人物视角重读通过 `letter-version` 目标关联到原回信：同一结果既留在 Agent 对话历史，也作为回信的持久版本供默认最新阅读与历史切换，原始回信正文不被覆盖。写入及 `auto` 任务的快照覆盖配置声明的根协议、Wiki、Skills、Tools 和来源。每个任务使用唯一临时文件，同一知识库内可能改写内容的任务串行执行；旧版 `threadId`/`turnId` 会按 Codex 运行时透明迁移，旧版并发写坏后仍保留首个完整 JSON 对象的记录可自动恢复。

## 代码组织

- `apps/server/src/index.ts`：只读取启动参数并启动 `StudioServer`，不包含业务路由或运行状态。
- `apps/server/src/studio-server.ts`：后端的外部接口，负责装配模块、静态资源与生命周期。
- `apps/server/src/runtime/knowledge-runtime.ts`：知识库索引、切换、文件监听与重建的深模块。
- `apps/server/src/runtime/run-coordinator.ts`：运行时无关的任务状态、审批、验证和恢复编排深模块。
- `apps/server/src/runtime/agent-runtime/`：通用运行时契约与注册表，以及 Codex/Pi 两个适配器；Pi 的模型目录、工具边界和会话仓库保持在适配器内部。
- `apps/server/src/modules/content/page-writer.ts`：页面创建、保存、重命名、来源删除与并发安全写入。
- `apps/server/src/modules/knowledge-bases/knowledge-base-manager.ts`：创建或删除隔离的知识库目录，并原子更新工作区注册表。
- `apps/server/src/modules/imports/`、`modules/skills/`：导入批次和 Skill 目录读取。
- `apps/server/src/modules/imports/payment-statement.ts`：支付宝账单的确定性解析、归并、聚类与回忆提示；后续支付平台通过同一账单导入 seam 增加适配器。
- `apps/server/src/routes/`：HTTP 适配器，只处理请求/响应映射，不保存领域状态。
- `apps/server/src/services/run-policy.ts`：运行时模式校验与绑定知识库的 Prompt。
- `apps/server/src/services/validation-runner.ts`：按 Run 上下文执行质量命令。
- `apps/web/src/app/`：应用壳、路由装配和稳定导航配置。
- `apps/web/src/features/sources/`：原始材料导入、浏览和编辑。
- `apps/web/src/features/overview/`：此刻、已有理解总览、理解自己与问题依据工作区。
- `apps/web/src/features/knowledge/`：人生地图、人物、回信、卡片、图谱、阅读与搜索。
- `apps/web/src/features/collaboration/`：统一上下文 Agent 抽屉、对话历史、结果目标及纯展示模型。
- `apps/web/src/shared/`：共享 Markdown 阅读编辑深模块、路由语义和基础展示模块；`EditableDocument` 统一双击激活、自动保存、页面级滚动与章节跟踪，页面只传正文和展示变体。
- `apps/web/src/styles/`：按基础、功能、主题和收尾覆盖顺序组织，入口显式保持级联顺序。
- 配置路径在 `wiki-core` 解析时校验为工作区内相对路径；Python 工具通过同一注册表解析知识库根。

后端模块的外部 seam 是 `StudioServer`；内部 seam 只在确实存在不同职责或本地测试替身时出现。前端以垂直功能为主，跨功能的 Markdown 编辑、返回上下文和基础展示行为才进入 `shared/`，避免把页面拆成大量只转发 props 的浅模块。

## 当前非目标

- 多用户、云同步和公网托管。
- 替代 Obsidian/IDE 的完整 Markdown 编辑体验。
- 在 UI 中重写个人知识抽取规则。
- 自动发布或提交 Git。
