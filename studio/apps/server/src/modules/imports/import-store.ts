import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SourceBuildStatus, SourceBuiltRef, SourceImportBatch, SourceImportChannel, SourceImportFile, WikiPage, WikiRun } from "@the-way-here/shared";
import { prepareImportBatch } from "./prepare-import.js";
import { isPathInside, normalizeSourceFolder } from "../../path-policy.js";
import { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";

const importChannels = new Set<SourceImportChannel>(["files", "chatgpt", "claude", "gemini", "deepseek", "doubao", "other-ai", "alipay"]);

export type ImportRequest = { files?: SourceImportFile[]; channel?: SourceImportChannel; targetFolder?: string };

export class ImportRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export class ImportStore {
  constructor(private readonly knowledge: KnowledgeRuntime) {}

  async list(runs: WikiRun[] = []): Promise<SourceImportBatch[]> {
    const manifestRoot = this.manifestRoot();
    let files: string[];
    try {
      files = (await readdir(manifestRoot)).filter((file) => file.endsWith(".json"));
    } catch (error: any) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const batches = await Promise.all(files.map(async (file) => {
      try {
        return JSON.parse(await readFile(path.join(manifestRoot, file), "utf8")) as SourceImportBatch;
      } catch {
        return undefined;
      }
    }));
    const available = batches.filter((batch): batch is SourceImportBatch => Boolean(batch)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!runs.length) return available;
    await Promise.all(available.map((batch) => this.reconcileBuildRuns(batch, runs)));
    return available;
  }

  async updateBuildStatus(batchId: string, storedPath: string, status: Extract<SourceBuildStatus, "deferred">): Promise<SourceImportBatch> {
    const batch = await this.read(batchId);
    const file = batch.files.find((candidate) => candidate.storedPath === storedPath && candidate.buildKind);
    if (!file) throw new ImportRequestError(404, "没有找到这份待构建记录");
    if (file.buildStatus === "built") throw new ImportRequestError(409, "这份记录已经收进理解");
    file.buildStatus = status;
    file.buildError = undefined;
    file.buildUpdatedAt = new Date().toISOString();
    await this.writeBatch(batch);
    this.knowledge.events.broadcast("import", { importId: batch.id, storedPath, buildStatus: status });
    return batch;
  }

  async trackCreatedSource(page: Pick<WikiPage, "relativePath" | "title" | "markdown">): Promise<SourceImportBatch> {
    const storedPath = page.relativePath.replace(/\\/g, "/");
    const target = path.resolve(this.knowledge.vaultRoot, storedPath);
    const sourceRoot = this.sourceRoot();
    if (!isPathInside(sourceRoot, target) || !/\.md$/i.test(storedPath)) throw new ImportRequestError(400, "只能登记生活记录中的 Markdown 文件");
    const createdAt = new Date().toISOString();
    const bytes = Buffer.byteLength(page.markdown, "utf8");
    const file = {
      originalName: path.posix.basename(storedPath) || `${page.title}.md`,
      storedPath,
      bytes,
      buildKind: "direct" as const,
      buildStatus: "ready" as const,
      buildUpdatedAt: createdAt,
    };
    const batch: SourceImportBatch = {
      id: importBatchId(createdAt, [storedPath]),
      createdAt,
      channel: "files",
      targetFolder: path.relative(sourceRoot, path.dirname(target)).split(path.sep).join("/"),
      fileCount: 1,
      totalBytes: bytes,
      files: [file],
    };
    await this.writeBatch(batch);
    this.knowledge.events.broadcast("import", { importId: batch.id, storedPath, buildStatus: file.buildStatus });
    return batch;
  }

  async create(request: ImportRequest): Promise<SourceImportBatch> {
    const files = request.files;
    if (!Array.isArray(files) || files.length === 0) throw new ImportRequestError(400, "请选择需要导入的材料");
    if (files.some((file) => typeof file?.name !== "string" || typeof file?.content !== "string")) throw new ImportRequestError(400, "导入文件格式无效");
    const channel = request.channel || "files";
    if (!importChannels.has(channel)) throw new ImportRequestError(400, "不支持这个导入渠道");
    let targetFolder: string;
    try {
      targetFolder = normalizeSourceFolder(request.targetFolder || "");
    } catch (error: any) {
      throw new ImportRequestError(400, error.message);
    }

    const createdAt = new Date().toISOString();
    const id = importBatchId(createdAt, files.map((file) => file.relativePath || file.name));
    const sourceRoot = this.sourceRoot();
    const targetRoot = path.resolve(sourceRoot, targetFolder);
    if (targetRoot !== sourceRoot && !isPathInside(sourceRoot, targetRoot)) throw new ImportRequestError(403, "目标文件夹超出原始知识目录");
    let prepared;
    try {
      prepared = prepareImportBatch(files, channel, createdAt);
    } catch (error: any) {
      throw new ImportRequestError(400, error.message);
    }
    await mkdir(targetRoot, { recursive: true });
    const stored: SourceImportBatch["files"] = [];
    for (const file of prepared.files) {
      let target: string;
      try {
        target = await this.writeUnique(targetRoot, file.relativePath, file.content);
      } catch (error: any) {
        throw new ImportRequestError(400, error.message);
      }
      const storedPath = path.relative(this.knowledge.vaultRoot, target).split(path.sep).join("/");
      const build = classifyBuild(file.relativePath, file.content, prepared.journey);
      stored.push({ originalName: file.originalName, storedPath, bytes: file.bytes, ...build, buildUpdatedAt: build.buildStatus ? createdAt : undefined });
    }
    const batch: SourceImportBatch = {
      id,
      createdAt,
      channel,
      targetFolder: targetFolder.split(path.sep).join("/"),
      fileCount: stored.length,
      totalBytes: prepared.files.reduce((total, file) => total + file.bytes, 0),
      files: stored,
      journey: prepared.journey,
    };
    if (batch.journey) {
      const report = stored.find((file) => file.storedPath.endsWith(".md"));
      if (report) {
        const originalReportPath = batch.journey.reportPath;
        batch.journey.agentPrompt = batch.journey.agentPrompt.replace(originalReportPath, report.storedPath);
        batch.journey.reportPath = report.storedPath;
      }
    }
    await mkdir(this.manifestRoot(), { recursive: true });
    await this.writeBatch(batch);
    await this.knowledge.index.rebuild();
    this.knowledge.events.broadcast("index", { at: this.knowledge.index.lastIndexedAt, importId: id });
    return batch;
  }

  private sourceRoot(): string {
    return path.resolve(this.knowledge.vaultRoot, this.knowledge.index.config.paths.sources);
  }

  private manifestRoot(): string {
    return path.resolve(this.sourceRoot(), ".imports");
  }

  private async read(id: string): Promise<SourceImportBatch> {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new ImportRequestError(400, "导入批次编号无效");
    try {
      return JSON.parse(await readFile(path.join(this.manifestRoot(), `${id}.json`), "utf8")) as SourceImportBatch;
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new ImportRequestError(404, "导入批次不存在");
      throw error;
    }
  }

  private async writeBatch(batch: SourceImportBatch): Promise<void> {
    await mkdir(this.manifestRoot(), { recursive: true });
    const target = path.join(this.manifestRoot(), `${batch.id}.json`);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  private async reconcileBuildRuns(batch: SourceImportBatch, runs: WikiRun[]): Promise<void> {
    let changed = false;
    for (const file of batch.files) {
      if (!file.buildKind) continue;
      const relatedRuns = runs.filter((candidate) => runMatchesFile(candidate, batch.id, file.storedPath, file.buildKind!))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      if (file.buildKind === "dialogue" && relatedRuns.length) {
        const before = JSON.stringify(file);
        reconcileDialogueBuild(file, relatedRuns, (run) => this.builtRefs(run));
        if (before !== JSON.stringify(file)) changed = true;
        continue;
      }
      const run = relatedRuns[0];
      if (!run || file.buildRunId === run.id && file.buildStatus === resolvedBuildStatus(file.buildKind, run)) continue;
      if (file.buildStatus === "deferred" && ["completed", "failed", "interrupted"].includes(run.status)) continue;
      const status = resolvedBuildStatus(file.buildKind, run);
      const refs = status === "built" ? this.builtRefs(run) : undefined;
      if (file.buildRunId !== run.id || file.buildStatus !== status || JSON.stringify(file.builtRefs) !== JSON.stringify(refs)) changed = true;
      file.buildRunId = run.id;
      file.buildStatus = status;
      file.builtRefs = refs;
      file.buildError = run.status === "failed" ? run.error || "构建没有完成，可以稍后再试" : undefined;
      file.buildUpdatedAt = run.updatedAt;
    }
    if (changed) await this.writeBatch(batch);
  }

  private builtRefs(run: WikiRun): SourceBuiltRef[] {
    const pages = new Map(this.knowledge.index.list({ sources: false }).map((page) => [page.relativePath, page]));
    const wikiRoot = `${run.configSnapshot.paths.wiki.replace(/\\/g, "/").replace(/\/$/, "")}/`;
    return run.changes.flatMap((change) => {
      if (!change.path.replace(/\\/g, "/").startsWith(wikiRoot) || change.kind === "deleted") return [];
      const page = pages.get(change.path);
      return page ? [{ pageId: page.id, path: change.path, title: page.title }] : [];
    });
  }

  private async writeUnique(root: string, relativePath: string, content: string): Promise<string> {
    const extension = path.posix.extname(relativePath);
    const base = relativePath.slice(0, -extension.length);
    for (let copy = 1; copy <= 10_000; copy += 1) {
      const candidatePath = copy === 1 ? relativePath : `${base} (${copy})${extension}`;
      const target = path.resolve(root, candidatePath);
      if (!isPathInside(root, target)) throw new Error(`文件路径无效：${relativePath}`);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await writeFile(target, content, { encoding: "utf8", flag: "wx" });
        return target;
      } catch (error: any) {
        if (error?.code !== "EEXIST") throw error;
      }
    }
    throw new Error(`同名文件过多，无法保存：${relativePath}`);
  }
}

function importBatchId(createdAt: string, identities: string[]): string {
  const digest = createHash("sha256").update(`${createdAt}:${identities.join("|")}`).digest("hex").slice(0, 8);
  return `${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${digest}`;
}

function classifyBuild(relativePath: string, content: string, journey?: SourceImportBatch["journey"]): Pick<SourceImportBatch["files"][number], "buildKind" | "buildStatus" | "clueCount"> {
  if (!/\.md$/i.test(relativePath)) return {};
  if (journey && relativePath === journey.reportPath) return { buildKind: "dialogue", buildStatus: "needs-dialogue", clueCount: journey.clusters.length };
  const readable = content.replace(/^---[\s\S]*?---\s*/m, "").replace(/[#>*_`\[\]()|-]/g, " ").replace(/\s+/g, " ").trim();
  if (readable.length < 40) return { buildKind: "identify", buildStatus: "ready" };
  return { buildKind: "direct", buildStatus: "ready" };
}

function resolvedBuildStatus(kind: NonNullable<SourceImportBatch["files"][number]["buildKind"]>, run: WikiRun): SourceBuildStatus {
  if (["preparing", "running", "waiting-approval", "validating"].includes(run.status)) return kind === "direct" ? "building" : "in-dialogue";
  const contentWasWritten = run.changes.length > 0 && Boolean(run.result?.completedAt);
  if ((run.status === "completed" || contentWasWritten) && (kind === "direct" || run.changes.length > 0)) return "built";
  return kind === "direct" || kind === "identify" ? "ready" : "needs-dialogue";
}

function runMatchesFile(run: WikiRun, importId: string, storedPath: string, kind: NonNullable<SourceImportBatch["files"][number]["buildKind"]>): boolean {
  if (run.outputTarget?.kind === "photo-memory" && run.outputTarget.phase === "analyze") return false;
  if (run.outputTarget?.kind === "journey-report" || run.outputTarget?.kind === "photo-memory") {
    return run.outputTarget.importId === importId && run.outputTarget.storedPath === storedPath;
  }
  const context = run.sourceContext;
  if (!context) return false;
  if (context.storedPaths?.includes(storedPath)) return true;
  return context.importId === importId && (context.storedPath === storedPath || Boolean(context.allDirect && kind === "direct"));
}

function reconcileDialogueBuild(file: SourceImportBatch["files"][number], runs: WikiRun[], builtRefs: (run: WikiRun) => SourceBuiltRef[]): void {
  const enrichRuns = runs.filter((run) => (run.outputTarget?.kind === "journey-report" || run.outputTarget?.kind === "photo-memory") || run.sourceContext?.operation === "enrich");
  const buildRuns = runs.filter((run) => run.sourceContext?.operation === "build"
    || run.sourceContext?.operation === undefined && run.outputTarget?.kind !== "journey-report" && run.outputTarget?.kind !== "photo-memory");
  const latestEnrich = enrichRuns[0];
  const latestBuild = buildRuns[0];
  const activeEnrich = enrichRuns.find((run) => activeRun(run));
  const activeBuild = buildRuns.find((run) => activeRun(run));
  const savedEnrich = enrichRuns.find((run) => run.status === "completed" && Boolean(run.result?.outputSavedAt));
  const completedBuild = buildRuns.find((run) => (run.status === "completed" && run.sourceContext?.operation === "build")
    || Boolean(run.result?.completedAt && run.changes.length));
  const latestRelevant = runs[0];

  file.dialogueRunId = latestEnrich?.id;
  file.buildRunId = latestBuild?.id;
  file.journeyUpdatedAt = savedEnrich?.result?.outputSavedAt;
  file.builtRefs = completedBuild ? builtRefs(completedBuild) : undefined;
  file.buildError = latestRelevant?.status === "failed" ? latestRelevant.error || "这一步没有完成，可以稍后再试" : undefined;
  file.buildUpdatedAt = latestRelevant?.updatedAt;

  const newestActive = [activeEnrich, activeBuild].filter((run): run is WikiRun => Boolean(run))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (newestActive) {
    file.buildStatus = newestActive.outputTarget?.kind === "journey-report" || newestActive.sourceContext?.operation === "enrich" ? "in-dialogue" : "building";
    return;
  }
  if (savedEnrich && (!completedBuild || runTime(savedEnrich) > runTime(completedBuild))) {
    file.buildStatus = "ready-to-build";
    return;
  }
  if (completedBuild) {
    file.buildStatus = "built";
    return;
  }
  if (file.buildStatus !== "deferred") file.buildStatus = "needs-dialogue";
}

function activeRun(run: WikiRun): boolean {
  return ["preparing", "running", "waiting-approval", "validating"].includes(run.status);
}

function runTime(run: WikiRun): number {
  return new Date(run.result?.outputSavedAt || run.result?.completedAt || run.updatedAt).getTime();
}
