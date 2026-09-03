import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { RunStore } from "@the-way-here/run-manager";
import type {
  AgentApprovalDecision,
  AgentGlobalSettings,
  AgentModelOption,
  AgentOutputTarget,
  AgentProviderPreset,
  AgentReasoningEffort,
  AgentRuntimeDescriptor,
  AgentRuntimeId,
  AgentRuntimePreference,
  SourceRunContext,
  UpdateAgentGlobalSettings,
  WikiRun,
} from "@the-way-here/shared";
import { JourneyReportStore, JourneyReportTargetError } from "../modules/imports/journey-report-store.js";
import { addOutputTargetInstructions, buildRunPrompt, parseAgentOutputTarget, parseAgentRuntimePreference, parseReasoningEffort, parseRunMode } from "../services/run-policy.js";
import { runValidationCommands } from "../services/validation-runner.js";
import type { AgentExecutionRef, AgentRuntimeEnvelope } from "./agent-runtime/types.js";
import type { AgentRuntimeProvider, ResolvedAgentSelection } from "./agent-runtime/registry.js";
import { AgentSettingsValidationError } from "./agent-runtime/agent-settings-store.js";
import { KnowledgeRuntime } from "./knowledge-runtime.js";

export type StartRunInput = {
  title?: string;
  prompt?: string;
  displayPrompt?: string;
  mode?: WikiRun["mode"];
  knowledgeBaseId?: string;
  runtimeId?: AgentRuntimePreference;
  sessionId?: string;
  model?: string;
  effort?: AgentReasoningEffort;
  outputTarget?: AgentOutputTarget;
  sourceContext?: SourceRunContext;
};

export class RunRequestError extends Error {
  constructor(readonly statusCode: number, message: string, readonly payload?: WikiRun) {
    super(message);
  }
}

export class RunCoordinator {
  private readonly runs: RunStore;
  private readonly journeyReports: JourneyReportStore;
  private readonly runByExecution = new Map<string, string>();

  constructor(
    private readonly knowledge: KnowledgeRuntime,
    private readonly runtimes: AgentRuntimeProvider,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.runs = new RunStore(knowledge.vaultRoot, undefined, [path.join(knowledge.vaultRoot, "vault")]);
    this.journeyReports = new JourneyReportStore(knowledge.vaultRoot);
    this.runtimes.subscribe((envelope) => {
      void this.recordRuntimeEvent(envelope).catch((error) => this.logger.error(error));
    });
  }

  async list(): Promise<WikiRun[]> {
    const knowledgeBaseId = this.knowledge.index.config.knowledgeBaseId;
    return (await this.runs.list()).filter((run) => !run.knowledgeBaseId || run.knowledgeBaseId === knowledgeBaseId);
  }

  async hasActiveKnowledgeBaseRun(knowledgeBaseId: string): Promise<boolean> {
    return (await this.runs.list()).some((run) => run.knowledgeBaseId === knowledgeBaseId && !["completed", "failed", "interrupted"].includes(run.status));
  }

  get(id: string): Promise<WikiRun | undefined> {
    return this.runs.get(id);
  }

  models(): Promise<AgentModelOption[]> {
    return this.runtimes.catalog().then((catalog) => catalog.flatMap((runtime) => runtime.models));
  }

  runtimeCatalog(): Promise<AgentRuntimeDescriptor[]> {
    return this.runtimes.catalog();
  }

  providerPresets(): AgentProviderPreset[] {
    return this.runtimes.providerPresets();
  }

  agentSettings(): AgentGlobalSettings {
    return this.runtimes.settings();
  }

  async updateAgentSettings(input: UpdateAgentGlobalSettings): Promise<AgentGlobalSettings> {
    try {
      const settings = await this.runtimes.updateSettings(input);
      this.knowledge.events.broadcast("agent-settings", settings);
      return settings;
    } catch (error) {
      if (error instanceof AgentSettingsValidationError) throw new RunRequestError(400, error.message);
      throw error;
    }
  }

