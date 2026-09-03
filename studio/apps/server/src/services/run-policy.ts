import { JOURNEY_REPORT_OUTPUT_END, JOURNEY_REPORT_OUTPUT_START, type AgentOutputTarget, type AgentReasoningEffort, type AgentRuntimePreference, type VaultConfig, type WikiRun } from "@the-way-here/shared";

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
  if (target.kind === "letter-version") {
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
  if (target.kind === "journey-report") {
    const fields = ["importId", "storedPath", "label"] as const;
    if (fields.some((field) => typeof target[field] !== "string" || !String(target[field]).trim() || String(target[field]).length > 500)) return undefined;
    return {
      kind: "journey-report",
      importId: String(target.importId).trim(),
      storedPath: String(target.storedPath).trim(),
      label: String(target.label).trim(),
    };
  }
  return undefined;
}

export function addOutputTargetInstructions(prompt: string, target?: AgentOutputTarget): string {
  if (target?.kind !== "journey-report") return prompt;
  return `${prompt}\n\n本次对话有一个受控结果目标：持续完善「${target.label}」。你可以读取当前消费旅程报告和现有 Wiki 来理解背景、寻找关联与减少重复提问，但 Wiki 只作为参考，不得修改任何文件，也不得把 Wiki 中的推断冒充成用户本轮确认的事实。\n\n每轮先自然回应用户，并且只在仍需补充时追问一个开放式问题；如果用户表示满意，就简短说明报告已经整理好，不要替用户触发 Wiki 构建。回答末尾必须附上当前完整、可独立阅读的已确认旅程草稿，严格放在以下标记之间：\n${JOURNEY_REPORT_OUTPUT_START}\n（完整 Markdown 草稿，只写账单证据、用户已经讲述的内容，以及明确标注的推断或未知；不要包含标记本身）\n${JOURNEY_REPORT_OUTPUT_END}\n系统会隐藏这个区块并只把它写回消费旅程报告。每一轮都要给出完整草稿，不要只给增量。`;
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
