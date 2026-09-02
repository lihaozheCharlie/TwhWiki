import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
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

describe("ImportStore payment journey", () => {
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
});
