# 日记摄取

用户明确说明日记有变化，或要求摄取/运行 wiki 时使用。

## 工作流

1. 使用 Git 状态，并在需要时结合时间戳识别发生变化的日记文件；确认它们属于授权范围。
2. 添加标签或综合前，完整读取每篇日记。
3. 在心中执行信号扫描，并填写影响矩阵每一行。
4. 有证据支持时，更新轻量来源连接：
   - `## 状态追踪`：记录可观察状态证据；
   - `## 相关日记`：连接具体事件或阶段连续性；
   - `## 关联`：链接受影响的 wiki 页面和实体。
5. 把每个 `update` 行路由到唯一负责人；按照矩阵契约处理 `link-only`、`no-op` 和 `defer`。
6. 只有数量或代表性覆盖发生变化时，才更新 `wiki/08 来源索引/日记索引.md`。
7. 只有来源和用户期待支持有实质内容的回应时，才标记 `companion=update`；否则使用 `no-op`。
8. 日记数量变化时，显式重新生成实体索引：

```bash
python3 knowledge-engine/tools/diary_entity_audit.py --write
python3 knowledge-engine/tools/diary_entity_deep_audit.py --write
```

9. 应用质量门；有实质意义的运行要记录完整矩阵。

## 必需的矩阵摘要

```markdown
personal-line=
life-stage=
cycle=
thinking-model=
system=
event=
people=
experience=
state=
index=
public-navigation=
quote-collection=
companion=
```

每个值必须是 `update`、`link-only`、`no-op` 或 `defer`。
