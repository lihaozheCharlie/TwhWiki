# 来源索引构建器

来源索引回答：**证据在哪里，未来的模型如何高效找到它？**

## 先读

- `knowledge-engine/skills/common/filing-rules.md`
- `knowledge-engine/skills/common/quality-gate/SKILL.md`
- `wiki/08 来源索引/` 下的既有页面

## 契约

- 只有覆盖范围变化时，才更新数量和代表性条目。
- 一致地更新 `Start`、`end` 和 `source`。
- 手写导航应链接有代表性、高杠杆的来源，不要复制每一条生成记录。
- 生成索引只能通过显式 `--write` 命令重新生成；只读维护使用 `--check`。
- 对话始终是次级且必须明确标注的来源类型。
