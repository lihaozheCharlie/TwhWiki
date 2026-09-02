import { describe, expect, it } from "vitest";
import type { SourceImportBatch, WikiPageSummary } from "@the-way-here/shared";
import { countRecentSources, importedFolderForBatch, sourceMonthOptions, sourceRecordMonth, sourceRecordType } from "./source-model";

function page(overrides: Partial<WikiPageSummary>): WikiPageSummary {
  return {
    id: "source",
    relativePath: "sources/日记/今天.md",
    title: "今天",
    category: "sources",
    aliases: [],
    tags: [],
    locations: [],
    sources: [],
    excerpt: "",
    modifiedAt: "2026-08-31T10:00:00.000Z",
    isSource: true,
    ...overrides,
  };
}

describe("life record presentation model", () => {
  it("classifies the supported source families from their durable metadata", () => {
    expect(sourceRecordType(page({ relativePath: "sources/AI聊天记录/ChatGPT/对话.md" }))).toBe("ai");
    expect(sourceRecordType(page({ relativePath: "sources/微信聊天记录/朋友.md" }))).toBe("wechat");
    expect(sourceRecordType(page({ tags: ["支付宝"] }))).toBe("bill");
    expect(sourceRecordType(page({ relativePath: "sources/随手笔记/灵感.md" }))).toBe("notes");
  });

  it("prefers the record date embedded in the source over the file modification time", () => {
    expect(sourceRecordMonth(page({ title: "2024-06-30 离开熟悉轨道" }))).toBe("2024-06");
    expect(sourceRecordMonth(page({ title: "2017，11,20 苟日新" }))).toBe("2017-11");
  });

  it("orders populated months newest first and keeps their counts", () => {
    const options = sourceMonthOptions([
      page({ id: "a", title: "2025-12-01" }),
      page({ id: "b", title: "2026-01-03" }),
      page({ id: "c", title: "2026-01-18" }),
    ]);
    expect(options).toEqual([{ id: "2026-01", count: 2 }, { id: "2025-12", count: 1 }]);
  });

  it("counts only files modified during the latest seven days", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(countRecentSources([
      page({ id: "new", modifiedAt: "2026-08-31T10:00:00.000Z" }),
      page({ id: "old", modifiedAt: "2026-08-01T10:00:00.000Z" }),
    ], now)).toBe(1);
  });

  it("opens the common folder that actually received an imported directory", () => {
    const batch = {
      targetFolder: "日记",
      files: [
        { originalName: "一月.md", storedPath: "sources/日记/2026/一月.md", bytes: 12 },
        { originalName: "二月.md", storedPath: "sources/日记/2026/二月.md", bytes: 12 },
      ],
    } satisfies Pick<SourceImportBatch, "files" | "targetFolder">;

    expect(importedFolderForBatch(batch)).toBe("日记/2026");
  });

  it("falls back to the selected destination when a batch has no stored file details", () => {
    expect(importedFolderForBatch({ targetFolder: "AI聊天记录/ChatGPT", files: [] })).toBe("AI聊天记录/ChatGPT");
  });

  it("does not treat a matching nested segment as a shared folder", () => {
    expect(importedFolderForBatch({
      targetFolder: "",
      files: [
        { originalName: "一月.md", storedPath: "sources/甲/2026/一月.md", bytes: 12 },
        { originalName: "二月.md", storedPath: "sources/乙/2026/二月.md", bytes: 12 },
      ],
    })).toBe("");
  });
});
