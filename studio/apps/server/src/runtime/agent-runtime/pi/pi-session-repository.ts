import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { stateRootForVault } from "@the-way-here/run-manager";

export interface PiSessionRecord {
  id: string;
  model: string;
  messages: AgentMessage[];
  finalAnswer?: string;
  status: "running" | "completed" | "failed" | "interrupted";
  error?: string;
  updatedAt: string;
}

export class PiSessionRepository {
  private readonly root: string;

  constructor(vaultRoot: string, stateRoot = stateRootForVault(vaultRoot)) {
    this.root = path.join(stateRoot, "agent-sessions", "pi");
  }

  async load(id: string): Promise<PiSessionRecord | undefined> {
    try {
      return JSON.parse(await readFile(this.file(id), "utf8")) as PiSessionRecord;
    } catch (error: any) {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(record: Omit<PiSessionRecord, "updatedAt">): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const target = this.file(record.id);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ ...record, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  private file(id: string): string {
    if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error("Pi 会话 ID 无效");
    return path.join(this.root, `${id}.json`);
  }
}
