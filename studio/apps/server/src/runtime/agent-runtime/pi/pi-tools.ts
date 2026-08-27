import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { VaultConfig, WikiRun } from "@the-way-here/shared";

const maxReadBytes = 1_000_000;
const maxListedFiles = 500;
const maxSearchedFiles = 5_000;
const maxSearchMatches = 200;

export function createPiTools(options: {
  cwd: string;
  config: VaultConfig;
  mode: Exclude<WikiRun["mode"], "validate">;
}): AgentTool[] {
  const access = new WorkspaceAccess(options.cwd, options.config);
  const tools: AgentTool[] = [
    {
      name: "list_files",
      label: "列出知识文件",
      description: "列出当前知识库允许读取的 Markdown 和文本文件。返回工作区相对路径。",
      parameters: Type.Object({}),
      execute: async () => {
        const files = await access.listFiles();
        return textResult(files.join("\n") || "没有找到文件。", { count: files.length });
      },
    },
    {
      name: "search_text",
      label: "搜索知识",
      description: "在当前知识库、来源、Skills、Tools 与根协议中搜索文本。",
      parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 300 }) }),
      execute: async (_callId, params) => {
        const { query } = params as { query: string };
        const matches = await access.search(String(query));
        return textResult(matches.join("\n") || "没有找到匹配内容。", { count: matches.length });
      },
    },
    {
      name: "read_file",
      label: "读取知识文件",
      description: "读取一个允许范围内的文本文件。修改已有文件前必须先读取并使用返回的 sha256。",
      parameters: Type.Object({ path: Type.String({ minLength: 1 }) }),
      execute: async (_callId, params) => {
        const { path: requestedPath } = params as { path: string };
        const result = await access.read(String(requestedPath));
        return textResult(result.content, { path: result.path, sha256: result.sha256 });
      },
    },
  ];
  if (options.mode !== "read") {
    tools.push({
      name: "write_file",
      label: "写入知识文件",
      description: "创建或完整替换 Wiki/来源目录中的一个文本文件。已有文件必须提供最近 read_file 返回的 expectedSha256。不能修改 AGENTS.md、Skills、Tools 或产品代码。",
      parameters: Type.Object({
        path: Type.String({ minLength: 1 }),
        content: Type.String(),
        expectedSha256: Type.Optional(Type.String()),
      }),
      executionMode: "sequential",
      execute: async (_callId, params) => {
        const { path: requestedPath, content, expectedSha256 } = params as { path: string; content: string; expectedSha256?: string };
        const result = await access.write(String(requestedPath), String(content), expectedSha256 ? String(expectedSha256) : undefined);
        return textResult(`已写入 ${result.path}`, result);
      },
    });
  }
  return tools;
}

