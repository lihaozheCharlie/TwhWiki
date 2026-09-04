import { createHash, randomUUID } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import { createTwoFilesPatch } from "diff";
import type { ApprovalRequest, RunEvent, RunFileChange, RunStatus, VaultConfig, WikiRun } from "@the-way-here/shared";

interface SnapshotManifest {
  files: Record<string, { sha256: string; size: number }>;
}

function appStateRoot(): string {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "the-way-here");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "the-way-here");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "the-way-here");
}

export function stateRootForVault(vaultRoot: string): string {
  const key = createHash("sha256").update(path.resolve(vaultRoot)).digest("hex").slice(0, 16);
  return path.join(appStateRoot(), "vaults", key);
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

function parseRecoverableJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (originalError) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let started = false;
    for (let index = 0; index < raw.length; index += 1) {
      const character = raw[index]!;
      if (!started) {
        if (character !== "{") continue;
        started = true;
        depth = 1;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return JSON.parse(raw.slice(raw.indexOf("{"), index + 1)) as T;
      }
    }
    throw originalError;
  }
}

function normalizeLegacyRun(run: WikiRun): WikiRun {
  const legacy = run as WikiRun & { threadId?: string; turnId?: string };
  return {
    ...run,
    runtimeId: run.runtimeId || (legacy.threadId ? "codex" : undefined),
    runtimeSessionId: run.runtimeSessionId || legacy.threadId,
    runtimeTurnId: run.runtimeTurnId || legacy.turnId,
    approvals: (run.approvals || []).map((approval) => approval.runtimeId ? approval : {
      ...approval,
      runtimeId: "codex",
      operation: String(approval.method || "").includes("command") ? "command" : "tool",
      title: "Codex 请求执行操作",
      detail: String(approval.params?.reason || approval.params?.command || approval.method || "需要确认的操作"),
    }),
  };
}

async function hashFile(filePath: string): Promise<{ sha256: string; size: number }> {
  const content = await readFile(filePath);
  return { sha256: createHash("sha256").update(content).digest("hex"), size: content.length };
}

function snapshotPatterns(config: VaultConfig): string[] {
  return [
    config.paths.agentInstructions,
    `${config.paths.wiki}/**/*`,
    `${config.paths.skills}/**/*`,
    `${config.paths.tools}/**/*`,
    `${config.paths.sources}/**/*`,
  ];
}

export class RunStore {
  readonly vaultRoot: string;
  readonly stateRoot: string;
  private readonly activeWriteRuns = new Map<string, string>();
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly legacyStateRoots: string[];
  private legacyMigration?: Promise<void>;