  async start(input: StartRunInput): Promise<WikiRun> {
    for (const [field, value] of [["prompt", input.prompt], ["displayPrompt", input.displayPrompt], ["title", input.title], ["knowledgeBaseId", input.knowledgeBaseId]] as const) {
      if (value !== undefined && typeof value !== "string") throw new RunRequestError(400, `${field} 必须是字符串`);
    }
    const prompt = input.prompt?.trim();
    const mode = parseRunMode(input.mode || "read");
    if (!mode) throw new RunRequestError(400, "任务模式无效");
    let resolvedKnowledge;
    try {
      resolvedKnowledge = await this.knowledge.resolve(input.knowledgeBaseId?.trim() || this.knowledge.index.config.knowledgeBaseId);
    } catch (error: any) {
      throw new RunRequestError(404, error.message || "知识库不存在");
    }
    const taskConfig = resolvedKnowledge.config;
    const outputTarget = input.outputTarget === undefined ? undefined : parseAgentOutputTarget(input.outputTarget);
    if (input.outputTarget !== undefined && !outputTarget) throw new RunRequestError(400, "结果保存目标无效");
    if (outputTarget) {
      if (outputTarget.kind === "letter-version") {
        const targetPage = resolvedKnowledge.index.get(outputTarget.pageId);
        if (!targetPage || targetPage.category !== "letters") throw new RunRequestError(404, "要保存版本的回信不存在");
      } else {
        if (mode !== "read") throw new RunRequestError(400, "消费旅程对话必须使用只读模式");
        try {
          await this.journeyReports.assertTarget(taskConfig, outputTarget);
        } catch (error) {
          if (error instanceof JourneyReportTargetError) throw new RunRequestError(404, error.message);
          throw error;
        }
      }
    }
    const normalizedInput = { ...input, outputTarget };
    if (!prompt && mode !== "validate") throw new RunRequestError(400, "请输入任务内容");
    const requestedEffort = input.effort ? parseReasoningEffort(input.effort) : undefined;
    if (input.effort && !requestedEffort) throw new RunRequestError(400, "思考深度无效");
    const requestedRuntime = input.runtimeId ? parseAgentRuntimePreference(input.runtimeId) : undefined;
    if (input.runtimeId && !requestedRuntime) throw new RunRequestError(400, "Agent 运行时无效");
    if (input.model !== undefined && (typeof input.model !== "string" || !input.model.trim())) throw new RunRequestError(400, "模型 ID 无效");
    if (input.sessionId !== undefined && (typeof input.sessionId !== "string" || !input.sessionId.trim())) throw new RunRequestError(400, "Agent 会话 ID 无效");
    if (input.sourceContext !== undefined && !validSourceContext(input.sourceContext)) throw new RunRequestError(400, "生活记录构建上下文无效");

    if (mode === "validate") {
      const run = await this.createRun(normalizedInput, mode, prompt || "运行知识质量检查", taskConfig);
      this.knowledge.events.broadcast("run", run);
      void this.validateOnly(run.id);
      return run;
    }

    const previous = input.sessionId
      ? (await this.runs.list()).find((run) => run.runtimeSessionId === input.sessionId)
      : undefined;
    if (input.sessionId && !previous) throw new RunRequestError(404, "要继续的 Agent 会话不存在");
    if (previous?.runtimeId && requestedRuntime && requestedRuntime !== "auto" && requestedRuntime !== previous.runtimeId) {
      throw new RunRequestError(400, "同一会话不能切换 Agent 运行时；请新建任务");
    }
    normalizedInput.outputTarget = outputTarget || previous?.outputTarget;
    normalizedInput.sourceContext = input.sourceContext || previous?.sourceContext;
    if (normalizedInput.outputTarget?.kind === "journey-report" && mode !== "read") {
      throw new RunRequestError(400, "消费旅程对话必须保持只读；请另行点击构建这份记录");
    }
    if (normalizedInput.outputTarget?.kind === "journey-report") {
      const target = normalizedInput.outputTarget;
      const context = normalizedInput.sourceContext;
      if (context && (context.importId !== target.importId || context.storedPath !== target.storedPath || context.flow !== "dialogue" || context.operation && context.operation !== "enrich")) {
        throw new RunRequestError(400, "消费旅程报告与对话上下文不一致");
      }
      normalizedInput.sourceContext = { importId: target.importId, storedPath: target.storedPath, flow: "dialogue", operation: "enrich" };
      try {
        normalizedInput.outputTarget = await this.journeyReports.prepareTarget(taskConfig, target);
      } catch (error) {
        if (error instanceof JourneyReportTargetError) throw new RunRequestError(409, error.message);
        throw error;
      }
    }
    let selection: ResolvedAgentSelection;
    try {
      selection = await this.runtimes.resolve(
        previous?.runtimeId || requestedRuntime,
        input.model?.trim() || previous?.model,
        requestedEffort || previous?.effort,
      );
    } catch (error: any) {
      throw new RunRequestError(503, error.message || "没有可用的 Agent 运行时");
    }
    const run = await this.createRun(normalizedInput, mode, prompt!, taskConfig, {
      runtimeId: selection.runtimeId,
      provider: selection.model.provider,
      model: selection.model.id,
      effort: selection.effort,
    });
    this.knowledge.events.broadcast("run", run);

    try {
      if (mode === "write" || mode === "auto") await this.runs.snapshot(run.id, taskConfig);
      const ref = await selection.runtime.start({
        cwd: this.knowledge.vaultRoot,
        prompt: buildRunPrompt(mode, addOutputTargetInstructions(prompt!, normalizedInput.outputTarget), taskConfig),
        model: selection.model.id,
        effort: selection.effort,
        mode,
        config: taskConfig,
        sessionId: previous?.runtimeSessionId,
      });
      this.runByExecution.set(executionKey(ref), run.id);
      const active = await this.runs.update(run.id, {
        runtimeSessionId: ref.sessionId,
        runtimeTurnId: ref.turnId,
        status: "running",
      });
      await this.runs.addEvent(run.id, { kind: "agent", method: "turn.started", message: `${runtimeName(selection.runtimeId)} 已开始处理`, payload: { type: "turn.started", sessionId: ref.sessionId, turnId: ref.turnId } });
      this.knowledge.events.broadcast("run", await this.runs.get(run.id));
      return active;
    } catch (error: any) {
      const failed = await this.runs.setStatus(run.id, "failed", error.message);
      throw new RunRequestError(500, error.message, failed);
    }
  }

