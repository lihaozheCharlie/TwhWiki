import { JOURNEY_REPORT_OUTPUT_END, JOURNEY_REPORT_OUTPUT_START, type AgentOutputTarget, type AgentRuntimeEvent, type SourceRunContext, type WikiRun } from "@the-way-here/shared";

export type AgentContext = {
  scope: string;
  title: string;
  pageId?: string;
  summary?: string;
  suggestions: string[];
  defaultMode?: "read" | "write";
  defaultOutputTarget?: AgentOutputTarget;
  defaultSourceContext?: SourceRunContext;
  launcherLabel?: string;
  compactLauncher?: boolean;
};

export type AgentAttachedContext = {
  title: string;
  currentUnderstanding: string;
  reason: string;
};

export type OpenContextAgentRequest = {
  prompt?: string;
  displayPrompt?: string;
  attachedContext?: AgentAttachedContext;
  autoSubmit?: boolean;
  lockMode?: boolean;
  mode?: WikiRun["mode"];
  runId?: string;
  view?: "compose" | "history";
  outputTarget?: AgentOutputTarget;
  sourceContext?: SourceRunContext;
};

export type AgentAutoSubmission = {
  prompt: string;
  displayPrompt: string;
  mode: WikiRun["mode"];
  outputTarget?: AgentOutputTarget;
  sourceContext?: SourceRunContext;
};

export function agentContextIdentity(context: AgentContext): string {
  const target = context.defaultOutputTarget;
  if (target?.kind === "photo-memory") return `photo:${target.importId}:${target.phase}`;
  if (target?.kind === "journey-report") return `journey:${target.importId}:${target.storedPath}`;
  if (target?.kind === "letter-version") return `letter:${target.pageId}:${target.lensId}`;
  if (context.pageId) return `page:${context.pageId}`;
  const source = context.defaultSourceContext;
  if (source) return `source:${source.importId}:${source.storedPath}:${source.flow}`;
  return `surface:${context.scope}:${context.title}`;
}

