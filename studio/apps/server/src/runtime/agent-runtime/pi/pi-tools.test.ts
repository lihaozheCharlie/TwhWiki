import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultConfig } from "@the-way-here/shared";
import { createPiTools } from "./pi-tools.js";

const temporaryRoots: string[] = [];

const config: VaultConfig = {
  version: 3,
  name: "Anonymous Demo",
  knowledgeBaseId: "demo",
  knowledgeBases: [{ id: "demo", name: "Anonymous Demo" }],
  adapter: "personal-growth",
  paths: {
    wiki: "vault/demo/wiki",
    sources: "vault/demo/sources",
    skills: "knowledge-engine/skills",
    tools: "knowledge-engine/tools",
    agentInstructions: "AGENTS.md",
  },
  views: {},
  agents: {
    defaultRuntime: "auto",
    runtimes: {
      codex: { enabled: true, command: "codex", transport: "stdio" },
      pi: { enabled: true, providers: [] },
    },
  },
  validation: { commands: [] },
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspaceFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-pi-tools-"));
  temporaryRoots.push(root);
  await Promise.all([
    mkdir(path.join(root, config.paths.wiki), { recursive: true }),
    mkdir(path.join(root, config.paths.sources), { recursive: true }),
    mkdir(path.join(root, config.paths.skills), { recursive: true }),
    mkdir(path.join(root, config.paths.tools), { recursive: true }),
  ]);
  await writeFile(path.join(root, config.paths.agentInstructions), "# Anonymous instructions\n", "utf8");
  await writeFile(path.join(root, config.paths.wiki, "overview.md"), "# Anonymous Demo\n\n可追溯的演示知识。\n", "utf8");
  return root;
}

describe("Pi workspace tools", () => {
  it("keeps read runs read-only and exposes only scoped knowledge files", async () => {
    const root = await workspaceFixture();
    const tools = createPiTools({ cwd: root, config, mode: "read" });
    expect(tools.map((tool) => tool.name)).toEqual(["list_files", "search_text", "read_file"]);
    const list = tools.find((tool) => tool.name === "list_files")!;
    const result = await list.execute("list", {} as any);
    expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("vault/demo/wiki/overview.md") });
  });

  it("requires optimistic concurrency when replacing an existing knowledge file", async () => {
    const root = await workspaceFixture();
    const tools = createPiTools({ cwd: root, config, mode: "write" });
    const reader = tools.find((tool) => tool.name === "read_file")!;
    const writer = tools.find((tool) => tool.name === "write_file")!;
    const read = await reader.execute("read", { path: "vault/demo/wiki/overview.md" } as any);
    const sha256 = (read.details as { sha256: string }).sha256;
    await expect(writer.execute("write-without-version", { path: "vault/demo/wiki/overview.md", content: "changed" } as any)).rejects.toThrow("expectedSha256");
    await writer.execute("write", { path: "vault/demo/wiki/overview.md", content: "# Updated\n", expectedSha256: sha256 } as any);
    await expect(readFile(path.join(root, config.paths.wiki, "overview.md"), "utf8")).resolves.toBe("# Updated\n");
  });

  it("rejects traversal and writes outside the selected knowledge base", async () => {
    const root = await workspaceFixture();
    const writer = createPiTools({ cwd: root, config, mode: "auto" }).find((tool) => tool.name === "write_file")!;
    await expect(writer.execute("traversal", { path: "../outside.md", content: "unsafe" } as any)).rejects.toThrow("超出工作区");
    await expect(writer.execute("product", { path: "apps/server/injected.ts", content: "unsafe" } as any)).rejects.toThrow("允许目录");
  });
});