  async steer(id: string, prompt: string | undefined): Promise<WikiRun | undefined> {
    const run = await this.runs.get(id);
    if (!prompt?.trim()) throw new RunRequestError(400, "请输入追加说明");
    const ref = refOf(run);
    await this.runtimes.require(ref.runtimeId).steer(ref, prompt.trim());
    await this.runs.addEvent(id, { kind: "user", message: prompt.trim() });
    return this.runs.get(id);
  }

  async interrupt(id: string): Promise<WikiRun> {
    const run = await this.runs.get(id);
    const ref = refOf(run);
    await this.runtimes.require(ref.runtimeId).interrupt(ref);
    return this.runs.setStatus(id, "interrupted");
  }

  async approve(id: string, requestId: string | number, decision: AgentApprovalDecision): Promise<WikiRun> {
    if (!new Set<AgentApprovalDecision>(["allow-once", "allow-for-session", "deny", "cancel"]).has(decision)) throw new RunRequestError(400, "审批决定无效");
    const run = await this.runs.get(id);
    if (!run?.approvals.some((approval) => String(approval.requestId) === String(requestId))) throw new RunRequestError(404, "审批请求不存在");
    const ref = refOf(run);
    await this.runtimes.require(ref.runtimeId).decide(ref, requestId, decision);
    return this.runs.resolveApproval(id, requestId);
  }

  async reconcile(): Promise<void> {
    const persisted: WikiRun[] = [];
    for (const stored of await this.runs.list()) {
      const run = await this.ensureContext(stored);
      persisted.push(run);
      if (await this.runs.isLegacyWorkspaceRun(run.id) && !run.recoveredFromLegacyWorkspace && ["completed", "failed", "interrupted"].includes(run.status)) {
        await this.runs.update(run.id, { recoveredFromLegacyWorkspace: true, changes: [] });
      }
    }
    for (const run of persisted.filter((entry) => entry.runtimeId && entry.runtimeSessionId && entry.runtimeTurnId && !["completed", "failed", "interrupted"].includes(entry.status))) {
      const ref = refOf(run);
      try {
        const recovered = await this.runtimes.require(ref.runtimeId).recover(ref);
        if (recovered.status === "running") this.runByExecution.set(executionKey(ref), run.id);
        else if (recovered.status === "completed") {
          if (recovered.finalAnswer) await this.runs.update(run.id, { result: { finalAnswer: recovered.finalAnswer } });
          await this.finish(run.id);
        } else if (recovered.status === "failed" || recovered.status === "interrupted") {
          await this.runs.setStatus(run.id, recovered.status, recovered.error);
        }
      } catch (error) {
        this.logger.warn({ err: error, runId: run.id }, "无法恢复 Agent 任务状态，将保留原记录等待下次启动");
      }
    }
  }