  constructor(vaultRoot: string, stateRoot = stateRootForVault(vaultRoot), legacyVaultRoots: string[] = []) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.stateRoot = path.resolve(stateRoot);
    this.legacyStateRoots = legacyVaultRoots.map(stateRootForVault).filter((root) => path.resolve(root) !== this.stateRoot);
  }

  async create(
    title: string,
    prompt: string,
    mode: WikiRun["mode"],
    knowledgeBaseId: string,
    configSnapshot: VaultConfig,
    options: Partial<Pick<WikiRun, "displayPrompt" | "runtimeId" | "runtimeSessionId" | "runtimeTurnId" | "provider" | "model" | "effort" | "outputTarget" | "sourceContext" | "contextPageId">> = {},
  ): Promise<WikiRun> {
    const mayWrite = mode === "write" || mode === "auto";
    if (mayWrite && !this.activeWriteRuns.has(knowledgeBaseId)) {
      const active = (await this.list()).find((run) => (run.mode === "write" || run.mode === "auto")
        && run.knowledgeBaseId === knowledgeBaseId
        && !["completed", "failed", "interrupted"].includes(run.status));
      if (active) this.activeWriteRuns.set(knowledgeBaseId, active.id);
    }
    if (mayWrite && this.activeWriteRuns.has(knowledgeBaseId)) {
      throw new Error(`知识库 ${knowledgeBaseId} 已有一个 Wiki 写入任务正在运行`);
    }
    const now = new Date().toISOString();
    const run: WikiRun = {
      id: randomUUID(),
      knowledgeBaseId,
      configSnapshot,
      title,
      prompt,
      ...options,
      mode,
      status: "preparing",
      createdAt: now,
      updatedAt: now,
      events: [],
      approvals: [],
      changes: [],
    };
    if (mayWrite) this.activeWriteRuns.set(knowledgeBaseId, run.id);
    await this.save(run);
    return run;
  }

  async list(): Promise<WikiRun[]> {
    await this.ensureLegacyRunsMigrated();
    const runsDir = path.join(this.stateRoot, "runs");
    let entries: string[] = [];
    try {
      entries = await readdir(runsDir);
    } catch {
      return [];
    }
    const runs = await Promise.all(entries.map(async (entry) => {
      try {
        return normalizeLegacyRun(parseRecoverableJson<WikiRun>(await readFile(path.join(runsDir, entry, "run.json"), "utf8")));
      } catch {
        return undefined;
      }
    }));
    return runs.filter((run): run is WikiRun => Boolean(run)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<WikiRun | undefined> {
    await this.ensureLegacyRunsMigrated();
    try {
      return normalizeLegacyRun(parseRecoverableJson<WikiRun>(await readFile(this.runFile(id), "utf8")));
    } catch {
      return undefined;
    }
  }

  async update(id: string, patch: Partial<WikiRun>): Promise<WikiRun> {
    return this.mutate(id, (run) => ({ ...run, ...patch, id: run.id }));
  }

  async addEvent(id: string, event: Omit<RunEvent, "id" | "at">): Promise<WikiRun> {
    return this.mutate(id, (run) => ({ ...run, events: [...run.events, { id: randomUUID(), at: new Date().toISOString(), ...event }] }));
  }

  async addApproval(id: string, approval: ApprovalRequest): Promise<WikiRun> {
    return this.mutate(id, (run) => ({
      ...run,
      approvals: [...run.approvals.filter((item) => item.requestId !== approval.requestId), approval],
      status: "waiting-approval",
    }));
  }

  async resolveApproval(id: string, requestId: string | number): Promise<WikiRun> {
    return this.mutate(id, (run) => {
      const approvals = run.approvals.filter((item) => String(item.requestId) !== String(requestId));
      return { ...run, approvals, status: !approvals.length && run.status === "waiting-approval" ? "running" : run.status };
    });
  }

  async snapshot(id: string, config: VaultConfig): Promise<void> {
    const files = await fg(snapshotPatterns(config), {
      cwd: this.vaultRoot,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: false,
    });
    const manifest: SnapshotManifest = { files: {} };
    for (const relativePath of files.sort()) {
      const source = path.join(this.vaultRoot, relativePath);
      const destination = path.join(this.runDir(id), "before", relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
      manifest.files[relativePath] = await hashFile(source);
    }
    await atomicWriteJson(path.join(this.runDir(id), "manifest.json"), manifest);
  }

  async collectChanges(id: string, config: VaultConfig): Promise<RunFileChange[]> {
    const manifest = JSON.parse(await readFile(path.join(this.runDir(id), "manifest.json"), "utf8")) as SnapshotManifest;
    const currentFiles = await fg(snapshotPatterns(config), {
      cwd: this.vaultRoot,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: false,
    });
    const current = new Set(currentFiles);
    const paths = new Set([...Object.keys(manifest.files), ...currentFiles]);
    const changes: RunFileChange[] = [];
    for (const relativePath of [...paths].sort()) {
      const beforeMeta = manifest.files[relativePath];
      const afterExists = current.has(relativePath);
      if (!beforeMeta && afterExists) {
        changes.push({ path: relativePath, kind: "added", diff: await this.createDiff(id, relativePath, false, true) });
      } else if (beforeMeta && !afterExists) {
        changes.push({ path: relativePath, kind: "deleted", diff: await this.createDiff(id, relativePath, true, false) });
      } else if (beforeMeta && afterExists) {
        const afterMeta = await hashFile(path.join(this.vaultRoot, relativePath));
        if (afterMeta.sha256 !== beforeMeta.sha256) {
          changes.push({ path: relativePath, kind: "modified", diff: await this.createDiff(id, relativePath, true, true) });
        }
      }
    }
    await this.update(id, { changes });
    return changes;
  }

  async restoreFile(id: string, relativePath: string): Promise<void> {
    const safe = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const before = path.resolve(this.runDir(id), "before", safe);
    const target = path.resolve(this.vaultRoot, safe);
    if (!target.startsWith(`${this.vaultRoot}${path.sep}`)) throw new Error("文件路径超出 Vault");
    await stat(before);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(before, target);
  }

  async setStatus(id: string, status: RunStatus, error?: string): Promise<WikiRun> {
    return this.update(id, { status, error });
  }

  async isLegacyWorkspaceRun(id: string): Promise<boolean> {
    await this.ensureLegacyRunsMigrated();
    try {
      await stat(path.join(this.runDir(id), ".legacy-workspace"));
      return true;
    } catch {
      return false;
    }
  }

  private async createDiff(id: string, relativePath: string, hasBefore: boolean, hasAfter: boolean): Promise<string | undefined> {
    if (!/\.(md|txt|json|ya?ml|ts|tsx|js|jsx|py)$/i.test(relativePath)) return undefined;
    const beforePath = path.join(this.runDir(id), "before", relativePath);
    const afterPath = path.join(this.vaultRoot, relativePath);
    const before = hasBefore ? await readFile(beforePath, "utf8") : "";
    const after = hasAfter ? await readFile(afterPath, "utf8") : "";
    if (before.length + after.length > 2_000_000) return "文件较大，已省略文本差异。";
    return createTwoFilesPatch(`before/${relativePath}`, `after/${relativePath}`, before, after, "任务开始", "任务结束");
  }

  private runDir(id: string): string {
    if (!/^[a-f0-9-]+$/i.test(id)) throw new Error("无效任务 ID");
    return path.join(this.stateRoot, "runs", id);
  }

  private runFile(id: string): string {
    return path.join(this.runDir(id), "run.json");
  }

  private async require(id: string): Promise<WikiRun> {
    const run = await this.get(id);
    if (!run) throw new Error("任务不存在");
    return run;
  }

  private async mutate(id: string, mutation: (run: WikiRun) => WikiRun): Promise<WikiRun> {
    const previous = this.mutationQueues.get(id) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.mutationQueues.set(id, queued);
    await previous;
    try {
      const run = await this.require(id);
      const updated = mutation(run);
      updated.updatedAt = new Date().toISOString();
      if (["completed", "failed", "interrupted"].includes(updated.status)
        && this.activeWriteRuns.get(updated.knowledgeBaseId) === id) {
        this.activeWriteRuns.delete(updated.knowledgeBaseId);
      }
      await this.save(updated);
      return updated;
    } finally {
      release();
      if (this.mutationQueues.get(id) === queued) this.mutationQueues.delete(id);
    }
  }

  private async save(run: WikiRun): Promise<void> {
    await atomicWriteJson(this.runFile(run.id), run);
  }

  private async ensureLegacyRunsMigrated(): Promise<void> {
    if (this.legacyMigration) return this.legacyMigration;
    this.legacyMigration = (async () => {
      for (const legacyRoot of this.legacyStateRoots) {
        const sourceRuns = path.join(legacyRoot, "runs");
        let entries: string[];
        try {
          entries = await readdir(sourceRuns);
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!/^[a-f0-9-]+$/i.test(entry)) continue;
          const source = path.join(sourceRuns, entry);
          const destination = path.join(this.stateRoot, "runs", entry);
          try {
            await stat(destination);
          } catch {
            await mkdir(path.dirname(destination), { recursive: true });
            await cp(source, destination, { recursive: true, errorOnExist: false });
          }
          await writeFile(path.join(destination, ".legacy-workspace"), `${legacyRoot}\n`, "utf8");
        }
      }
    })();
    return this.legacyMigration;
  }
}
