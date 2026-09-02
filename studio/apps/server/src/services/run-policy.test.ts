import { describe, expect, it } from "vitest";
import type { VaultConfig } from "@the-way-here/shared";
import { buildRunPrompt, parseAgentOutputTarget, parseAgentRuntimePreference, parseReasoningEffort, parseRunMode } from "./run-policy.js";

const config: VaultConfig = {
  version: 3,
  name: "演示库",
  knowledgeBaseId: "demo",
  knowledgeBases: [{ id: "demo", name: "演示库" }],
  adapter: "personal-growth",
  paths: { wiki: "vault/demo/wiki", sources: "vault/demo/sources", skills: "knowledge-engine/skills", tools: "knowledge-engine/tools", agentInstructions: "AGENTS.md" },
  views: {},
  agents: { defaultRuntime: "auto", runtimes: { codex: { enabled: true, command: "codex", transport: "stdio" }, pi: { enabled: true, providers: [] } } },
  validation: { commands: [] },
};

describe("run policy", () => {
  it("accepts only declared run modes and reasoning efforts", () => {
    expect(parseRunMode("write")).toBe("write");
    expect(parseRunMode("auto")).toBe("auto");
    expect(parseRunMode("admin")).toBeUndefined();
    expect(parseReasoningEffort("high")).toBe("high");
    expect(parseReasoningEffort("off")).toBe("off");
    expect(parseReasoningEffort("unbounded")).toBeUndefined();
    expect(parseAgentRuntimePreference("pi")).toBe("pi");
    expect(parseAgentRuntimePreference("shell")).toBeUndefined();
  });

  it("binds every prompt to one explicit knowledge base", () => {
    const prompt = buildRunPrompt("write", "更新演示内容", config);
    expect(prompt).toContain("知识库 ID：demo");
    expect(prompt).toContain("THE_WAY_HERE_KNOWLEDGE_BASE=demo");
    expect(prompt).toContain("vault/demo/wiki");
  });

  it("lets the agent decide whether durable conversation should update the wiki", () => {
    const prompt = buildRunPrompt("auto", "帮我处理这段经历", config);
    expect(prompt).toContain("Agent 判断处理方式");
    expect(prompt).toContain("自行判断只查询还是更新 Wiki");
    expect(prompt).toContain("不要求用户使用特殊命令或固定措辞");
    expect(prompt).toContain("范围较大、难以撤销或会改变规则与结构时先询问");
    expect(prompt).not.toContain("只有用户在本次请求中明确要求");
  });

  it("accepts only complete letter-version output targets", () => {
    expect(parseAgentOutputTarget({ kind: "letter-version", pageId: "wiki/12 回信/今天", lensId: "yanni", lensName: "雅尼", label: "雅尼视角回信" })).toEqual({
      kind: "letter-version",
      pageId: "wiki/12 回信/今天",
      lensId: "yanni",
      lensName: "雅尼",
      label: "雅尼视角回信",
    });
    expect(parseAgentOutputTarget({ kind: "letter-version", pageId: "", lensId: "yanni", lensName: "雅尼", label: "雅尼视角回信" })).toBeUndefined();
    expect(parseAgentOutputTarget({ kind: "page-rewrite", pageId: "wiki/12 回信/今天" })).toBeUndefined();
  });
});
