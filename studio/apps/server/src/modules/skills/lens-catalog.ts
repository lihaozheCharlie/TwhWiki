import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ReasoningLens } from "@the-way-here/shared";
import type { WikiIndex } from "@the-way-here/wiki-core";

const LENS_REFERENCE_DIRECTORY = "common/reasoning-lenses/references/figures";

export async function listReasoningLenses(vaultRoot: string, index: WikiIndex): Promise<ReasoningLens[]> {
  const skillsRoot = path.resolve(vaultRoot, index.config.paths.skills);
  const figuresRoot = path.join(skillsRoot, ...LENS_REFERENCE_DIRECTORY.split("/"));
  let entries;
  try {
    entries = await readdir(figuresRoot, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const lenses = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => {
      const absolute = path.join(figuresRoot, entry.name);
      const markdown = await readFile(absolute, "utf8");
      const fields = frontmatterFields(markdown);
      const id = fields.lens_id || entry.name.replace(/\.md$/i, "");
      const displayName = fields.display_name || id;
      return {
        id,
        displayName,
        attention: fields.attention || "",
        signals: (fields.signals || "").split(/[、,，]/).map((value) => value.trim()).filter(Boolean),
        helperUse: fields.helper_use || "",
        relativePath: path.relative(vaultRoot, absolute).split(path.sep).join("/"),
      } satisfies ReasoningLens;
    }));
  return lenses.filter((lens) => Boolean(lens.attention)).sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"));
}

function frontmatterFields(markdown: string): Record<string, string> {
  const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!block) return {};
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    fields[match[1]!] = match[2]!.trim().replace(/^['"]|['"]$/g, "").trim();
  }
  return fields;
}
