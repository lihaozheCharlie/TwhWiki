import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WikiPage, WikiRun } from "@the-way-here/shared";
import type { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";
import { ImportStore } from "./import-store.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function smallStatement(): string {
  const header = "交易号,商家订单号,交易创建时间,付款时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态";
  const row = (index: number, date: string) => `${String(index).padStart(28, "0")},order-${index},${date},${date},${date},其他,即时到账交易,24H便利购,杭州西溪园区智能货柜消费,4.00,支出,交易成功,0.00,0.00,,已支出`;
  return ["支付宝交易记录明细查询", header, row(1, "2026-08-01 12:00:00"), row(2, "2026-08-02 12:00:00"), row(3, "2026-08-03 12:00:00"), "----------", "共3笔记录"].join("\r");
}

describe("ImportStore", () => {
  it("tracks a newly created source as ready for a direct Wiki build", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-created-source-"));
    roots.push(root);
    const broadcast = vi.fn();
    const knowledge = {
      vaultRoot: root,
      index: { config: { paths: { sources: "sources" } } },
      events: { broadcast },
    } as unknown as KnowledgeRuntime;
    const store = new ImportStore(knowledge);

    const batch = await store.trackCreatedSource({
      id: "sources/日记/新记录",
      relativePath: "sources/日记/新记录.md",
      title: "新记录",
      modifiedAt: "2026-09-03T10:00:00.000Z",
      markdown: "",
    } as WikiPage);

    expect(batch.files[0]).toMatchObject({
      originalName: "新记录.md",
      storedPath: "sources/日记/新记录.md",
      buildKind: "direct",
      buildStatus: "ready",
    });
    expect((await store.list())[0]?.id).toBe(batch.id);
    expect(broadcast).toHaveBeenCalledWith("import", expect.objectContaining({ importId: batch.id, storedPath: "sources/日记/新记录.md" }));
  });

  it("rejects the removed WeChat import channel", async () => {
    const store = new ImportStore({} as KnowledgeRuntime);
    await expect(store.create({ channel: "wechat" as never, files: [{ name: "chat.txt", content: "hello" }] })).rejects.toThrow("不支持这个导入渠道");
  });

  it("stores the report and normalized CSV and returns an Agent-ready report path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-bill-"));
    roots.push(root);
    const rebuild = vi.fn(async () => undefined);
    const broadcast = vi.fn();
    const knowledge = {
      vaultRoot: root,
      index: { config: { paths: { sources: "sources" } }, rebuild, lastIndexedAt: "2026-08-28T00:00:00.000Z" },
      events: { broadcast },
    } as unknown as KnowledgeRuntime;
    const store = new ImportStore(knowledge);

    const batch = await store.create({
      channel: "alipay",
      targetFolder: "消费账单",
      files: [{ name: "alipay.csv", content: Buffer.from(smallStatement()).toString("base64"), encoding: "base64" }],
    });

    expect(batch.fileCount).toBe(2);
    expect(batch.journey?.reportPath).toMatch(/^sources\/消费账单\/.+\.md$/);
    expect(batch.journey?.agentPrompt).toContain(batch.journey!.reportPath);
    expect(batch.files.some((file) => file.storedPath.endsWith(".csv"))).toBe(true);
    const journeyRecord = batch.files.find((file) => file.storedPath === batch.journey?.reportPath);
    expect(journeyRecord).toMatchObject({ buildKind: "dialogue", buildStatus: "needs-dialogue", clueCount: batch.journey?.clusters.length });
    await store.updateBuildStatus(batch.id, journeyRecord!.storedPath, "deferred");
    expect((await store.list())[0]?.files.find((file) => file.storedPath === journeyRecord!.storedPath)?.buildStatus).toBe("deferred");
    expect(await readFile(path.join(root, batch.journey!.reportPath), "utf8")).toContain("反复出现的「24H便利购」");
    expect(rebuild).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith("index", expect.objectContaining({ importId: batch.id }));
  });

  it("derives completion and provenance from the real Agent run", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-build-state-"));
    roots.push(root);
    const knowledge = {
      vaultRoot: root,
      index: {
        config: { paths: { sources: "sources", wiki: "wiki" } },
        rebuild: vi.fn(async () => undefined),
        lastIndexedAt: "2026-09-02T00:00:00.000Z",
        list: () => [{ id: "wiki/理解", relativePath: "wiki/理解.md", title: "新的理解" }],
      },
      events: { broadcast: vi.fn() },
    } as unknown as KnowledgeRuntime;
    const store = new ImportStore(knowledge);
    const batch = await store.create({ channel: "files", files: [{ name: "日记.md", content: "# 日记\n\n今天发生了一件具体的事，也留下了足够完整的前因后果、人物和感受，值得回头继续理解。" }] });
    const record = batch.files.find((file) => file.buildKind === "direct")!;
    const run = {
      id: "run-1",
      status: "failed",
      updatedAt: "2026-09-02T01:00:00.000Z",
      sourceContext: { importId: batch.id, storedPath: record.storedPath, flow: "direct" },
      configSnapshot: { paths: { wiki: "wiki" } },
      changes: [{ path: "wiki/理解.md", kind: "added" }],
      result: { completedAt: "2026-09-02T01:00:00.000Z" },
      error: "知识质量检查未通过",
    } as unknown as WikiRun;

    const reconciled = await store.list([run]);
    expect(reconciled[0]?.files.find((file) => file.storedPath === record.storedPath)).toMatchObject({
      buildStatus: "built",
      buildRunId: "run-1",
      builtRefs: [{ pageId: "wiki/理解", path: "wiki/理解.md", title: "新的理解" }],
      buildError: "知识质量检查未通过",
    });
  });

  it("keeps journey enrichment separate from an explicit Wiki build", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-journey-state-"));
    roots.push(root);
    const knowledge = {
      vaultRoot: root,
      index: {
        config: { paths: { sources: "sources", wiki: "wiki" } },
        rebuild: vi.fn(async () => undefined),
        lastIndexedAt: "2026-09-03T00:00:00.000Z",
        list: () => [],
      },
      events: { broadcast: vi.fn() },
    } as unknown as KnowledgeRuntime;
    const store = new ImportStore(knowledge);
    const batch = await store.create({ channel: "alipay", targetFolder: "消费账单", files: [{ name: "alipay.csv", content: Buffer.from(smallStatement()).toString("base64"), encoding: "base64" }] });
    const record = batch.files.find((file) => file.buildKind === "dialogue")!;
    const enriched = {
      id: "run-enrich-1", status: "completed", mode: "read", updatedAt: "2026-09-03T01:00:00.000Z", changes: [],
      outputTarget: { kind: "journey-report", importId: batch.id, storedPath: record.storedPath, label: "消费旅程报告" },
      sourceContext: { importId: batch.id, storedPath: record.storedPath, flow: "dialogue", operation: "enrich" },
      result: { completedAt: "2026-09-03T01:00:00.000Z", outputSavedAt: "2026-09-03T01:00:00.000Z" },
    } as unknown as WikiRun;
    expect((await store.list([enriched]))[0]?.files.find((file) => file.storedPath === record.storedPath)).toMatchObject({
      buildStatus: "ready-to-build", dialogueRunId: "run-enrich-1", journeyUpdatedAt: "2026-09-03T01:00:00.000Z",
    });

    const built = {
      id: "run-build", status: "completed", mode: "write", updatedAt: "2026-09-03T02:00:00.000Z", changes: [],
      sourceContext: { importId: batch.id, storedPath: record.storedPath, flow: "dialogue", operation: "build" },
      result: { completedAt: "2026-09-03T02:00:00.000Z" },
      configSnapshot: { paths: { wiki: "wiki" } },
    } as unknown as WikiRun;
    expect((await store.list([enriched, built]))[0]?.files.find((file) => file.storedPath === record.storedPath)?.buildStatus).toBe("built");

    const enrichedAgain = {
      ...enriched,
      id: "run-enrich-2",
      updatedAt: "2026-09-03T03:00:00.000Z",
      result: { completedAt: "2026-09-03T03:00:00.000Z", outputSavedAt: "2026-09-03T03:00:00.000Z" },
    } as WikiRun;
    expect((await store.list([enriched, built, enrichedAgain]))[0]?.files.find((file) => file.storedPath === record.storedPath)?.buildStatus).toBe("ready-to-build");
  });

  it("reconciles only the records explicitly selected for a batch build", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-batch-build-state-"));
    roots.push(root);
    const knowledge = {
      vaultRoot: root,
      index: {
        config: { paths: { sources: "sources", wiki: "wiki" } },
        rebuild: vi.fn(async () => undefined),
        lastIndexedAt: "2026-09-02T00:00:00.000Z",
        list: () => [],
      },
      events: { broadcast: vi.fn() },
    } as unknown as KnowledgeRuntime;
    const store = new ImportStore(knowledge);
    const completeContext = "今天发生了一件具体的事，留下了完整的前因后果、人物、选择与感受，值得以后继续理解。";
    const firstBatch = await store.create({ channel: "files", files: [{ name: "一.md", content: completeContext }, { name: "二.md", content: completeContext }] });
    const secondBatch = await store.create({ channel: "files", files: [{ name: "三.md", content: completeContext }] });
    const selected = [firstBatch.files[0]!.storedPath, secondBatch.files[0]!.storedPath];
    const run = {
      id: "run-batch",
      status: "running",
      updatedAt: "2026-09-02T02:00:00.000Z",
      sourceContext: { importId: firstBatch.id, storedPath: selected[0], storedPaths: selected, flow: "direct" },
      configSnapshot: { paths: { wiki: "wiki" } },
      changes: [],
    } as unknown as WikiRun;

    const reconciled = await store.list([run]);
    const records = reconciled.flatMap((batch) => batch.files);
    expect(records.find((file) => file.storedPath === selected[0])?.buildStatus).toBe("building");
    expect(records.find((file) => file.storedPath === selected[1])?.buildStatus).toBe("building");
    expect(records.find((file) => file.storedPath === firstBatch.files[1]!.storedPath)?.buildStatus).toBe("ready");
  });
});
