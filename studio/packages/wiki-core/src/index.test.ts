import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { extractSectionBlocks, extractSections, extractWikiLinks, loadVaultConfig, normalizeFrontmatterProperties, pageIdForPath, WikiIndex } from "./index";
import type { VaultConfig } from "@the-way-here/shared";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("wiki parser", () => {
  test("extracts Obsidian links with aliases and headings", () => {
    expect(extractWikiLinks("[[wiki/阶段#节点|大学阶段]]")).toEqual([
      {
        raw: "[[wiki/阶段#节点|大学阶段]]",
        target: "wiki/阶段",
        label: "大学阶段",
      },
    ]);
  });

  test("keeps deeper headings inside their complete level-two section", () => {
    expect(extractSectionBlocks("# 标题\n\n## 行动与学习模型\n\n### 反馈闭环\n内容 A\n\n### 停止点\n内容 B\n\n## 下一组\n结尾")).toEqual([
      { level: 2, heading: "行动与学习模型", body: "### 反馈闭环\n内容 A\n\n### 停止点\n内容 B" },
      { level: 2, heading: "下一组", body: "结尾" },
    ]);
  });

  test("extracts structured sections", () => {
    expect(extractSections("# 标题\n\n## 核心判断\n内容\n\n## 依据\n来源")).toEqual([
      { level: 2, heading: "核心判断", body: "内容" },
      { level: 2, heading: "依据", body: "来源" },
    ]);
  });

  test("keeps logical page ids stable when a knowledge base lives below the workspace root", () => {
    const config = {
      paths: {
        wiki: "vault/personal/wiki",
        sources: "vault/personal/原始知识库",
      },
    } as VaultConfig;
    expect(pageIdForPath("vault/personal/wiki/02 人生阶段/人生阶段总览.md", config)).toBe("wiki/02 人生阶段/人生阶段总览");
    expect(pageIdForPath("vault/personal/原始知识库/日记/今天.md", config)).toBe("原始知识库/日记/今天");
  });

  test("normalizes frontmatter values for the note properties view", () => {
    expect(normalizeFrontmatterProperties({
      type: "wiki",
      aliases: ["判断力", "责任感"],
      Start: new Date("2014-05-14T00:00:00.000Z"),
      location: [],
      nested: { active: true },
    })).toEqual({
      type: "wiki",
      aliases: ["判断力", "责任感"],
      Start: "2014-05-14",
      location: [],
      nested: { active: true },
    });
  });

  test("exposes a validated import channel in source summaries", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-index-"));
    temporaryRoots.push(root);
    await mkdir(path.join(root, "sources"), { recursive: true });
    await writeFile(path.join(root, "sources", "conversation.md"), "---\ntype: source\nimport_channel: claude\n---\n\n# Claude conversation\n", "utf8");

    const index = new WikiIndex(root);
    await index.rebuild();

    expect(index.list({ sources: true })[0]).toMatchObject({ importChannel: "claude" });
  });

  test("uses the source filename as its title instead of a legacy Markdown heading", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-index-"));
    temporaryRoots.push(root);
    await mkdir(path.join(root, "sources/日记"), { recursive: true });
    await writeFile(path.join(root, "sources/日记/2026.09.03.md"), "# 旧标题\n\n正文\n", "utf8");

    const index = new WikiIndex(root);
    await index.rebuild();

    expect(index.list({ sources: true })[0]).toMatchObject({ title: "2026.09.03" });
  });

  test("resolves one knowledge base from the workspace registry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 2\ndefaultKnowledgeBase: personal\npaths:\n  skills: knowledge-engine/skills\n  tools: knowledge-engine/tools\n  agentInstructions: AGENTS.md\nknowledgeBases:\n  personal:\n    paths:\n      wiki: vault/personal/wiki\n      sources: vault/personal/sources\n  demo:\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\n`, "utf8");
    await expect(loadVaultConfig(root, "demo")).resolves.toMatchObject({
      knowledgeBaseId: "demo",
      paths: { wiki: "vault/demo/wiki", sources: "vault/demo/sources" },
      agents: { defaultRuntime: "auto" },
    });
  });

  test("prefers a custom knowledge base over the demo at startup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
defaultKnowledgeBase: demo
knowledgeBases:
  demo:
    name: Anonymous Demo
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
  personal:
    name: My Knowledge
    paths:
      wiki: vault/personal/wiki
      sources: vault/personal/sources
`, "utf8");

    await expect(loadVaultConfig(root)).resolves.toMatchObject({
      knowledgeBaseId: "personal",
      name: "My Knowledge",
    });
    await expect(loadVaultConfig(root, "demo")).resolves.toMatchObject({ knowledgeBaseId: "demo" });
  });

  test("uses the demo at startup when it is the only configured knowledge base", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
knowledgeBases:
  demo:
    name: Anonymous Demo
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
`, "utf8");

    await expect(loadVaultConfig(root)).resolves.toMatchObject({ knowledgeBaseId: "demo" });
  });

  test("loads an anonymous demo with a Pi provider while keeping credentials in the environment", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
defaultKnowledgeBase: demo
knowledgeBases:
  demo:
    name: Anonymous Demo
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
agents:
  defaultRuntime: pi
  runtimes:
    codex:
      enabled: true
      command: codex
      transport: stdio
    pi:
      enabled: true
      providers:
        - id: local-openai
          name: Local OpenAI-compatible
          protocol: openai-completions
          baseUrl: http://127.0.0.1:11434/v1
          models:
            - id: qwen3
              displayName: Qwen 3
              reasoning: true
              contextWindow: 32768
              maxOutputTokens: 8192
`, "utf8");
    const config = await loadVaultConfig(root, "demo");
    expect(config).toMatchObject({
      version: 3,
      knowledgeBaseId: "demo",
      agents: {
        defaultRuntime: "pi",
        runtimes: {
          pi: {
            providers: [{ id: "local-openai", baseUrl: "http://127.0.0.1:11434/v1", apiKeyEnv: undefined }],
          },
        },
      },
    });
    expect(JSON.stringify(config)).not.toContain("literal-secret");
  });

  test("migrates the legacy Codex configuration into the runtime registry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 2
codex:
  enabled: false
  command: custom-codex
  transport: stdio
`, "utf8");
    await expect(loadVaultConfig(root)).resolves.toMatchObject({
      agents: { runtimes: { codex: { enabled: false, command: "custom-codex", transport: "stdio" } } },
    });
  });

  test("rejects invalid Pi provider endpoints", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
agents:
  runtimes:
    pi:
      enabled: true
      providers:
        - id: unsafe
          protocol: openai-completions
          baseUrl: file:///tmp/model
          apiKeyEnv: MODEL_API_KEY
          models:
            - id: model
              contextWindow: 4096
              maxOutputTokens: 1024
`, "utf8");
    await expect(loadVaultConfig(root)).rejects.toThrow("baseUrl 必须是 HTTP(S) 地址");
  });

  test("rejects plaintext provider credentials", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
agents:
  runtimes:
    pi:
      enabled: true
      providers:
        - id: unsafe
          protocol: anthropic-messages
          baseUrl: https://example.com
          apiKey: literal-secret
          models:
            - id: model
              contextWindow: 4096
              maxOutputTokens: 1024
`, "utf8");
    await expect(loadVaultConfig(root)).rejects.toThrow("不得保存明文密钥");
  });

  test("rejects configured content paths outside the workspace", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 2\nknowledgeBases:\n  personal:\n    paths:\n      wiki: ../private/wiki\n      sources: vault/personal/sources\n`, "utf8");
    await expect(loadVaultConfig(root, "personal")).rejects.toThrow("超出工作区边界");
  });
});
