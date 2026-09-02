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
      ? `这是以沉淀知识为目标的任务。请先读取并严格遵守 ${config.paths.agentInstructions} 与所路由的 Skills，只修改真正受影响的内容，保留原始笔记正文，并完成规定的质量检查。`
      : `这是由 Agent 判断处理方式的知识任务。请先读取并严格遵守 ${config.paths.agentInstructions} 与所路由的 Skills。先自然回应用户，再根据当前目标、对话内容的耐久价值和实际影响，自行判断只查询还是更新 Wiki；不要求用户使用特殊命令或固定措辞。只有信息具体、耐久、证据充分，且局部更新确实有助于保留或修正理解时才写入；信号短暂、含糊、纯猜测或只会制造噪声时保持不变。用户明确要求只读时不要写入；范围较大、难以撤销或会改变规则与结构时先询问。发生写入时保留原始笔记正文、标明对话材料与推断，并完成规定的质量检查。`;
  return `${boundary}\n\n${context}\n\n用户请求：\n${prompt}`;
}
