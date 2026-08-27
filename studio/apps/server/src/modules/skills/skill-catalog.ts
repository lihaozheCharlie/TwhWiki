import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { BuildSkill } from "@the-way-here/shared";
import type { WikiIndex } from "@the-way-here/wiki-core";
import { isPathInside } from "../../path-policy.js";

export async function listBuildSkills(vaultRoot: string, index: WikiIndex): Promise<BuildSkill[]> {
  const skillsRoot = path.resolve(vaultRoot, index.config.paths.skills);
  const registryPath = path.join(skillsRoot, "registry.yaml");
  let registered: Array<{ id: string; absolute: string }> = [];
  try {
    const registry = YAML.parse(await readFile(registryPath, "utf8"));
    if (!Array.isArray(registry?.skills)) throw new Error("Skill 注册表缺少 skills 列表");
    registered = registry.skills.map((entry: any) => {
      if (typeof entry?.id !== "string" || typeof entry?.path !== "string") throw new Error("Skill 注册表条目缺少 id 或 path");
      const absolute = path.resolve(vaultRoot, entry.path);
      if (!isPathInside(skillsRoot, absolute) || path.basename(absolute) !== "SKILL.md") throw new Error(`Skill 路径超出共享目录：${entry.path}`);
      return { id: entry.id, absolute };
    });
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    registered = (await collectNamedFiles(skillsRoot, "SKILL.md")).map((absolute) => ({
      id: path.relative(skillsRoot, path.dirname(absolute)).split(path.sep).join("/") || path.basename(path.dirname(absolute)),
      absolute,
    }));
  }
  return Promise.all(registered.map(async ({ id, absolute }) => {
    const [markdown, fileStat] = await Promise.all([readFile(absolute, "utf8"), stat(absolute)]);
    return {
      id,
      name: frontmatterField(markdown, "name") || markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(path.dirname(absolute)),
      description: multilineFrontmatterField(markdown, "description") || "这条构建规则还没有说明。",
      relativePath: path.relative(vaultRoot, absolute).split(path.sep).join("/"),
      modifiedAt: fileStat.mtime.toISOString(),
    };
  }));
}

async function collectNamedFiles(root: string, fileName: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name === fileName) result.push(absolute);
    }
  }
  await walk(root);
  return result.sort();
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