function textResult(text: string, details: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

class WorkspaceAccess {
  private readonly root: string;
  private readonly readableDirs: string[];
  private readonly readableFiles: string[];
  private readonly writableDirs: string[];

  constructor(cwd: string, config: VaultConfig) {
    this.root = canonicalPath(path.resolve(cwd));
    this.readableDirs = [config.paths.wiki, config.paths.sources, config.paths.skills, config.paths.tools].map((entry) => configuredPath(this.root, entry));
    this.readableFiles = [configuredPath(this.root, config.paths.agentInstructions)];
    this.writableDirs = [config.paths.wiki, config.paths.sources].map((entry) => configuredPath(this.root, entry));
  }

  async listFiles(limit = maxListedFiles): Promise<string[]> {
    const files: string[] = [];
    for (const root of this.readableDirs) await this.walk(root, files, limit);
    for (const file of this.readableFiles) {
      try {
        if ((await stat(file)).isFile()) files.push(this.relative(file));
      } catch {}
    }
    return [...new Set(files)].sort().slice(0, limit);
  }

  async search(query: string): Promise<string[]> {
    const needle = query.toLocaleLowerCase();
    const files = await this.listFiles(maxSearchedFiles);
    const matches: string[] = [];
    for (const relativePath of files) {
      if (matches.length >= maxSearchMatches) break;
      let content: string;
      try {
        content = (await this.read(relativePath)).content;
      } catch {
        continue;
      }
      for (const [index, line] of content.split(/\r?\n/).entries()) {
        if (line.toLocaleLowerCase().includes(needle)) matches.push(`${relativePath}:${index + 1}: ${line.trim().slice(0, 500)}`);
        if (matches.length >= maxSearchMatches) break;
      }
    }
    return matches;
  }

  async read(relativePath: string): Promise<{ path: string; content: string; sha256: string }> {
    const target = await this.resolveReadable(relativePath);
    const info = await stat(target);
    if (!info.isFile()) throw new Error("只能读取文件");
    if (info.size > maxReadBytes) throw new Error("文件过大，无法通过 Agent 工具读取");
    const content = await readFile(target, "utf8");
    return { path: this.relative(target), content, sha256: hash(content) };
  }

  async write(relativePath: string, content: string, expectedSha256?: string): Promise<{ path: string; sha256: string; bytes: number }> {
    if (Buffer.byteLength(content, "utf8") > maxReadBytes) throw new Error("写入内容过大");
    const target = this.resolveLexical(relativePath);
    if (!this.writableDirs.some((root) => inside(target, root))) throw new Error("写入路径不在当前知识库允许目录内");
    let exists = false;
    try {
      const existing = await lstat(target);
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("目标必须是普通文件");
      exists = true;
      const resolved = await realpath(target);
      if (!this.writableDirs.some((root) => inside(resolved, root))) throw new Error("目标文件通过链接超出允许目录");
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (exists) {
      if (!expectedSha256) throw new Error("修改已有文件前必须先读取，并提供 expectedSha256");
      const current = await readFile(target, "utf8");
      if (hash(current) !== expectedSha256) throw new Error("文件已被其他操作修改，请重新读取后再写入");
    }
    await this.assertSafeParent(path.dirname(target));
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, "utf8");
    await rename(temporary, target);
    return { path: this.relative(target), sha256: hash(content), bytes: Buffer.byteLength(content, "utf8") };
  }

  private async walk(directory: string, files: string[], limit: number): Promise<void> {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit || entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await this.walk(target, files, limit);
      else if (entry.isFile() && /\.(md|txt|json|ya?ml)$/i.test(entry.name)) files.push(this.relative(target));
    }
  }

  private async resolveReadable(relativePath: string): Promise<string> {
    const target = this.resolveLexical(relativePath);
    const resolved = await realpath(target);
    if (!this.readableDirs.some((root) => inside(resolved, root)) && !this.readableFiles.includes(resolved)) throw new Error("读取路径不在允许范围内");
    return resolved;
  }

  private resolveLexical(relativePath: string): string {
    if (path.isAbsolute(relativePath)) throw new Error("文件路径必须相对工作区");
    const target = path.resolve(this.root, relativePath);
    if (!inside(target, this.root)) throw new Error("文件路径超出工作区");
    return target;
  }

  private async assertSafeParent(directory: string): Promise<void> {
    let candidate = directory;
    while (true) {
      try {
        const resolved = await realpath(candidate);
        if (!this.writableDirs.some((root) => inside(resolved, root))) throw new Error("写入目录通过链接超出允许范围");
        return;
      } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
        const parent = path.dirname(candidate);
        if (parent === candidate) throw new Error("无法解析写入目录");
        candidate = parent;
      }
    }
  }

  private relative(target: string): string {
    return path.relative(this.root, target).split(path.sep).join("/");
  }
}

function inside(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function configuredPath(root: string, relativePath: string): string {
  const target = canonicalPath(path.resolve(root, relativePath));
  if (!inside(target, root)) throw new Error(`配置路径通过链接超出工作区：${relativePath}`);
  return target;
}

function canonicalPath(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}
