import { describe, expect, it } from "vitest";
import { sourceFolderOptions } from "./source-folders";

describe("source folder options", () => {
  it("keeps the current folder available and removes duplicates", () => {
    expect(sourceFolderOptions([{ path: "日记" }, { path: "读书笔记" }, { path: "日记" }], "日记/2026")).toEqual([
      "读书笔记",
      "日记",
      "日记/2026",
    ]);
  });
});
