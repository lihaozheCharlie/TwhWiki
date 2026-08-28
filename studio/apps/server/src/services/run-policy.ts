import type { AgentOutputTarget, AgentReasoningEffort, AgentRuntimePreference, VaultConfig, WikiRun } from "@the-way-here/shared";

const runModes = new Set<WikiRun["mode"]>(["auto", "read", "write", "validate"]);
const reasoningEfforts = new Set<AgentReasoningEffort>(["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const runtimePreferences = new Set<AgentRuntimePreference>(["auto", "codex", "pi"]);

export function parseRunMode(value: unknown): WikiRun["mode"] | undefined {
  return typeof value === "string" && runModes.has(value as WikiRun["mode"])
    ? value as WikiRun["mode"]
    : undefined;
}

export function parseReasoningEffort(value: unknown): AgentReasoningEffort | undefined {
  return typeof value === "string" && reasoningEfforts.has(value as AgentReasoningEffort)
    ? value as AgentReasoningEffort
    : undefined;
}

export function parseAgentRuntimePreference(value: unknown): AgentRuntimePreference | undefined {
  return typeof value === "string" && runtimePreferences.has(value as AgentRuntimePreference)
    ? value as AgentRuntimePreference
    : undefined;
}

export function parseAgentOutputTarget(value: unknown): AgentOutputTarget | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const target = value as Record<string, unknown>;
  if (target.kind !== "letter-version") return undefined;
  const fields = ["pageId", "lensId", "lensName", "label"] as const;
  if (fields.some((field) => typeof target[field] !== "string" || !String(target[field]).trim() || String(target[field]).length > 240)) return undefined;
  return {
    kind: "letter-version",
    pageId: String(target.pageId).trim(),
    lensId: String(target.lensId).trim(),
    lensName: String(target.lensName).trim(),
    label: String(target.label).trim(),
  };
}

export function buildRunPrompt(mode: Exclude<WikiRun["mode"], "validate">, prompt: string, config: VaultConfig): string {
  const context = [
    `本次任务绑定知识库 ID：${config.knowledgeBaseId}`,
    `Wiki 路径：${config.paths.wiki}`,
    `来源路径：${config.paths.sources}`,
    `运行维护命令时必须显式设置 THE_WAY_HERE_KNOWLEDGE_BASE=${config.knowledgeBaseId}。`,
  ].join("\n");
  const boundary = mode === "read"
    ? `这是严格只读任务。请先读取并遵守 ${config.paths.agentInstructions}，只查询、解释或诊断，不要修改任何文件。`
    : mode === "write"
      ? `用户已通过 The Way Here 明确授权本次知识写入。请先读取并严格遵守 ${config.paths.agentInstructions} 与所路由的 Skills，只在请求范围内修改，保留原始笔记正文，并完成规定的质量检查。`
      : `这是由 Agent 识别意图的知识任务。请先读取并严格遵守 ${config.paths.agentInstructions} 与所路由的 Skills：如果用户只是在询问、分析、审查或诊断，必须保持严格只读；只有用户在本次请求中明确要求补充、修改、摄取、重跑、重建或修复时，才视为授权在请求范围内写入。不要把模糊表达或识别到的耐久信号当作写入授权；发生写入时保留原始笔记正文并完成规定的质量检查。`;
  return `${boundary}\n\n${context}\n\n用户请求：\n${prompt}`;
}
