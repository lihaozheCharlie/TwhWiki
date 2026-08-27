import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunStore } from "./index";
import type { VaultConfig } from "@the-way-here/shared";

const temporaryRoots: string[] = [];
const config = (knowledgeBaseId: string): VaultConfig => ({
  version: 3,
  name: knowledgeBaseId,
  knowledgeBaseId,
  knowledgeBases: [{ id: knowledgeBaseId, name: knowledgeBaseId }],
  adapter: "personal-growth",
  paths: { wiki: `vault/${knowledgeBaseId}/wiki`, sources: `vault/${knowledgeBaseId}/sources`, skills: "knowledge-engine/skills", tools: "knowledge-engine/tools", agentInstructions: "AGENTS.md" },
  views: {},
  agents: { defaultRuntime: "auto", runtimes: { codex: { enabled: true, command: "codex", transport: "stdio" }, pi: { enabled: true, providers: [] } } },
  validation: { commands: [] },
});

async function storeFixture(): Promise<{ store: RunStore; stateRoot: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-run-store-"));
  temporaryRoots.push(root);
  return { store: new RunStore(path.join(root, "workspace"), path.join(root, "state")), stateRoot: path.join(root, "state") };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RunStore", () => {
  it("serializes concurrent event writes without losing records", async () => {
    const { store } = await storeFixture();
    const run = await store.create("并发任务", "测试", "read", "personal", config("personal"));
    await Promise.all(Array.from({ length: 80 }, (_, index) => store.addEvent(run.id, { kind: "codex", message: `event-${index}` })));
    const restored = await store.get(run.id);
    expect(restored?.events).toHaveLength(80);
    expect(new Set(restored?.events.map((event) => event.message)).size).toBe(80);
  });

  it("recovers the first complete object from an older corrupted run file", async () => {
    const { store, stateRoot } = await storeFixture();
    const run = await store.create("可恢复任务", "测试", "read", "personal", config("personal"));
    const runFile = path.join(stateRoot, "runs", run.id, "run.json");
    await appendFile(runFile, '{"overlapping":"legacy temp write"}', "utf8");
    const corrupted = await readFile(runFile, "utf8");
    expect(() => JSON.parse(corrupted)).toThrow();
    expect((await store.get(run.id))?.id).toBe(run.id);
    await store.setStatus(run.id, "completed");
    expect(JSON.parse(await readFile(runFile, "utf8")).status).toBe("completed");
  });

  it("maps legacy Codex thread fields into the runtime-neutral session fields", async () => {
    const { store, stateRoot } = await storeFixture();
    const runDirectory = path.join(stateRoot, "runs", "deadbeef-1234");
    await mkdir(runDirectory, { recursive: true });
    await writeFile(path.join(runDirectory, "run.json"), JSON.stringify({
      id: "deadbeef-1234",
      knowledgeBaseId: "demo",
      configSnapshot: config("demo"),
      title: "匿名演示历史任务",
      prompt: "解释匿名演示知识",
      threadId: "thread-123",
      turnId: "turn-456",
      mode: "read",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      events: [],
      approvals: [{ requestId: 7, method: "command/approval", params: { command: "safe command" } }],
      changes: [],
    }), "utf8");
    await expect(store.get("deadbeef-1234")).resolves.toMatchObject({
      runtimeId: "codex",
      runtimeSessionId: "thread-123",
      runtimeTurnId: "turn-456",
      approvals: [{ runtimeId: "codex", operation: "command", title: "Codex 请求执行操作" }],
    });
  });

  it("serializes writes per knowledge base without blocking isolated libraries", async () => {
    const { store } = await storeFixture();
    const personal = await store.create("个人库写入", "测试", "write", "personal", config("personal"));
    const demo = await store.create("演示库写入", "测试", "write", "demo", config("demo"));
    await expect(store.create("重复个人库写入", "测试", "write", "personal", config("personal"))).rejects.toThrow("personal");
    await expect(store.create("自动识别任务", "测试", "auto", "personal", config("personal"))).rejects.toThrow("personal");
    await store.setStatus(personal.id, "completed");
    const automatic = await store.create("后续自动任务", "测试", "auto", "personal", config("personal"));
    await expect(store.create("自动任务期间写入", "测试", "write", "personal", config("personal"))).rejects.toThrow("personal");
    await store.setStatus(automatic.id, "completed");
    await expect(store.create("后续个人库写入", "测试", "write", "personal", config("personal"))).resolves.toMatchObject({ knowledgeBaseId: "personal" });
    await store.setStatus(demo.id, "completed");
  });
});
