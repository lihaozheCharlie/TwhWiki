# The Way Here 知识库目录

`vault/` 只保存知识库数据，每个一级子目录是一套彼此隔离的知识库：

```text
vault/
└── demo/
    ├── sources/
    └── wiki/
```

公共构建规则与工具位于项目根 `knowledge-engine/`，顶层智能体协议是项目根 `AGENTS.md`，知识库运行时元数据与路径只登记在根 `the-way-here.config.yaml`。新增知识库时只创建内容目录并登记配置，不复制 Skills、Tools、AGENTS 或第二份库配置。

公开仓库只跟踪匿名演示库 `vault/demo/`。本地私人库可以放在被 Git 忽略的 `vault/personal/`，也可以通过 `--vault` 指向仓库外目录。

打开演示库：

```bash
./start.sh
```
