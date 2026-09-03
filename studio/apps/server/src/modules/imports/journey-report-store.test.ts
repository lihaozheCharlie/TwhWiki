import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JourneyReportOutputTarget, SourceImportBatch, VaultConfig } from "@the-way-here/shared";
import { JourneyReportStore, JourneyReportTargetError, extractJourneyReportOutput, replaceJourneyDraft } from "./journey-report-store.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const config = {
  knowledgeBaseId: "demo",
  paths: { sources: "vault/demo/sources" },
} as VaultConfig;

describe("JourneyReportStore", () => {
  it("writes only the managed draft and keeps the conversational answer separate", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-journey-report-"));
    roots.push(root);
    const sourceRoot = path.join(root, config.paths.sources);
    const reportPath = "vault/demo/sources/消费账单/旅程.md";
    const target: JourneyReportOutputTarget = { kind: "journey-report", importId: "batch-1", storedPath: reportPath, label: "消费旅程报告" };
    const batch: SourceImportBatch = {
      id: "batch-1", createdAt: "2026-09-03T00:00:00.000Z", fileCount: 1, totalBytes: 1,
      files: [{ originalName: "账单.csv", storedPath: reportPath, bytes: 1, buildKind: "dialogue", buildStatus: "needs-dialogue" }],
      journey: { provider: "alipay", title: "旅程", reportPath, period: { start: "2026-08-01", end: "2026-08-02" }, transactionCount: 2, activeDays: 2, netExpense: 20, refundCount: 0, clusters: [], agentPrompt: "聊聊" },
    };
    await mkdir(path.join(sourceRoot, ".imports"), { recursive: true });
    await mkdir(path.dirname(path.join(root, reportPath)), { recursive: true });
    await writeFile(path.join(sourceRoot, ".imports", "batch-1.json"), JSON.stringify(batch));
    await writeFile(path.join(root, reportPath), "# 已确认的消费旅程\n\n<!-- the-way-here:journey-draft:start -->\n旧草稿\n<!-- the-way-here:journey-draft:end -->\n\n# 交易证据\n不可改");

    const store = new JourneyReportStore(root);
    const prepared = await store.prepareTarget(config, target);
    const saved = await store.materialize(config, prepared, "我记下来了。接下来想聊谁同行？\n<journey-report>\n## 北京两日\n这是用户确认的经历。\n</journey-report>");

    expect(saved.visibleAnswer).toBe("我记下来了。接下来想聊谁同行？");
    expect(await readFile(path.join(root, reportPath), "utf8")).toBe("# 已确认的消费旅程\n\n<!-- the-way-here:journey-draft:start -->\n## 北京两日\n这是用户确认的经历。\n<!-- the-way-here:journey-draft:end -->\n\n# 交易证据\n不可改");

    const staleTarget = await store.prepareTarget(config, target);
    await writeFile(path.join(root, reportPath), `${await readFile(path.join(root, reportPath), "utf8")}\n手工补充`);
    await expect(store.materialize(config, staleTarget, "回答\n<journey-report>新草稿</journey-report>")).rejects.toThrow("被修改了");
  });

  it("rejects output without a complete report block", () => {
    expect(() => extractJourneyReportOutput("只有对话，没有报告")).toThrow(JourneyReportTargetError);
  });

  it("adds a managed draft section to reports imported before the two-stage workflow", () => {
    const migrated = replaceJourneyDraft("# 旧报告\n\n说明\n\n# 值得继续讲述的线索\n\n候选", "## 已确认故事\n正文");
    expect(migrated).toContain("# 已确认的消费旅程\n\n<!-- the-way-here:journey-draft:start -->\n## 已确认故事\n正文\n<!-- the-way-here:journey-draft:end -->");
    expect(migrated).toContain("# 值得继续讲述的线索\n\n候选");
  });
});
