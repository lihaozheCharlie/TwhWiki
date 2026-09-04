import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";
import { listSourceFolders } from "./source-folder-catalog.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("source folder catalog", () => {
  it("lists nested and empty folders from the active source root while hiding system folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-source-folders-"));
    roots.push(root);
    await Promise.all([
      mkdir(path.join(root, "sources/日记/2026"), { recursive: true }),
      mkdir(path.join(root, "sources/日记/今天.assert"), { recursive: true }),
      mkdir(path.join(root, "sources/读书笔记"), { recursive: true }),
      mkdir(path.join(root, "sources/.system/cache"), { recursive: true }),
    ]);
    const knowledge = {
      vaultRoot: root,
      index: { config: { paths: { sources: "sources" } } },
    } as unknown as KnowledgeRuntime;

    await expect(listSourceFolders(knowledge)).resolves.toEqual([
      { path: "读书笔记" },
      { path: "日记" },
      { path: "日记/2026" },
    ]);
  });

  it("returns an empty list before a source root has been created", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-source-folders-"));
    roots.push(root);
    const knowledge = {
      vaultRoot: root,
      index: { config: { paths: { sources: "sources" } } },
    } as unknown as KnowledgeRuntime;

    await expect(listSourceFolders(knowledge)).resolves.toEqual([]);
  });
});