  close(): void {
    this.runtimes.close();
  }

  private async createRun(
    input: StartRunInput,
    mode: WikiRun["mode"],
    prompt: string,
    config: WikiRun["configSnapshot"],
    agent: Partial<Pick<WikiRun, "runtimeId" | "provider" | "model" | "effort">> = {},
  ): Promise<WikiRun> {
    try {
      return await this.runs.create(
        input.title?.trim() || (mode === "validate" ? "检查知识" : "知识任务"),
        prompt,
        mode,
        config.knowledgeBaseId,
        config,
        { displayPrompt: input.displayPrompt?.trim() || prompt, outputTarget: input.outputTarget, sourceContext: input.sourceContext, ...agent },
      );
    } catch (error: any) {
      throw new RunRequestError(409, error.message || "无法创建任务");
    }
  }

  private async recordRuntimeEvent(envelope: AgentRuntimeEnvelope): Promise<void> {
    const runId = this.runByExecution.get(executionKey(envelope.ref));
    if (!runId) return;
    const event = envelope.event;
    this.knowledge.events.broadcast("agent", { runId, runtimeId: envelope.ref.runtimeId, event });
    if (event.type === "approval.requested") {
      const run = await this.runs.addApproval(runId, event.approval);
      this.knowledge.events.broadcast("approval", { runId, request: event.approval });
      this.knowledge.events.broadcast("run", run);
      return;
    }
    const message = runtimeEventMessage(event);
    if (message) await this.runs.addEvent(runId, { kind: eventKind(event.type), method: event.type, message, payload: event });
    if (event.type === "assistant.message" && event.final) {
      await this.runs.update(runId, { result: { finalAnswer: event.text } });
    }
    if (event.type === "turn.completed") {
      this.runByExecution.delete(executionKey(envelope.ref));
      if (event.finalAnswer) await this.runs.update(runId, { result: { finalAnswer: event.finalAnswer } });
      if (event.outcome === "completed") await this.finish(runId);
      else await this.runs.setStatus(runId, event.outcome === "interrupted" ? "interrupted" : "failed", event.error);
    }
    this.knowledge.events.broadcast("run", await this.runs.get(runId));
  }

  private async ensureContext(run: WikiRun): Promise<WikiRun> {
    if (run.knowledgeBaseId && run.configSnapshot) return run;
    const resolved = await this.knowledge.resolve(run.knowledgeBaseId || this.knowledge.index.config.knowledgeBaseId);
    return this.runs.update(run.id, { knowledgeBaseId: resolved.config.knowledgeBaseId, configSnapshot: resolved.config });
  }

  private async validate(runId: string): Promise<boolean> {
    const stored = await this.runs.get(runId);
    if (!stored) throw new Error("任务不存在");
    const run = await this.ensureContext(stored);
    const { valid, results } = await runValidationCommands({
      vaultRoot: this.knowledge.vaultRoot,
      knowledgeBaseId: run.knowledgeBaseId,
      config: run.configSnapshot,
      onOutput: (command, chunk) => this.knowledge.events.broadcast("validation-output", { runId, command, chunk }),
      onResult: async (result) => {
        await this.runs.addEvent(runId, { kind: "validation", message: `${result.command.join(" ")}：${result.exitCode === 0 ? "通过" : "失败"}`, payload: result });
      },
    });
    await this.runs.update(runId, { validation: results });
    return valid;
  }

