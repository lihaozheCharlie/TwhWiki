import { describe, expect, it } from "vitest";
import { editableMarkdownDocument, shouldEnterDocumentEditMode } from "./markdown";

describe("shared Markdown reading behavior", () => {
  it("enters editing only from a double click on the document surface", () => {
    expect(shouldEnterDocumentEditMode({ clickCount: 1, insideControl: false })).toBe(false);
    expect(shouldEnterDocumentEditMode({ clickCount: 2, insideControl: false })).toBe(true);
    expect(shouldEnterDocumentEditMode({ clickCount: 2, insideControl: true })).toBe(false);
  });

  it("keeps a source title outside the editable Markdown body", () => {
    const document = editableMarkdownDocument(
      "---\ntags:\n  - 日记\n---\n# 2026.09.03 接受不确定的能力\n\n好久没写了。\n\n# 正文中的一级标题\n",
      true,
    );

    expect(document.body).toBe("好久没写了。\n\n# 正文中的一级标题\n");
    expect(`${document.prefix}${document.body}`).toBe(
      "---\ntags:\n  - 日记\n---\n# 2026.09.03 接受不确定的能力\n\n好久没写了。\n\n# 正文中的一级标题\n",
    );
  });

  it("does not hide a heading from a Wiki page or the middle of source content", () => {
    expect(editableMarkdownDocument("# Wiki 页面标题\n\n正文\n", false).body).toBe("# Wiki 页面标题\n\n正文\n");
    expect(editableMarkdownDocument("开场\n\n# 正文章节\n", true).body).toBe("开场\n\n# 正文章节\n");
  });
});
