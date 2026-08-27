import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathInside, markdownFileName, normalizeSourceFolder } from "./path-policy.js";

describe("Wiki write path policy", () => {
  const root = path.resolve("/vault/wiki");

  it("allows a file below the configured Wiki directory", () => {
    expect(isPathInside(root, path.join(root, "02 stages", "current.md"))).toBe(true);
  });

  it("rejects the directory itself and path traversal outside it", () => {
    expect(isPathInside(root, root)).toBe(false);
    expect(isPathInside(root, path.resolve(root, "../sources/private.md"))).toBe(false);
  });
});

describe("Source file path policy", () => {
  it("normalizes a nested folder and Markdown file name", () => {
    expect(normalizeSourceFolder("日记/2026")).toBe(path.join("日记", "2026"));
    expect(markdownFileName("新的记录")).toBe("新的记录.md");
  });

  it("rejects traversal and removes filename separators", () => {
    expect(() => normalizeSourceFolder("../private")).toThrow("文件夹路径无效");
    expect(markdownFileName("项目/复盘")).toBe("项目-复盘.md");
  });
});