export function shouldSubmitAgentInput(event: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

export function openContextAgent(request: OpenContextAgentRequest = {}): void {
  window.dispatchEvent(new CustomEvent<OpenContextAgentRequest>("open-context-agent", { detail: request }));
}

export function attachedContextPrompt(attachedContext: AgentAttachedContext, request: string): string {
  return [
    "以下是系统随话题带入的背景资料，不是用户已经说过的话：",
    `- 话题：${attachedContext.title}`,
    `- 已有理解：${attachedContext.currentUnderstanding}`,
    `- 为什么值得聊：${attachedContext.reason}`,
    "",
    "请把这份资料当作背景，先听用户表达具体经历，再结合相关证据帮用户理清线索；一次只问一个真正需要用户补充的具体问题。",
    "",
    "用户这次想说：",
    request.trim(),
  ].join("\n");
}

export function resolveAgentAutoSubmission(request: OpenContextAgentRequest, defaultMode?: WikiRun["mode"]): AgentAutoSubmission | undefined {
  const prompt = request.prompt?.trim();
  if (!request.autoSubmit || !prompt) return undefined;
  return {
    prompt,
    displayPrompt: request.displayPrompt?.trim() || prompt,
    mode: resolveComposerMode(request.mode || defaultMode, request.outputTarget, request.lockMode),
    outputTarget: request.outputTarget,
    ...(request.sourceContext ? { sourceContext: request.sourceContext } : {}),
  };
}

export function resolveComposerMode(requested?: WikiRun["mode"], outputTarget?: AgentOutputTarget, lockMode = false): WikiRun["mode"] {
  if (outputTarget?.kind === "journey-report" || outputTarget?.kind === "photo-memory") return "read";
  if (lockMode && requested) return requested;
  return requested === "validate" ? "validate" : "auto";
}

export type AgentThread = {
  id: string;
  latest: WikiRun;
  runs: WikiRun[];
};

export type LetterRunVersion = {
  id: string;
  runId: string;
  label: string;
  lensName: string;
  markdown: string;
  createdAt: string;
};

export function letterRunVersions(runs: WikiRun[], pageId: string): LetterRunVersion[] {
  return runs.flatMap((run) => {
    const target = run.outputTarget;
    const markdown = run.status === "completed" ? runFinalAnswer(run) : undefined;
    if (target?.kind !== "letter-version" || target.pageId !== pageId || !markdown) return [];
    return [{
      id: run.id,
      runId: run.id,
      label: target.label,
      lensName: target.lensName,
      markdown,
      createdAt: run.result?.completedAt || run.updatedAt || run.createdAt,
    }];
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function groupAgentThreads(runs: WikiRun[]): AgentThread[] {
  const grouped = new Map<string, WikiRun[]>();
  for (const run of runs) {
    const id = run.runtimeSessionId || run.id;
    grouped.set(id, [...(grouped.get(id) || []), run]);
  }
  return [...grouped.entries()].map(([id, threadRuns]) => {
    const sorted = threadRuns.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { id, latest: sorted.at(-1)!, runs: sorted };
  }).sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
}

export function boundAgentThreadForPage(runs: WikiRun[], pageId?: string): AgentThread | undefined {
  if (!pageId) return undefined;
  const normalizePagePath = (value: string) => value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\.md$/i, "");
  const normalizedPageId = normalizePagePath(pageId);
  return groupAgentThreads(runs).find((thread) => thread.runs.some((run) => {
    if (run.contextPageId && normalizePagePath(run.contextPageId) === normalizedPageId) return true;
    if (run.outputTarget?.kind === "letter-version" && run.outputTarget.pageId === pageId) return true;
    const paths = [run.sourceContext?.storedPath, ...(run.sourceContext?.storedPaths || [])];
    return paths.some((storedPath) => {
      if (!storedPath) return false;
      const normalizedStoredPath = normalizePagePath(storedPath);
      return normalizedStoredPath === normalizedPageId || normalizedStoredPath.endsWith(`/${normalizedPageId}`);
    });
  }));
}

export const collaborationModes: Record<WikiRun["mode"], {
  short: string;
  title: string;
  description: string;
  boundary: string;
  placeholder: string;
  action: string;
}> = {
  auto: {
    short: "自动判断",
    title: "告诉我你想聊什么，或者想留下什么",
    description: "我会根据你的话判断是陪你理解、整理记录，还是更新已经形成的理解。",
    boundary: "我会判断是继续聊清，还是把值得留下的新理解放回 Wiki",
    placeholder: "问一个问题，或说说希望补充、整理、更新什么…",
    action: "从这里开始",
  },
  read: {
    short: "理解",
    title: "先把事情说清楚",
    description: "沿着已有经历寻找证据，分开当前理解和仍然未知，再陪你往下想。",
    boundary: "严格只读，不会改动任何文件",
    placeholder: "说说最近发生了什么，或者告诉我哪里不准确…",
    action: "一起聊聊",
  },
  write: {
    short: "沉淀",
    title: "把这段经历好好留下来",
    description: "把日记、新经历或新想法放回你的来路里，只更新真正受到影响的理解。",
    boundary: "只更新真正受影响的理解；原始笔记正文保持不变",
    placeholder: "粘贴或描述材料，并说明希望如何处理。例如：摄取今天的日记，更新相关页面并生成近况回信。",
    action: "开始整理",
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
  if (run.result?.finalAnswer?.trim()) return visibleAgentAnswer(run.result.finalAnswer, run.outputTarget);
  for (const event of run.events.slice().reverse()) {
    const runtimeEvent = event.payload as AgentRuntimeEvent | undefined;
    if (runtimeEvent?.type === "assistant.message" && runtimeEvent.final && runtimeEvent.text.trim()) return visibleAgentAnswer(runtimeEvent.text, run.outputTarget);
    if (runtimeEvent?.type === "turn.completed" && runtimeEvent.finalAnswer?.trim()) return visibleAgentAnswer(runtimeEvent.finalAnswer, run.outputTarget);
    const item = eventItem(event);
    if (item?.type === "agentMessage" && item.phase === "final_answer" && item.text?.trim()) return visibleAgentAnswer(item.text, run.outputTarget);
    const turnItems = (event.payload as { turn?: { items?: Array<{ type?: string; text?: string; phase?: string }> } } | undefined)?.turn?.items;
    const answer = turnItems?.slice().reverse().find((candidate) => candidate.type === "agentMessage" && candidate.phase === "final_answer" && candidate.text?.trim());
    if (answer?.text) return visibleAgentAnswer(answer.text, run.outputTarget);
  }
  return undefined;
}

export function visibleAgentAnswer(answer: string, target?: AgentOutputTarget): string {
  if (target?.kind === "photo-memory") return answer.replace(/<photo-memory>[\s\S]*?(?:<\/photo-memory>|$)/g, "").trim();
  if (target?.kind !== "journey-report") return answer.trim();
  const start = answer.lastIndexOf(JOURNEY_REPORT_OUTPUT_START);
  const end = answer.indexOf(JOURNEY_REPORT_OUTPUT_END, start + JOURNEY_REPORT_OUTPUT_START.length);
  if (start < 0 || end < 0) return answer.trim();
  return `${answer.slice(0, start)}${answer.slice(end + JOURNEY_REPORT_OUTPUT_END.length)}`.trim();
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
    "请把以上上下文作为本次任务的起点，并继续遵守仓库 AGENTS.md、相关 Skill、证据追溯、原始笔记保护和变更范围边界。不要只依据摘要作判断；需要时读取对应页面与来源。",
    "",
    "用户请求：",
    request.trim(),
  ].filter(Boolean).join("\n");
}
