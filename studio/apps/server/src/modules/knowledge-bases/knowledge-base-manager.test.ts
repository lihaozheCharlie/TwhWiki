import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { createPersonalKnowledgeBase, deletePersonalKnowledgeBase } from "./knowledge-base-manager.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("personal knowledge base creation", () => {
  it("registers an isolated personal library and makes it the configured default", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-create-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
defaultKnowledgeBase: demo
knowledgeBases:
  demo:
    name: Anonymous Demo
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
`, "utf8");

    await expect(createPersonalKnowledgeBase(root, "我的生活记录")).resolves.toEqual({ id: "personal", name: "我的生活记录" });
    const config = YAML.parse(await readFile(path.join(root, "the-way-here.config.yaml"), "utf8"));
    expect(config).toMatchObject({
      defaultKnowledgeBase: "personal",
      knowledgeBases: {
        demo: { name: "Anonymous Demo" },
        personal: {
          name: "我的生活记录",
          paths: { wiki: "vault/personal/wiki", sources: "vault/personal/sources" },
        },
      },
    });
    await expect(access(path.join(root, "vault/personal/wiki"))).resolves.toBeUndefined();
    await expect(access(path.join(root, "vault/personal/sources"))).resolves.toBeUndefined();
  });

  it("keeps existing personal libraries and chooses a new id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-create-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
knowledgeBases:
  demo: {}
  personal: {}
`, "utf8");

    await expect(createPersonalKnowledgeBase(root, "第二个知识库")).resolves.toMatchObject({ id: "personal-2" });
  });

  it("rejects an empty name without changing the registry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-create-"));
    temporaryRoots.push(root);
    const original = "version: 3\nknowledgeBases:\n  demo: {}\n";
    await writeFile(path.join(root, "the-way-here.config.yaml"), original, "utf8");

    await expect(createPersonalKnowledgeBase(root, "   ")).rejects.toThrow("请为知识库起一个名字");
    await expect(readFile(path.join(root, "the-way-here.config.yaml"), "utf8")).resolves.toBe(original);
  });
});

describe("personal knowledge base deletion", () => {
  it("removes the registered private directories and selects a safe fallback", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-delete-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
defaultKnowledgeBase: personal
knowledgeBases:
  demo:
    name: Anonymous Demo
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
  personal:
    name: 我的生活
    paths:
      wiki: vault/personal/wiki
      sources: vault/personal/sources
`, "utf8");
    await Promise.all([
      mkdir(path.join(root, "vault/personal/wiki"), { recursive: true }),
      mkdir(path.join(root, "vault/personal/sources"), { recursive: true }),
    ]);
    await writeFile(path.join(root, "vault/personal/sources/日记.md"), "# 日记\n", "utf8");

    await expect(deletePersonalKnowledgeBase(root, "personal")).resolves.toEqual({ id: "personal", name: "我的生活", fallbackId: "demo" });
    const config = YAML.parse(await readFile(path.join(root, "the-way-here.config.yaml"), "utf8"));
    expect(config.defaultKnowledgeBase).toBe("demo");
    expect(config.knowledgeBases.personal).toBeUndefined();
    await expect(access(path.join(root, "vault/personal/wiki"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(root, "vault/personal/sources"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("protects the anonymous demo knowledge base", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-delete-"));
    temporaryRoots.push(root);
    const original = `version: 3
defaultKnowledgeBase: demo
knowledgeBases:
  demo:
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
  personal:
    paths:
      wiki: vault/personal/wiki
      sources: vault/personal/sources
`;
    await writeFile(path.join(root, "the-way-here.config.yaml"), original, "utf8");

    await expect(deletePersonalKnowledgeBase(root, "demo")).rejects.toThrow("演示知识库不能删除");
    await expect(readFile(path.join(root, "the-way-here.config.yaml"), "utf8")).resolves.toBe(original);
  });

  it("refuses to delete custom directories outside the managed vault area", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-delete-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
knowledgeBases:
  demo:
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
  personal:
    paths:
      wiki: external/wiki
      sources: external/sources
`, "utf8");

    await expect(deletePersonalKnowledgeBase(root, "personal")).rejects.toThrow("使用了自定义目录");
  });
});