  private async finish(runId: string): Promise<void> {
    const stored = await this.runs.get(runId);
    if (!stored || ["validating", "completed", "failed", "interrupted"].includes(stored.status)) return;
    const run = await this.ensureContext(stored);
    if (run.mode === "read") {
      if (run.outputTarget?.kind === "journey-report") {
        try {
          const saved = await this.journeyReports.materialize(run.configSnapshot, run.outputTarget, run.result?.finalAnswer || "");
          await this.knowledge.rebuildIfActive(run.knowledgeBaseId);
          await this.runs.update(runId, { status: "completed", result: { ...run.result, finalAnswer: saved.visibleAnswer, outputSavedAt: saved.savedAt, completedAt: saved.savedAt } });
        } catch (error: any) {
          await this.runs.update(runId, { status: "failed", error: error?.message || "消费旅程报告没有更新", result: { ...run.result, completedAt: new Date().toISOString() } });
        }
        return;
      }
      await this.runs.update(runId, { status: "completed", result: { ...run.result, completedAt: new Date().toISOString() } });
      return;
    }
    if (run.mode === "auto") {
      const changes = await this.runs.collectChanges(runId, run.configSnapshot);
      if (!changes.length) {
        await this.runs.update(runId, { status: "completed", result: { ...run.result, completedAt: new Date().toISOString() } });
        return;
      }
    }
    await this.runs.setStatus(runId, "validating");
    this.knowledge.events.broadcast("run", await this.runs.get(runId));
    const valid = await this.validate(runId);
    if (run.mode === "write") await this.runs.collectChanges(runId, run.configSnapshot);
    await this.knowledge.rebuildIfActive(run.knowledgeBaseId);
    await this.runs.update(runId, {
      status: valid ? "completed" : "failed",
      error: valid ? undefined : "知识质量检查未通过",
      result: { ...run.result, completedAt: new Date().toISOString() },
    });
  }

  private async validateOnly(runId: string): Promise<void> {
    await this.runs.setStatus(runId, "validating");
    const valid = await this.validate(runId);
    await this.runs.update(runId, {
      status: valid ? "completed" : "failed",
      error: valid ? undefined : "知识质量检查未通过",
      result: { completedAt: new Date().toISOString() },
    });
    this.knowledge.events.broadcast("run", await this.runs.get(runId));
  }
}

function validSourceContext(value: SourceRunContext): boolean {
  return Boolean(value && typeof value.importId === "string" && value.importId.trim()
    && typeof value.storedPath === "string" && value.storedPath.trim()
    && (value.storedPaths === undefined || Array.isArray(value.storedPaths) && value.storedPaths.length > 0 && value.storedPaths.every((path) => typeof path === "string" && path.trim()))
    && (value.allDirect === undefined || typeof value.allDirect === "boolean")
    && (value.operation === undefined || new Set(["enrich", "build"]).has(value.operation))
    && new Set(["direct", "dialogue", "identify"]).has(value.flow));
}

function refOf(run: WikiRun | undefined): AgentExecutionRef {
  if (!run?.runtimeId || !run.runtimeSessionId || !run.runtimeTurnId) throw new RunRequestError(400, "任务没有活动 Agent 会话");
  return { runtimeId: run.runtimeId, sessionId: run.runtimeSessionId, turnId: run.runtimeTurnId };
}

function executionKey(ref: AgentExecutionRef): string {
  return `${ref.runtimeId}:${ref.sessionId}:${ref.turnId}`;
}

function runtimeName(id: AgentRuntimeId): string {
  return id === "codex" ? "Codex" : "自定义模型 Agent";
}

function eventKind(type: string): string {
  if (type.startsWith("assistant.")) return "assistant";
  if (type.startsWith("tool.")) return "tool";
  if (type === "diagnostic") return "diagnostic";
  return "agent";
}

function runtimeEventMessage(event: AgentRuntimeEnvelope["event"]): string | undefined {
  if (event.type === "assistant.message") return event.text;
  if (event.type === "tool.started") return event.summary || `正在使用：${event.toolName}`;
  if (event.type === "tool.completed") return `${event.toolName}${event.success ? "已完成" : "失败"}`;
  if (event.type === "turn.completed") return event.outcome === "completed" ? "Agent 回合已完成" : event.error || "Agent 回合已结束";
  if (event.type === "diagnostic") return event.message;
  return undefined;
}
