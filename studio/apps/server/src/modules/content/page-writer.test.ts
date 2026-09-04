import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WikiPage } from "@the-way-here/shared";
import type { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";
import { ContentRequestError, PageWriter } from "./page-writer.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sourcePage(relativePath: string, modifiedAt: string): WikiPage {
  return {
    id: relativePath.replace(/\.md$/, ""),
    relativePath,
    title: path.basename(relativePath, ".md"),
    category: "sources",
    aliases: [],
    tags: [],
    locations: [],
    sources: [],
    excerpt: "",
    modifiedAt,
    isSource: true,
    markdown: "",
    renderedMarkdown: "",
    properties: {},
    sections: [],
    outgoingLinks: [],
    incomingLinks: [],
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-content-delete-"));
  roots.push(root);
  const filePath = path.join(root, "sources/日记/今天.md");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "# 今天\n", "utf8");
  const modifiedAt = (await stat(filePath)).mtime.toISOString();
  const page = sourcePage("sources/日记/今天.md", modifiedAt);
  const rebuild = vi.fn(async () => undefined);
  const broadcast = vi.fn();
  const get = vi.fn((id: string) => id === page.id ? page : undefined);
  const knowledge = {
    vaultRoot: root,
    index: { config: { paths: { wiki: "wiki", sources: "sources" } }, get, list: () => [page], rebuild, lastIndexedAt: "2026-09-02T00:00:00.000Z" },
    events: { broadcast },
  } as unknown as KnowledgeRuntime;
  return { root, filePath, page, rebuild, broadcast, writer: new PageWriter(knowledge) };
}

describe("PageWriter source files", () => {
  it("creates a life-record file without duplicating its filename as a Markdown heading", async () => {
    const { root, writer } = await fixture();

    await writer.createSource("新记录", "日记");

    await expect(readFile(path.join(root, "sources/日记/新记录.md"), "utf8")).resolves.toBe("");
  });

  it("deletes one indexed life-record file with a concurrency check", async () => {
    const { filePath, page, rebuild, broadcast, writer } = await fixture();

    await expect(writer.deleteSource(page.id, page.modifiedAt)).resolves.toEqual({ ok: true, pageId: page.id });
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(rebuild).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith("index", expect.objectContaining({ deletedPath: page.relativePath }));
  });

  it("deletes a selected folder recursively but protects the source root", async () => {
    const { root, writer } = await fixture();
    await writeFile(path.join(root, "sources/日记/补充.txt"), "补充", "utf8");

    await expect(writer.deleteSourceFolder("日记", 2)).rejects.toMatchObject({ statusCode: 409 });
    await expect(writer.deleteSourceFolder("日记", 1)).resolves.toEqual({ ok: true, folder: "日记" });
    await expect(readFile(path.join(root, "sources/日记/补充.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(writer.deleteSourceFolder("")).rejects.toMatchObject({ statusCode: 400 } satisfies Partial<ContentRequestError>);
  });
});
