import type {
  AgentApprovalDecision,
  AgentReasoningEffort,
  AgentRuntimeDescriptor,
  AgentRuntimeEvent,
  AgentRuntimeId,
  VaultConfig,
  WikiRun,
} from "@the-way-here/shared";

export interface AgentExecutionRef {
  runtimeId: AgentRuntimeId;
  sessionId: string;
  turnId: string;
}

export interface StartAgentExecution {
  cwd: string;
  prompt: string;
  model: string;
  effort: AgentReasoningEffort;
  mode: Exclude<WikiRun["mode"], "validate">;
  config: VaultConfig;
  sessionId?: string;
}

export interface AgentRuntimeEnvelope {
  ref: AgentExecutionRef;
  event: AgentRuntimeEvent;
}

export interface AgentRecoveryState {
  status: "running" | "completed" | "failed" | "interrupted" | "missing";
  finalAnswer?: string;
  error?: string;
}

export interface AgentRuntime {
  readonly id: AgentRuntimeId;
  inspect(): Promise<AgentRuntimeDescriptor>;
  start(input: StartAgentExecution): Promise<AgentExecutionRef>;
  steer(ref: AgentExecutionRef, prompt: string): Promise<void>;
  interrupt(ref: AgentExecutionRef): Promise<void>;
  decide(ref: AgentExecutionRef, approvalId: string | number, decision: AgentApprovalDecision): Promise<void>;
  recover(ref: AgentExecutionRef): Promise<AgentRecoveryState>;
  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void;
  close(): void;
}

export abstract class RuntimeEventSource {
  private readonly listeners = new Set<(envelope: AgentRuntimeEnvelope) => void>();

  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(envelope: AgentRuntimeEnvelope): void {
    for (const listener of this.listeners) listener(envelope);
  }
}
