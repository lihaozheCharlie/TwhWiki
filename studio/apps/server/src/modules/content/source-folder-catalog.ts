import { readdir } from "node:fs/promises";
import path from "node:path";
import type { SourceFolderSummary } from "@the-way-here/shared";
import type { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";

/** Lists user-visible folders inside the active knowledge base's life-record root. */
export async function listSourceFolders(knowledge: KnowledgeRuntime): Promise<SourceFolderSummary[]> {
  const sourceRoot = path.resolve(knowledge.vaultRoot, knowledge.index.config.paths.sources);
  const folders: SourceFolderSummary[] = [];

  async function visit(absoluteFolder: string, relativeFolder: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(absoluteFolder, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    const childFolders = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !entry.name.endsWith(".assert"),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

    for (const entry of childFolders) {
      const childPath = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name;
      folders.push({ path: childPath });
      await visit(path.join(absoluteFolder, entry.name), childPath);
    }
  }

  await visit(sourceRoot, "");
  return folders;
}
