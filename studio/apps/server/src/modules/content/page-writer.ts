import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pageIdForPath } from "@the-way-here/wiki-core";
import type { WikiPage } from "@the-way-here/shared";
import { isPathInside, markdownFileName, normalizeSourceFolder } from "../../path-policy.js";
import { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";

export class ContentRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export class PageWriter {
  constructor(private readonly knowledge: KnowledgeRuntime) {}

  async createSource(titleValue: string | undefined, folderValue: string | undefined): Promise<WikiPage | undefined> {
    if (!titleValue?.trim()) throw new ContentRequestError(400, "请输入文件名后再创建");
    const sourceRoot = path.resolve(this.knowledge.vaultRoot, this.knowledge.index.config.paths.sources);
    let target: string;
    try {
      target = path.resolve(sourceRoot, normalizeSourceFolder(folderValue || ""), markdownFileName(titleValue));
    } catch (error: any) {
      throw new ContentRequestError(400, error.message);
    }
    if (!isPathInside(sourceRoot, target)) throw new ContentRequestError(403, "路径超出知识源目录");
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(target, "", { encoding: "utf8", flag: "wx" });
    } catch (error: any) {
      if (error?.code === "EEXIST") throw new ContentRequestError(409, "同名文件已经存在，请修改文件名后重试");
      throw error;
    }
    await this.knowledge.index.rebuild();
    const id = pageIdForPath(path.relative(this.knowledge.vaultRoot, target), this.knowledge.index.config);
    const page = this.knowledge.index.get(id);
    this.knowledge.events.broadcast("index", { at: this.knowledge.index.lastIndexedAt, path: page?.relativePath });
    return page;
  }

  async rename(pageId: string | undefined, fileName: string | undefined, expectedModifiedAt?: string): Promise<WikiPage> {
    const page = pageId ? this.knowledge.index.get(pageId) : undefined;
    if (!page) throw new ContentRequestError(404, "页面不存在，请刷新后重试");
    if (!fileName?.trim()) throw new ContentRequestError(400, "请输入文件名后再保存");
    const absolutePath = this.editablePath(page.relativePath, "路径超出可编辑目录，请检查知识库配置");
    await this.assertCurrent(absolutePath, expectedModifiedAt);
    let target: string;
    try {
      target = path.resolve(path.dirname(absolutePath), markdownFileName(fileName));
    } catch (error: any) {
      throw new ContentRequestError(400, error.message);
    }
    this.assertEditable(target, "新文件名超出可编辑目录，请换一个名称");
    if (target === absolutePath) return page;
    try {
      await stat(target);
      throw new ContentRequestError(409, "同名文件已经存在，请换一个名称");
    } catch (error: any) {
      if (error instanceof ContentRequestError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(absolutePath, target);
    await this.knowledge.index.rebuild();
    const id = pageIdForPath(path.relative(this.knowledge.vaultRoot, target), this.knowledge.index.config);
    const updated = this.knowledge.index.get(id);
    if (!updated) throw new Error("重命名后无法重新读取页面");
    this.knowledge.events.broadcast("index", { at: this.knowledge.index.lastIndexedAt, path: updated.relativePath, previousPath: page.relativePath });
    return updated;
  }

  async deleteSource(pageId: string | undefined, expectedModifiedAt?: string): Promise<{ ok: true; pageId: string }> {
    const page = pageId ? this.knowledge.index.get(pageId) : undefined;
    if (!page || !page.isSource) throw new ContentRequestError(404, "生活记录不存在，请刷新后重试");
    const sourceRoot = path.resolve(this.knowledge.vaultRoot, this.knowledge.index.config.paths.sources);
    const absolutePath = path.resolve(this.knowledge.vaultRoot, page.relativePath);
    if (!isPathInside(sourceRoot, absolutePath)) throw new ContentRequestError(403, "只能删除生活记录中的文件");
    await this.assertCurrent(absolutePath, expectedModifiedAt);
    await rm(absolutePath);
    await this.knowledge.index.rebuild();
    this.knowledge.events.broadcast("index", { at: this.knowledge.index.lastIndexedAt, deletedPath: page.relativePath });
    return { ok: true, pageId: page.id };
  }

  async deleteSourceFolder(folderValue: string | undefined, expectedFileCount?: unknown): Promise<{ ok: true; folder: string }> {
    let folder: string;
    try {
      folder = normalizeSourceFolder(folderValue || "");
    } catch (error: any) {
      throw new ContentRequestError(400, error.message);
    }
    if (!folder) throw new ContentRequestError(400, "生活记录根目录不能删除");
    if (folder.split(path.sep).some((part) => part.startsWith("."))) throw new ContentRequestError(403, "系统目录不能删除");
    const sourceRoot = path.resolve(this.knowledge.vaultRoot, this.knowledge.index.config.paths.sources);
    const target = path.resolve(sourceRoot, folder);
    if (!isPathInside(sourceRoot, target)) throw new ContentRequestError(403, "文件夹超出生活记录目录");
    if (expectedFileCount !== undefined && (!Number.isInteger(expectedFileCount) || Number(expectedFileCount) < 0)) throw new ContentRequestError(400, "文件夹记录数量无效");
    const relativeFolder = path.relative(this.knowledge.vaultRoot, target).split(path.sep).join("/");
    const currentFileCount = this.knowledge.index.list({ sources: true }).filter((page) => page.relativePath.startsWith(`${relativeFolder}/`)).length;
    if (expectedFileCount !== undefined && currentFileCount !== expectedFileCount) throw new ContentRequestError(409, "文件夹内容已经变化，请刷新后重新确认");
    try {
      const info = await lstat(target);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new ContentRequestError(409, "所选路径不是可删除的文件夹");
    } catch (error: any) {
      if (error instanceof ContentRequestError) throw error;
      if (error?.code === "ENOENT") throw new ContentRequestError(404, "文件夹不存在，请刷新后重试");
      throw error;
    }
    await rm(target, { recursive: true });
    await this.knowledge.index.rebuild();
    const normalizedFolder = folder.split(path.sep).join("/");
    this.knowledge.events.broadcast("index", { at: this.knowledge.index.lastIndexedAt, deletedFolder: normalizedFolder });
    return { ok: true, folder: normalizedFolder };
  }

  async save(pageId: string, markdown: string | undefined, expectedModifiedAt?: string): Promise<{ ok: true; modifiedAt?: string; sha256: string }> {
    const page = this.knowledge.index.get(pageId);
    if (!page) throw new ContentRequestError(404, "页面不存在");
    if (typeof markdown !== "string") throw new ContentRequestError(400, "缺少 Markdown 内容");
    const absolutePath = this.editablePath(page.relativePath, "路径超出可编辑目录");
    await this.assertCurrent(absolutePath, expectedModifiedAt);
    const temporary = `${absolutePath}.${process.pid}.tmp`;
    await writeFile(temporary, markdown, "utf8");
    await rename(temporary, absolutePath);
    await this.knowledge.index.rebuild();
    const updated = this.knowledge.index.get(page.id);
    this.knowledge.events.broadcast("index", { at: this.knowledge.index.lastIndexedAt, path: page.relativePath });
    return { ok: true, modifiedAt: updated?.modifiedAt, sha256: createHash("sha256").update(markdown).digest("hex") };
  }

  async openInEditor(pageId: string | undefined): Promise<{ ok: true }> {
    const page = pageId ? this.knowledge.index.get(pageId) : undefined;
    if (!page) throw new ContentRequestError(404, "页面不存在");
    const absolutePath = path.resolve(this.knowledge.vaultRoot, page.relativePath);
    const configuredEditor = process.env.THE_WAY_HERE_EDITOR?.trim();
    const editor = configuredEditor || (process.platform === "darwin" ? "/usr/bin/open" : process.platform === "win32" ? "cmd" : "xdg-open");
    const args = configuredEditor
      ? (["code", "cursor"].includes(configuredEditor) ? ["--goto", absolutePath] : [absolutePath])
      : process.platform === "win32" ? ["/c", "start", "", absolutePath] : [absolutePath];
    const child = spawn(editor, args, { detached: true, stdio: "ignore" });
    const launched = await new Promise<boolean>((resolve) => {
      child.once("spawn", () => resolve(true));
      child.once("error", () => resolve(false));
    });
    if (!launched) throw new ContentRequestError(503, "未找到可用编辑器，请设置 THE_WAY_HERE_EDITOR");
    child.unref();
    return { ok: true };
  }

  private allowedRoots(): string[] {
    return [this.knowledge.index.config.paths.wiki, this.knowledge.index.config.paths.sources].map((entry) => path.resolve(this.knowledge.vaultRoot, entry));
  }

  private assertEditable(absolutePath: string, message: string): void {
    if (!this.allowedRoots().some((root) => isPathInside(root, absolutePath))) throw new ContentRequestError(403, message);
  }

  private editablePath(relativePath: string, message: string): string {
    const absolutePath = path.resolve(this.knowledge.vaultRoot, relativePath);
    this.assertEditable(absolutePath, message);
    return absolutePath;
  }

  private async assertCurrent(absolutePath: string, expectedModifiedAt?: string): Promise<void> {
    const currentStat = await stat(absolutePath);
    if (expectedModifiedAt && currentStat.mtime.toISOString() !== expectedModifiedAt) throw new ContentRequestError(409, "文件已被其他程序修改，请刷新后重试");
  }
}
