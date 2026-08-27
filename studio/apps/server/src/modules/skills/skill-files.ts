import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SkillFileContent, SkillTreeNode } from "@the-way-here/shared";
import type { WikiIndex } from "@the-way-here/wiki-core";
import { isPathInside } from "../../path-policy.js";

const READABLE_EXTENSIONS = new Set([".md", ".yaml", ".yml", ".json", ".py", ".txt", ".toml", ".sh", ".ts", ".js"]);
const MAX_CONTENT_BYTES = 200 * 1024;

export class SkillFileRequestError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export async function readSkillTree(vaultRoot: string, index: WikiIndex): Promise<SkillTreeNode[]> {
  const skillsRoot = path.resolve(vaultRoot, index.config.paths.skills);
  const nodes = await walk(skillsRoot, skillsRoot);
  return nodes;
}

export async function readSkillFile(vaultRoot: string, index: WikiIndex, requestedPath: string): Promise<SkillFileContent> {
  const skillsRoot = path.resolve(vaultRoot, index.config.paths.skills);
  const trimmed = (requestedPath || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!trimmed) throw new SkillFileRequestError("请选择要查看的文件", 400);
  if (trimmed.split("/").some((part) => part === "." || part === ".." || part.includes("\0"))) throw new SkillFileRequestError("文件路径无效", 400);
  const absolute = path.resolve(skillsRoot, trimmed);
  if (!isPathInside(skillsRoot, absolute)) throw new SkillFileRequestError("文件路径超出构建规则目录", 403);
  let fileStat;
  try {
    fileStat = await stat(absolute);
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new SkillFileRequestError("文件不存在", 404);
    throw error;
  }
  if (!fileStat.isFile()) throw new SkillFileRequestError("这是一个文件夹，不是文件", 400);
  if (!READABLE_EXTENSIONS.has(path.extname(absolute).toLowerCase())) throw new SkillFileRequestError("这种文件类型暂不支持在页面里预览", 415);
  const raw = await readFile(absolute, "utf8");
  const truncated = Buffer.byteLength(raw, "utf8") > MAX_CONTENT_BYTES;
  const content = truncated ? `${raw.slice(0, MAX_CONTENT_BYTES)}\n\n… 文件较长，已截断显示。` : raw;
  const isSkillEntry = path.basename(absolute) === "SKILL.md";
  return {
    path: trimmed,
    name: path.basename(absolute),
    bytes: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
    content,
    truncated,
    skillName: isSkillEntry ? frontmatterField(raw, "name") : undefined,
    description: isSkillEntry ? multilineFrontmatterField(raw, "description") : undefined,
  };
}

async function walk(root: string, current: string): Promise<SkillTreeNode[]> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nodes = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith(".") && entry.name !== "__pycache__")
    .map(async (entry): Promise<SkillTreeNode | undefined> => {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        const children = await walk(root, absolute);
        const skillEntry = children.find((child) => child.kind === "file" && child.name === "SKILL.md");
        const fileStat = await stat(absolute);
        return {
          path: relative,
          name: entry.name,
          kind: "directory",
          modifiedAt: fileStat.mtime.toISOString(),
          fileCount: countFiles(children),
          skillName: skillEntry?.skillName,
          children,
        };
      }
      if (!entry.isFile()) return undefined;
      const fileStat = await stat(absolute);
      const node: SkillTreeNode = {
        path: relative,
        name: entry.name,
        kind: "file",
        modifiedAt: fileStat.mtime.toISOString(),
        bytes: fileStat.size,
      };
      if (entry.name === "SKILL.md") {
        const markdown = await readFile(absolute, "utf8");
        node.skillName = frontmatterField(markdown, "name") || markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
      }
      return node;
    }));
  return nodes
    .filter((node): node is SkillTreeNode => Boolean(node))
    .sort((left, right) => (left.kind === right.kind ? left.name.localeCompare(right.name, "zh-CN") : left.kind === "directory" ? -1 : 1));
}

function countFiles(nodes: SkillTreeNode[]): number {
  return nodes.reduce((total, node) => total + (node.kind === "file" ? 1 : countFiles(node.children || [])), 0);
}

function frontmatterField(markdown: string, field: string): string | undefined {
  const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!block) return undefined;
  const lines = block.split(/\r?\n/);
  const lineIndex = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (lineIndex < 0) return undefined;
  const raw = lines[lineIndex]!.slice(field.length + 1).trim();
  if ([">", "|", ">-", "|-"].includes(raw)) return undefined;
  return raw.replace(/^['"]|['"]$/g, "").trim();
}

function multilineFrontmatterField(markdown: string, field: string): string | undefined {
  const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!block) return undefined;
  const lines = block.split(/\r?\n/);
  const lineIndex = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (lineIndex < 0) return undefined;
  const raw = lines[lineIndex]!.slice(field.length + 1).trim();
  if (![">", "|", ">-", "|-"].includes(raw)) return raw.replace(/^['"]|['"]$/g, "").trim();
  const value: string[] = [];
  for (const line of lines.slice(lineIndex + 1)) {
    if (!/^\s+/.test(line)) break;
    value.push(line.trim());
  }
  return value.join(" ").trim();
}
