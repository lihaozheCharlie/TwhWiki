import type { AgentApprovalDecision, AgentModelOption, AgentRuntimeEvent } from "@the-way-here/shared";
import { CodexAppServer, type CodexServerRequest } from "@the-way-here/codex-bridge";
import type { AgentExecutionRef, AgentRecoveryState, AgentRuntime, StartAgentExecution } from "./types.js";
import { RuntimeEventSource } from "./types.js";

const fallbackModel: AgentModelOption = {
  runtimeId: "codex",
  id: "gpt-5.6-sol",
  displayName: "GPT-5.6-Sol",
  supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
  defaultReasoningEffort: "high",
};

export class CodexRuntimeAdapter extends RuntimeEventSource implements AgentRuntime {
  readonly id = "codex" as const;
  private readonly codex: CodexAppServer;
  private readonly activeBySession = new Map<string, AgentExecutionRef>();

  constructor(private readonly command: string) {
    super();
    this.codex = new CodexAppServer(command);
    this.codex.on("notification", ({ method, params }) => this.onNotification(method, params));
    this.codex.on("request", (request: CodexServerRequest) => this.onRequest(request));
    this.codex.on("stderr", (message: string) => {
      for (const ref of this.activeBySession.values()) {
        this.emit({ ref, event: { type: "diagnostic", level: "warning", message } });
      }
    });
  }

  async inspect() {
    if (!CodexAppServer.isAvailable(this.command)) {
      return { id: this.id, displayName: "Codex", available: false, reason: "未找到 Codex 命令", models: [] };
    }
    try {
      const models = await this.codex.listModels();
      return { id: this.id, displayName: "Codex", available: true, models: models.length ? models : [fallbackModel] };
    } catch (error: any) {
      return { id: this.id, displayName: "Codex", available: false, reason: error.message || "Codex 初始化失败", models: [] };
    }
  }

  async start(input: StartAgentExecution): Promise<AgentExecutionRef> {
    const sessionId = input.sessionId || await this.codex.startThread(input.cwd, input.model);
    let turnId: string;
    try {
      turnId = await this.codex.startTurn(sessionId, input.prompt, input.cwd, { model: input.model, effort: input.effort });
    } catch (error) {
      if (!input.sessionId) throw error;
      await this.codex.resumeThread(sessionId, input.cwd);
      turnId = await this.codex.startTurn(sessionId, input.prompt, input.cwd, { model: input.model, effort: input.effort });
    }
    const ref = { runtimeId: this.id, sessionId, turnId } satisfies AgentExecutionRef;
    this.activeBySession.set(sessionId, ref);
    return ref;
  }

  async steer(ref: AgentExecutionRef, prompt: string): Promise<void> {
    await this.codex.steer(ref.sessionId, ref.turnId, prompt);
  }

  async interrupt(ref: AgentExecutionRef): Promise<void> {
    await this.codex.interrupt(ref.sessionId, ref.turnId);
  }

  async decide(_ref: AgentExecutionRef, approvalId: string | number, decision: AgentApprovalDecision): Promise<void> {
    const mapped = decision === "allow-once" ? "accept"
      : decision === "allow-for-session" ? "acceptForSession"
        : decision === "deny" ? "decline"
          : "cancel";
    this.codex.respondToServerRequest(approvalId, { decision: mapped });
  }

  async recover(ref: AgentExecutionRef): Promise<AgentRecoveryState> {
    try {
      const response = await this.codex.readThread(ref.sessionId);
      const thread = response?.thread || response;
      const turns: any[] = Array.isArray(thread?.turns) ? thread.turns : [];
      const turn = turns.find((entry) => entry.id === ref.turnId) || turns.at(-1);
      if (!turn) return { status: "missing" };
      if (turn.status === "completed") return { status: "completed", finalAnswer: finalAnswerOf(turn) };
      if (turn.status === "failed") return { status: "failed", error: turn.error?.message || turn.error };
      if (turn.status === "interrupted") return { status: "interrupted", error: turn.error?.message || turn.error };
      this.activeBySession.set(ref.sessionId, ref);
      return { status: "running" };
    } catch (error: any) {
      return { status: "missing", error: error.message };
    }
  }

  close(): void {
    this.codex.stop();
  }

  private onNotification(method: string, params: any): void {
    const sessionId = String(params?.threadId || params?.thread?.id || params?.turn?.threadId || "");
    const ref = this.activeBySession.get(sessionId);
    if (!ref || method.endsWith("/delta")) return;
    for (const event of codexEvents(method, params)) this.emit({ ref, event });
    if (method === "turn/completed") this.activeBySession.delete(sessionId);
  }

  private onRequest(request: CodexServerRequest): void {
    const sessionId = String(request.params?.threadId || (request.params as any)?.thread?.id || (request.params as any)?.turn?.threadId || "");
    const ref = this.activeBySession.get(sessionId);
    if (!ref) {
      this.codex.respondToServerRequest(request.id, { decision: "decline" });
      return;
    }
    const params = request.params || {};
    this.emit({
      ref,
      event: {
        type: "approval.requested",
        approval: {
          requestId: request.id,
          runtimeId: this.id,
          operation: String(request.method).includes("command") ? "command" : "tool",
          title: "Codex 请求执行操作",
          detail: String((params as any).reason || (params as any).command || request.method),
          method: request.method,
          params,
        },
      },
    });
  }
}

function finalAnswerOf(turn: any): string | undefined {
  return turn?.items?.slice?.().reverse().find((item: any) => item?.type === "agentMessage" && item?.phase === "final_answer")?.text;
}

function codexEvents(method: string, params: any): AgentRuntimeEvent[] {
  if (method === "turn/started") return [{ type: "turn.started", sessionId: String(params?.threadId || params?.turn?.threadId || ""), turnId: String(params?.turn?.id || "") }];
  if (method === "item/completed" && params?.item?.type === "agentMessage") {
    return [{ type: "assistant.message", text: String(params.item.text || ""), final: params.item.phase === "final_answer" }];
  }
  if (method === "item/started" && params?.item?.type === "commandExecution") {
    return [{ type: "tool.started", callId: String(params.item.id || params.item.command || "command"), toolName: "command", summary: params.item.command }];
  }
  if (method === "item/started" && params?.item?.type === "fileChange") {
    return [{ type: "tool.started", callId: String(params.item.id || "file-change"), toolName: "file-change", summary: "正在修改文件" }];
  }
  if (method === "item/completed" && ["commandExecution", "fileChange"].includes(params?.item?.type)) {
    return [{ type: "tool.completed", callId: String(params.item.id || params.item.command || params.item.type), toolName: params.item.type === "fileChange" ? "file-change" : "command", success: params.item.status === "completed" }];
  }
  if (method === "turn/completed") {
    const status = params?.turn?.status;
    return [{
      type: "turn.completed",
      outcome: status === "completed" ? "completed" : status === "interrupted" ? "interrupted" : "failed",
      finalAnswer: finalAnswerOf(params?.turn),
      error: params?.turn?.error?.message,
    }];
  }
  if (method === "error") return [{ type: "diagnostic", level: "error", message: params?.error?.message || "Codex 发生错误" }];
  return [];
}
