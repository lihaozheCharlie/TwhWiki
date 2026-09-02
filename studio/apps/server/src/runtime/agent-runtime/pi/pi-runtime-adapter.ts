import { randomUUID } from "node:crypto";
import { Agent, type AgentEvent, type AgentMessage, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import { contentText } from "@earendil-works/pi-ai";
import type { AgentApprovalDecision, AgentRuntimeEvent, VaultConfig } from "@the-way-here/shared";
import type { AgentExecutionRef, AgentRecoveryState, AgentRuntime, StartAgentExecution } from "../types.js";
import { RuntimeEventSource } from "../types.js";
import { PiModelCatalog, type PiProviderConfig } from "./pi-model-catalog.js";
import { PiSessionRepository } from "./pi-session-repository.js";
import { createPiTools } from "./pi-tools.js";

type ActivePiExecution = {
  ref: AgentExecutionRef;
  agent: Agent;
  model: string;
  finalAnswer?: string;
  interrupted: boolean;
};

export class PiRuntimeAdapter extends RuntimeEventSource implements AgentRuntime {
  readonly id = "pi" as const;
  private catalog: PiModelCatalog;
  private readonly sessions: PiSessionRepository;
  private readonly active = new Map<string, ActivePiExecution>();

  constructor(vaultRoot: string, private enabled: boolean, providers: VaultConfig["agents"]["runtimes"]["pi"]["providers"] | PiProviderConfig[]) {
    super();
    this.catalog = new PiModelCatalog(providers);
    this.sessions = new PiSessionRepository(vaultRoot);
  }

  configure(enabled: boolean, providers: PiProviderConfig[]): void {
    this.enabled = enabled;
    this.catalog = new PiModelCatalog(providers);
  }

  async inspect() {
    if (!this.enabled) return { id: this.id, displayName: "自定义模型", available: false, reason: "Pi 运行时未启用", models: [] };
    const models = await this.catalog.list();
    return {
      id: this.id,
      displayName: "自定义模型",
      available: models.length > 0,
      reason: models.length ? undefined : "尚未配置可用模型或模型密钥",
      models,
    };
  }

  async start(input: StartAgentExecution): Promise<AgentExecutionRef> {
    if (!this.enabled) throw new Error("Pi 运行时未启用");
    const model = this.catalog.get(input.model);
    if (!model) throw new Error(`Pi 模型不可用：${input.model}`);
    const sessionId = input.sessionId || randomUUID();
    if (this.active.get(sessionId)?.agent.state.isStreaming) throw new Error("Pi 会话已有一个回合正在运行");
    const restored = input.sessionId ? await this.sessions.load(sessionId) : undefined;
    const turnId = randomUUID();
    const ref = { runtimeId: this.id, sessionId, turnId } satisfies AgentExecutionRef;
    const tools = createPiTools({ cwd: input.cwd, config: input.config, mode: input.mode });
    const agent = new Agent({
      initialState: {
        systemPrompt: "你是 The Way Here 的知识 Agent。严格遵守用户 prompt 中绑定的知识库、AGENTS.md、Skills、证据追溯、原始笔记保护和变更范围边界。只使用当前提供的工具。",
        model,
        thinkingLevel: piThinkingLevel(input.effort),
        tools,
        messages: restored?.messages || [],
      },
      streamFn: this.catalog.models.streamSimple.bind(this.catalog.models),
      sessionId,
      toolExecution: "sequential",
    });
    const execution: ActivePiExecution = { ref, agent, model: input.model, interrupted: false };
    this.active.set(sessionId, execution);
    agent.subscribe((event) => this.onAgentEvent(execution, event));
    await this.sessions.save({ id: sessionId, model: input.model, messages: agent.state.messages, status: "running" });
    setImmediate(() => {
      if (this.active.get(sessionId) !== execution) return;
      this.emit({ ref, event: { type: "turn.started", sessionId, turnId } });
      void agent.prompt(input.prompt).catch(async (error: any) => {
        await this.finish(execution, execution.interrupted ? "interrupted" : "failed", error.message || String(error));
      });
    });
    return ref;
  }

  async steer(ref: AgentExecutionRef, prompt: string): Promise<void> {
    const execution = this.requireActive(ref);
    execution.agent.steer({ role: "user", content: prompt, timestamp: Date.now() });
  }

  async interrupt(ref: AgentExecutionRef): Promise<void> {
    const execution = this.requireActive(ref);
    execution.interrupted = true;
    execution.agent.abort();
  }

  async decide(ref: AgentExecutionRef, approvalId: string | number, decision: AgentApprovalDecision): Promise<void> {
    void ref;
    void approvalId;
    void decision;
    throw new Error("Pi 运行时没有等待确认的操作");
  }

  async recover(ref: AgentExecutionRef): Promise<AgentRecoveryState> {
    const active = this.active.get(ref.sessionId);
    if (active?.agent.state.isStreaming) return { status: "running" };
    const record = await this.sessions.load(ref.sessionId);
    if (!record) return { status: "missing" };
    if (record.status === "running") return { status: "interrupted", finalAnswer: record.finalAnswer, error: "Studio 重启中断了本地 Pi 回合" };
    return { status: record.status, finalAnswer: record.finalAnswer, error: record.error };
  }

  close(): void {
    for (const execution of this.active.values()) execution.agent.abort();
  }

  private requireActive(ref: AgentExecutionRef): ActivePiExecution {
    const execution = this.active.get(ref.sessionId);
    if (!execution || execution.ref.turnId !== ref.turnId) throw new Error("Pi 任务没有活动回合");
    return execution;
  }

  private async onAgentEvent(execution: ActivePiExecution, event: AgentEvent): Promise<void> {
    const normalized = normalizePiEvent(event);
    if (normalized) this.emit({ ref: execution.ref, event: normalized });
    if (event.type === "message_end") {
      const text = assistantText(event.message);
      if (text) execution.finalAnswer = text;
      await this.sessions.save({ id: execution.ref.sessionId, model: execution.model, messages: execution.agent.state.messages, finalAnswer: execution.finalAnswer, status: "running" });
    }
    if (event.type === "agent_end") {
      const error = execution.agent.state.errorMessage;
      await this.finish(execution, execution.interrupted ? "interrupted" : error ? "failed" : "completed", error);
    }
  }

  private async finish(execution: ActivePiExecution, status: "completed" | "failed" | "interrupted", error?: string): Promise<void> {
    if (this.active.get(execution.ref.sessionId) !== execution) return;
    this.active.delete(execution.ref.sessionId);
    await this.sessions.save({
      id: execution.ref.sessionId,
      model: execution.model,
      messages: execution.agent.state.messages,
      finalAnswer: execution.finalAnswer,
      status,
      error,
    });
    if (execution.finalAnswer) this.emit({ ref: execution.ref, event: { type: "assistant.message", text: execution.finalAnswer, final: true } });
    this.emit({
      ref: execution.ref,
      event: {
        type: "turn.completed",
        outcome: status,
        finalAnswer: execution.finalAnswer,
        error,
      },
    });
  }
}

function normalizePiEvent(event: AgentEvent): AgentRuntimeEvent | undefined {
  if (event.type === "message_end") {
    const text = assistantText(event.message);
    return text ? { type: "assistant.message", text, final: false } : undefined;
  }
  if (event.type === "tool_execution_start") return { type: "tool.started", callId: event.toolCallId, toolName: event.toolName };
  if (event.type === "tool_execution_end") return { type: "tool.completed", callId: event.toolCallId, toolName: event.toolName, success: !event.isError };
  return undefined;
}

function assistantText(message: AgentMessage): string | undefined {
  if (message.role !== "assistant") return undefined;
  const text = contentText(message.content).trim();
  return text || undefined;
}

function piThinkingLevel(effort: StartAgentExecution["effort"]): ThinkingLevel {
  return effort === "ultra" ? "max" : effort;
}
