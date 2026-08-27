import type { AgentRuntimeEvent, WikiRun } from "@the-way-here/shared";

export type AgentContext = {
  scope: string;
  title: string;
  pageId?: string;
  summary?: string;
  suggestions: string[];
  defaultMode?: "read" | "write";
  launcherLabel?: string;
};

export const collaborationModes: Record<WikiRun["mode"], {
  short: string;
  title: string;
  description: string;
  boundary: string;
  placeholder: string;
  action: string;
}> = {
  auto: {
    short: "协作",
    title: "直接告诉 Agent 你想做什么",
    description: "Agent 会根据你的表达判断是回答问题、整理材料还是更新知识。",
    boundary: "按请求判断；只有明确要求修改时才会写入",
    placeholder: "问一个问题，或说说希望补充、整理、更新什么…",
    action: "交给 Agent",
  },
  read: {
    short: "理解",
    title: "问一个真正想弄明白的问题",
    description: "沿着已有经历、主线、关系与状态寻找证据，再给出区分事实与推断的回答。",
    boundary: "严格只读，不会改动任何文件",
    placeholder: "例如：最近哪些旧循环又出现了？它们可能在保护我什么？",
    action: "开始理解",
  },
  write: {
    short: "沉淀",
    title: "把新材料变成可继续使用的知识",
    description: "把日记、新经历或新想法交给现有构建规则，更新真正受影响的页面。",
    boundary: "本次明确授权写入；原始笔记正文保持不变",
    placeholder: "粘贴或描述材料，并说明希望如何处理。例如：摄取今天的日记，更新相关页面并生成近况回信。",
    action: "授权并开始更新",
  },
  validate: {
    short: "维护",
    title: "确认这套知识仍然健康",
    description: "运行既有标签、链接与结构检查，告诉你哪里通过、哪里需要处理。",
    boundary: "只运行既有质量门，不生成新的知识内容",
    placeholder: "",
    action: "开始健康检查",
  },
};

function eventItem(event: WikiRun["events"][number]): { type?: string; text?: string; phase?: string } | undefined {
  return (event.payload as { item?: { type?: string; text?: string; phase?: string } } | undefined)?.item;
}

export function runFinalAnswer(run: WikiRun): string | undefined {
  if (run.result?.finalAnswer?.trim()) return run.result.finalAnswer.trim();
  for (const event of run.events.slice().reverse()) {
    const runtimeEvent = event.payload as AgentRuntimeEvent | undefined;
    if (runtimeEvent?.type === "assistant.message" && runtimeEvent.final && runtimeEvent.text.trim()) return runtimeEvent.text.trim();
    if (runtimeEvent?.type === "turn.completed" && runtimeEvent.finalAnswer?.trim()) return runtimeEvent.finalAnswer.trim();
    const item = eventItem(event);
    if (item?.type === "agentMessage" && item.phase === "final_answer" && item.text?.trim()) return item.text.trim();
    const turnItems = (event.payload as { turn?: { items?: Array<{ type?: string; text?: string; phase?: string }> } } | undefined)?.turn?.items;
    const answer = turnItems?.slice().reverse().find((candidate) => candidate.type === "agentMessage" && candidate.phase === "final_answer" && candidate.text?.trim());
    if (answer?.text) return answer.text.trim();
  }
  return undefined;
}

export function runConversation(run: WikiRun) {
  return run.events.filter((event) => {
    const runtimeEvent = event.payload as AgentRuntimeEvent | undefined;
    const item = eventItem(event);
    return event.kind === "user"
      || (runtimeEvent?.type === "assistant.message" && !runtimeEvent.final)
      || (item?.type === "agentMessage" && item.phase !== "final_answer");
  });
}

export function runTechnicalEvents(run: WikiRun) {
  return run.events.filter((event) => {
    const runtimeEvent = event.payload as AgentRuntimeEvent | undefined;
    const item = eventItem(event);
    return event.kind !== "user"
      && runtimeEvent?.type !== "assistant.message"
      && runtimeEvent?.type !== "turn.completed"
      && item?.type !== "agentMessage"
      && event.method !== "turn/completed";
  });
}

export function plainPreview(markdown: string | undefined, fallback: string): string {
  return (markdown || fallback).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#>*_`]/g, "").replace(/\s+/g, " ").trim();
}

export function runDisplayPrompt(run: WikiRun): string {
  if (run.displayPrompt?.trim()) return run.displayPrompt.trim();
  const marker = "用户请求：";
  const markerIndex = run.prompt.lastIndexOf(marker);
  return (markerIndex >= 0 ? run.prompt.slice(markerIndex + marker.length) : run.prompt || run.title).trim();
}

export function contextPrompt(context: AgentContext, request: string): string {
  return [
    "当前 GUI 上下文：",
    `- 所在位置：${context.scope}`,
    `- 当前内容：${context.title}`,
    `- 对应知识页面：${context.pageId || "当前类目（请按仓库规则定位具体页面）"}`,
    context.summary ? `- 当前摘要：${context.summary}` : "",
    "",
    "请把以上上下文作为本次任务的起点，并继续遵守仓库 AGENTS.md、相关 Skill、证据追溯和写入授权边界。不要只依据摘要作判断；需要时读取对应页面与来源。",
    "",
    "用户请求：",
    request.trim(),
  ].filter(Boolean).join("\n");
}
