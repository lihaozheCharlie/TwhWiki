import type { SourceImportBatch, WikiPageSummary } from "@the-way-here/shared";

export type SourceRecordType = "notes" | "ai" | "wechat" | "bill";
export type ImportSelectionKind = "file" | "files" | "folder" | "archive";
export type SourceBuildRecord = { batch: SourceImportBatch; file: SourceImportBatch["files"][number] };
export type SourceBuildPresentation = {
  label: string;
  detail?: string;
  tone: "attention" | "progress" | "done" | "quiet";
};
export type SourceBuildActionPresentation =
  | { kind: "hidden" }
  | { kind: "open"; label: "查看进度" | "继续聊聊"; runId: string }
  | { kind: "start"; label: string };

export const sourceRecordTypes: ReadonlyArray<{ id: "all" | SourceRecordType; label: string }> = [
  { id: "all", label: "全部" },
  { id: "notes", label: "日记与笔记" },
  { id: "ai", label: "AI 对话" },
  { id: "wechat", label: "微信记录" },
  { id: "bill", label: "消费账单" },
];

export function cleanSourcePath(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const sourceRoot = parts.findIndex((part) => /^(原始知识库|sources?)$/i.test(part));
  const logical = sourceRoot >= 0 ? parts.slice(sourceRoot + 1) : parts;
  return logical.map((part) => part === "imported" ? "待整理" : part).join("/");
}

export function importedFolderForBatch(batch: Pick<SourceImportBatch, "files" | "targetFolder">): string {
  const parentPaths = batch.files.map((file) => cleanSourcePath(file.storedPath).split("/").filter(Boolean).slice(0, -1));
  if (!parentPaths.length) return cleanSourcePath(batch.targetFolder || "");
  const first = parentPaths[0]!;
  let commonDepth = 0;
  while (commonDepth < first.length && parentPaths.every((path) => path[commonDepth] === first[commonDepth])) commonDepth += 1;
  return first.slice(0, commonDepth).join("/") || cleanSourcePath(batch.targetFolder || "");
}

export function sourceRecordType(page: Pick<WikiPageSummary, "relativePath" | "type" | "tags">): SourceRecordType {
  const identity = `${page.relativePath} ${page.type || ""} ${page.tags.join(" ")}`.toLocaleLowerCase();
  if (/(消费账单|支付宝|alipay|payment|bill)/i.test(identity)) return "bill";
  if (/(微信|wechat)/i.test(identity)) return "wechat";
  if (/(ai聊天记录|ai 对话|chatgpt|gemini|deepseek|豆包|claude)/i.test(identity)) return "ai";
  return "notes";
}

export function sourceRecordDate(page: Pick<WikiPageSummary, "title" | "relativePath" | "start" | "modifiedAt">): Date {
  const datedIdentity = `${page.start || ""} ${page.title} ${page.relativePath}`;
  const explicitDate = datedIdentity.match(/(?:19|20)\d{2}[-/.,，](?:0?[1-9]|1[0-2])[-/.,，](?:[12]\d|3[01]|0?[1-9])(?!\d)/)?.[0]?.replace(/[-/.,，]/g, "-");
  const parsed = new Date(explicitDate ? `${explicitDate}T00:00:00` : page.modifiedAt);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function sourceRecordMonth(page: Pick<WikiPageSummary, "title" | "relativePath" | "start" | "modifiedAt">): string {
  const date = sourceRecordDate(page);
  if (date.getTime() === 0) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function sourceMonthLabel(month: string): string {
  const [year, number] = month.split("-");
  return `${year?.slice(-2)}年${Number(number)}月`;
}

export function sourceMonthOptions(pages: WikiPageSummary[]): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const month = sourceRecordMonth(page);
    if (month) counts.set(month, (counts.get(month) || 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([id, count]) => ({ id, count }));
}

export function countRecentSources(pages: WikiPageSummary[], now = new Date()): number {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return pages.filter((page) => {
    const modified = new Date(page.modifiedAt).getTime();
    return Number.isFinite(modified) && modified >= weekAgo && modified <= now.getTime();
  }).length;
}

export function detectImportSelectionKind(paths: string[]): ImportSelectionKind {
  if (paths.some((path) => path.replace(/\\/g, "/").includes("/"))) return "folder";
  if (paths.length > 1) return "files";
  if (paths.some((path) => /\.zip$/i.test(path))) return "archive";
  return "file";
}

export function sourceBuildRecords(batches: SourceImportBatch[]): SourceBuildRecord[] {
  return batches.flatMap((batch) => batch.files.filter((file) => file.buildKind).map((file) => ({ batch, file })));
}

export function pendingSourceBuildRecords(batches: SourceImportBatch[]): SourceBuildRecord[] {
  return sourceBuildRecords(batches).filter(({ file }) => file.buildStatus !== "built");
}

export function sourceBuildRecordForPage(page: Pick<WikiPageSummary, "relativePath">, records: SourceBuildRecord[]): SourceBuildRecord | undefined {
  const sourcePath = page.relativePath.replace(/\\/g, "/");
  return records.find(({ file }) => file.storedPath.replace(/\\/g, "/") === sourcePath);
}

export function sourceBuildPresentation(file: SourceBuildRecord["file"]): SourceBuildPresentation {
  if (file.buildStatus === "built") return { label: "已构建", tone: "done" };
  if (file.buildStatus === "building") return { label: "构建中", detail: "完成后会显示实际改动", tone: "progress" };
  if (file.buildStatus === "in-dialogue") return { label: "对话中", detail: "还没有需要确认的改动", tone: "progress" };
  if (file.buildStatus === "deferred") return { label: "稍后再说", detail: file.buildKind === "direct" ? "可直接构建" : file.buildKind === "dialogue" ? "线索已经留好" : "等待确认类型", tone: "quiet" };
  if (file.buildKind === "dialogue") return { label: "待厘清", detail: file.clueCount ? `已识别 ${file.clueCount} 条候选线索` : "等一次对话", tone: "attention" };
  if (file.buildKind === "identify") return { label: "待确认类型", detail: "先告诉我这是什么", tone: "quiet" };
  return { label: "待构建", detail: "可直接构建", tone: "attention" };
}

export function sourceBuildActionPresentation(file: SourceBuildRecord["file"]): SourceBuildActionPresentation {
  const active = file.buildStatus === "building" || file.buildStatus === "in-dialogue";
  if (file.buildKind === "dialogue" && file.buildRunId) {
    return { kind: "open", label: active ? "查看进度" : "继续聊聊", runId: file.buildRunId };
  }
  if (file.buildStatus === "built") return { kind: "hidden" };
  if (active) return file.buildRunId
    ? { kind: "open", label: "查看进度", runId: file.buildRunId }
    : { kind: "hidden" };
  return {
    kind: "start",
    label: file.buildKind === "direct" ? "构建这份记录" : file.buildKind === "dialogue" ? "聊聊这段旅程" : "帮我看看",
  };
}
