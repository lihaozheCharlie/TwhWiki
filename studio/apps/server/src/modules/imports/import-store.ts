import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceImportBatch, SourceImportChannel, SourceImportFile } from "@the-way-here/shared";
import { prepareImportFiles } from "../../import-materials.js";
import { isPathInside, normalizeSourceFolder } from "../../path-policy.js";
import { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";

const importChannels = new Set<SourceImportChannel>(["files", "chatgpt", "gemini", "deepseek", "doubao", "other-ai", "wechat"]);

export type ImportRequest = { files?: SourceImportFile[]; channel?: SourceImportChannel; targetFolder?: string };

export class ImportRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export class ImportStore {
  constructor(private readonly knowledge: KnowledgeRuntime) {}

  async list(): Promise<SourceImportBatch[]> {
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
    return batches.filter((batch): batch is SourceImportBatch => Boolean(batch)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    const digest = createHash("sha256").update(`${createdAt}:${files.map((file) => file.relativePath || file.name).join("|")}`).digest("hex").slice(0, 8);
    const id = `${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${digest}`;
    const sourceRoot = this.sourceRoot();
    const targetRoot = path.resolve(sourceRoot, targetFolder);
    if (targetRoot !== sourceRoot && !isPathInside(sourceRoot, targetRoot)) throw new ImportRequestError(403, "目标文件夹超出原始知识目录");
    let prepared;
    try {
      prepared = prepareImportFiles(files, channel, createdAt);
    } catch (error: any) {
      throw new ImportRequestError(400, error.message);
    }
    await mkdir(targetRoot, { recursive: true });
    const stored: SourceImportBatch["files"] = [];
    for (const file of prepared) {
      let target: string;
      try {
        target = await this.writeUnique(targetRoot, file.relativePath, file.content);
      } catch (error: any) {
        throw new ImportRequestError(400, error.message);
      }
      stored.push({ originalName: file.originalName, storedPath: path.relative(this.knowledge.vaultRoot, target).split(path.sep).join("/"), bytes: file.bytes });
    }
    const batch: SourceImportBatch = {
      id,
      createdAt,
      channel,
      targetFolder: targetFolder.split(path.sep).join("/"),
      fileCount: stored.length,
      totalBytes: prepared.reduce((total, file) => total + file.bytes, 0),
      files: stored,
    };
    await mkdir(this.manifestRoot(), { recursive: true });
    await writeFile(path.join(this.manifestRoot(), `${id}.json`), JSON.stringify(batch, null, 2), "utf8");
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
