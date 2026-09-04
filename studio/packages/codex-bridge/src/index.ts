import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { realpathSync } from "node:fs";
import readline from "node:readline";
import type { AgentModelOption, AgentReasoningEffort } from "@the-way-here/shared";

interface RpcMessage {
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: { code?: number; message?: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface CodexServerRequest {
  id: number | string;
  method: string;
  params: Record<string, unknown>;
}

function resolveExecutable(command: string): string {
  try {
    if (command.includes("/") || command.includes("\\")) return realpathSync(command);
    const lookup = spawnSync(process.platform === "win32" ? "where" : "which", [command], { encoding: "utf8" });
    const located = lookup.status === 0 ? lookup.stdout.trim().split(/\r?\n/)[0] : undefined;
    return located ? realpathSync(located) : command;
  } catch {
    return command;
  }
}

export class CodexAppServer extends EventEmitter {
  private readonly command: string;
  private process?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private ready?: Promise<void>;

  constructor(command = "codex") {
    super();
    // Resolve symlinks so Codex can locate companion executables installed
    // beside the real binary (not beside a user-level symlink).
    this.command = resolveExecutable(command);
  }

  static isAvailable(command = "codex"): boolean {
    return spawnSync(resolveExecutable(command), ["--version"], { stdio: "ignore" }).status === 0;
  }

  async start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.initialize();
    return this.ready;
  }

  private async initialize(): Promise<void> {
    this.process = spawn(this.command, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const lines = readline.createInterface({ input: this.process.stdout });
    lines.on("line", (line) => this.handleLine(line));
    this.process.stderr.on("data", (chunk) => this.emit("stderr", chunk.toString()));
    this.process.on("exit", (code, signal) => {
      const error = new Error(`Codex app-server 已退出（code=${code ?? "null"}, signal=${signal ?? "null"}）`);
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      this.process = undefined;
      this.ready = undefined;
      this.emit("exit", { code, signal });
    });
    await this.request("initialize", {
      clientInfo: {
        name: "the_way_here",
        title: "the-way-here",
        version: "0.1.0",
      },
    });
    this.notify("initialized", {});
  }

  async request<T = any>(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    if (method !== "initialize") await this.start();
    if (!this.process) throw new Error("Codex app-server 尚未启动");
    const id = this.nextId++;
    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex 请求超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.process.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    return promise;
  }

  notify(method: string, params: Record<string, unknown>): void {
    if (!this.process) throw new Error("Codex app-server 尚未启动");
    this.process.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async listModels(): Promise<AgentModelOption[]> {
    const response = await this.request<{ data?: any[]; models?: any[] }>("model/list", {});
    const models = response.data || response.models || [];
    return models.map((model) => ({
      runtimeId: "codex" as const,
      id: String(model.id || model.model || model.slug),
      provider: "openai",
      providerDisplayName: "OpenAI",
      displayName: String(model.displayName || model.name || model.id || model.model),
      description: model.description ? String(model.description) : undefined,
      inputModalities: (Array.isArray(model.inputModalities) ? model.inputModalities.filter((value: string) => value === "text" || value === "image") : ["text", "image"]) as Array<"text" | "image">,
      supportedReasoningEfforts: (model.supportedReasoningEfforts || model.reasoningEfforts || []).map((entry: any) => String(entry.reasoningEffort || entry.effort || entry)) as AgentReasoningEffort[],
      defaultReasoningEffort: (model.defaultReasoningEffort || model.defaultEffort) as AgentReasoningEffort | undefined,
    })).filter((model) => model.id);
  }

  async readThread(threadId: string): Promise<any> {
    return this.request("thread/read", { threadId, includeTurns: true });
  }

  async startThread(cwd: string, model?: string): Promise<string> {
    const response = await this.request<{ thread: { id: string } }>("thread/start", { cwd, ...(model ? { model } : {}) });
    return response.thread.id;
  }

  async resumeThread(threadId: string, cwd: string): Promise<void> {
    await this.request("thread/resume", { threadId, cwd });
  }

  async startTurn(threadId: string, prompt: string, cwd: string, options: { model?: string; effort?: AgentReasoningEffort; imagePaths?: string[]; readOnly?: boolean } = {}): Promise<string> {
    const response = await this.request<{ turn: { id: string } }>("turn/start", {
      threadId,
      cwd,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      ...(options.readOnly ? { sandboxPolicy: { type: "readOnly" }, approvalPolicy: "never" } : {}),
      input: [{ type: "text", text: prompt }, ...(options.imagePaths || []).map((imagePath) => ({ type: "localImage", path: imagePath }))],
    });
    return response.turn.id;
  }

  async steer(threadId: string, turnId: string, prompt: string): Promise<void> {
    await this.request("turn/steer", {
      threadId,
      turnId,
      input: [{ type: "text", text: prompt }],
    });
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    await this.request("turn/interrupt", { threadId, turnId });
  }

  respondToServerRequest(requestId: number | string, result: Record<string, unknown>): void {
    if (!this.process) throw new Error("Codex app-server 尚未启动");
    this.process.stdin.write(`${JSON.stringify({ id: requestId, result })}\n`);
  }

  stop(): void {
    this.process?.kill("SIGTERM");
  }

  private handleLine(line: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit("protocolError", { line });
      return;
    }
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "Codex 请求失败"));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.emit("request", {
        id: message.id,
        method: message.method,
        params: message.params || {},
      } satisfies CodexServerRequest);
      return;
    }
    if (message.method) this.emit("notification", { method: message.method, params: message.params || {} });
  }
}
