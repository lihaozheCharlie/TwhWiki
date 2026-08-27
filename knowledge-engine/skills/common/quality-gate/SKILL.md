---
name: common-quality-gate
description: "验证获授权的 wiki 或 Skill 修改是否满足证据、归档、前置元数据、生成索引安全、链接和完成标准。除非明确要求写入，维护检查保持只读。"
---

# 通用：质量门

在获授权的 Markdown 或 Skill 修改后、宣布构建完成前，或用户明确要求 wiki 健康检查时使用。验证不会扩大任务的写入范围。

## 先读

- 归档或移动页面时读取 `knowledge-engine/skills/common/filing-rules.md`。
- 读取被检查页面所属领域的负责 Skill。
- 检查解释性查询或构建时读取 `knowledge-engine/skills/common/reasoning-lenses/SKILL.md`，验证人物视角没有污染中性证据或越过领域边界。

## 内容检查

- 每个非显然判断都能追溯到原始笔记、已标注的对话材料或既有综合页。推断标为 `推断` 或 `待查`。
- 模板只提供结构，不构成生成占位内容的许可。省略无证据支持的项目、表格行、引文和章节。
- 按主要对象归档，并维护有用的双向导航。
- 不要在不同章节机械重复同一证据。
- 使用与领域匹配的语言；人物、城市、系统、状态、事件和人生阶段需要不同类型的判断。
- 当措辞本身是可沉淀证据时，保留用户准确原话。
- 优先做局部、精确的更新，避免宽泛重写。
- 使用共享人物视角时，人物原则不构成证据；日期、原句、实体、金额、事件顺序和可观察状态必须与中性证据卡一致。
- 主视角只负责解释，页面结构仍由领域 Skill 负责；辅助视角不能接管中心、结构和结尾。
- 重大重解释应在日志记录主视角、辅助任务和重跑范围。新增人物必须由动态发现脚本自动出现，下游 Skill 不得复制人物名单。

## 验证模式

### 只读维护

用户要求检查健康状况但未授权修复时，运行：

```bash
python3 knowledge-engine/tools/validate_wiki_links.py
python3 knowledge-engine/tools/validate_skill_system.py
python3 knowledge-engine/tools/diary_entity_audit.py --check
python3 knowledge-engine/tools/diary_entity_deep_audit.py --check
```

实体检查可能以非零状态报告生成索引陈旧；这是检查结果，不构成重新生成的授权。

### 获授权的 Markdown 修改后

在仓库根目录运行：

```bash
python3 knowledge-engine/tools/update_obsidian_tags.py
python3 knowledge-engine/tools/update_obsidian_tags.py
python3 knowledge-engine/tools/validate_wiki_links.py
```

第二次标签运行必须报告 `updated=0`；链接验证必须报告 `missing=0 ambiguous=0`。

### 获授权的 Skill 或配套工具修改后

还要运行：

```bash
python3 knowledge-engine/tools/validate_skill_system.py
```

可用时，对每个规范 Skill 运行系统自带的快速验证器。

### 重新生成实体索引

只有任务明确包含摄取/重新生成，或来源数量变化使生成索引陈旧时，才运行：

```bash
python3 knowledge-engine/tools/diary_entity_audit.py --write
python3 knowledge-engine/tools/diary_entity_deep_audit.py --write
```

只读审计绝不使用写入模式。

## 需要人工复核的情况

修改格式错误的 YAML、已改名的原始笔记来源、歧义别名、生成索引数量的意外变化，以及需要用户判断的证据冲突前，先人工复核。

## 完成审计

1. 把目标重述为具体交付物。
2. 将每个请求类别映射到已修改或有意保持不变的产物。
3. 检查代表性文件内容和验证器实际输出。
4. 报告跳过的检查和未解决风险。
5. 只要请求中的要求仍不确定，就继续处理。

验证器通过只能证明它覆盖的约束成立，不能证明用户要求的语义工作已经完成。
