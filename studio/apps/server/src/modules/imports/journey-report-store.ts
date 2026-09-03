import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  JOURNEY_REPORT_DRAFT_END,
  JOURNEY_REPORT_DRAFT_START,
  JOURNEY_REPORT_OUTPUT_END,
  JOURNEY_REPORT_OUTPUT_START,
  type JourneyReportOutputTarget,
  type SourceImportBatch,
  type VaultConfig,
} from "@the-way-here/shared";
import { isPathInside } from "../../path-policy.js";

const maxJourneyDraftLength = 120_000;

export class JourneyReportTargetError extends Error {}

export type MaterializedJourneyReport = {
  visibleAnswer: string;
  savedAt: string;
};

export class JourneyReportStore {
  constructor(private readonly vaultRoot: string) {}

  async assertTarget(config: VaultConfig, target: JourneyReportOutputTarget): Promise<void> {
    const batch = await this.readBatch(config, target.importId);
    const file = batch.files.find((candidate) => candidate.storedPath === target.storedPath);
    if (!file || file.buildKind !== "dialogue" || batch.journey?.reportPath !== target.storedPath) {
      throw new JourneyReportTargetError("要更新的消费旅程报告不存在");
    }
    this.resolveReportPath(config, target.storedPath);
  }

  async prepareTarget(config: VaultConfig, target: JourneyReportOutputTarget): Promise<JourneyReportOutputTarget> {
    await this.assertTarget(config, target);
    const content = await readFile(this.resolveReportPath(config, target.storedPath), "utf8");
    return { ...target, expectedContentHash: contentHash(content) };
  }

  async materialize(config: VaultConfig, target: JourneyReportOutputTarget, output: string): Promise<MaterializedJourneyReport> {
    await this.assertTarget(config, target);
    const { visibleAnswer, draft } = extractJourneyReportOutput(output);
    const reportPath = this.resolveReportPath(config, target.storedPath);
    const current = await readFile(reportPath, "utf8");
    if (target.expectedContentHash && target.expectedContentHash !== contentHash(current)) {
      throw new JourneyReportTargetError("消费旅程报告在对话期间被修改了；请重新打开对话后再整理，避免覆盖较新的内容");
    }
    const updated = replaceJourneyDraft(current, draft);
    const temporary = `${reportPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, updated, "utf8");
    await rename(temporary, reportPath);
    return { visibleAnswer, savedAt: new Date().toISOString() };
  }

  private resolveReportPath(config: VaultConfig, storedPath: string): string {
    const sourceRoot = path.resolve(this.vaultRoot, config.paths.sources);
    const reportPath = path.resolve(this.vaultRoot, storedPath);
    if (!isPathInside(sourceRoot, reportPath) || !/\.md$/i.test(reportPath)) {
      throw new JourneyReportTargetError("消费旅程报告路径无效");
    }
    return reportPath;
  }

  private async readBatch(config: VaultConfig, importId: string): Promise<SourceImportBatch> {
    if (!/^[a-z0-9-]+$/i.test(importId)) throw new JourneyReportTargetError("消费旅程导入编号无效");
    const manifest = path.resolve(this.vaultRoot, config.paths.sources, ".imports", `${importId}.json`);
    try {
      return JSON.parse(await readFile(manifest, "utf8")) as SourceImportBatch;
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new JourneyReportTargetError("消费旅程导入记录不存在");
      throw error;
    }
  }
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function extractJourneyReportOutput(output: string): { visibleAnswer: string; draft: string } {
  const start = output.lastIndexOf(JOURNEY_REPORT_OUTPUT_START);
  const end = output.indexOf(JOURNEY_REPORT_OUTPUT_END, start + JOURNEY_REPORT_OUTPUT_START.length);
  if (start < 0 || end < 0) throw new JourneyReportTargetError("Agent 没有生成可保存的消费旅程报告");
  const draft = output.slice(start + JOURNEY_REPORT_OUTPUT_START.length, end).trim();
  if (!draft) throw new JourneyReportTargetError("Agent 生成的消费旅程报告为空");
  if (draft.length > maxJourneyDraftLength) throw new JourneyReportTargetError("消费旅程报告过长，请缩小本轮整理范围");
  if (draft.includes(JOURNEY_REPORT_DRAFT_START) || draft.includes(JOURNEY_REPORT_DRAFT_END)) {
    throw new JourneyReportTargetError("消费旅程报告包含无效的内部标记");
  }
  const visibleAnswer = `${output.slice(0, start)}${output.slice(end + JOURNEY_REPORT_OUTPUT_END.length)}`.trim();
  return { visibleAnswer: visibleAnswer || "消费旅程报告已经更新。", draft };
}

export function replaceJourneyDraft(report: string, draft: string): string {
  const start = report.indexOf(JOURNEY_REPORT_DRAFT_START);
  const end = report.indexOf(JOURNEY_REPORT_DRAFT_END, start + JOURNEY_REPORT_DRAFT_START.length);
  if (start < 0 && end < 0) {
    const insertionPoint = report.indexOf("# 值得继续讲述的线索");
    if (insertionPoint < 0) throw new JourneyReportTargetError("消费旅程报告缺少可更新区域");
    const section = `# 已确认的消费旅程\n\n${JOURNEY_REPORT_DRAFT_START}\n${draft}\n${JOURNEY_REPORT_DRAFT_END}\n\n`;
    return `${report.slice(0, insertionPoint)}${section}${report.slice(insertionPoint)}`;
  }
  if (start < 0 || end < 0) throw new JourneyReportTargetError("消费旅程报告的更新区域不完整");
  return `${report.slice(0, start + JOURNEY_REPORT_DRAFT_START.length)}\n${draft}\n${report.slice(end)}`;
}
