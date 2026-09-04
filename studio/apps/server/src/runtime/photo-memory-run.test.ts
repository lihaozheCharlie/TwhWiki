import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { AgentRuntimeEvent, PhotoMemoryOutputTarget, WikiRun } from "@the-way-here/shared";
import { stateRootForVault } from "@the-way-here/run-manager";
import { PhotoMemoryStore } from "../modules/imports/photo-memory-store.js";
import { KnowledgeRuntime } from "./knowledge-runtime.js";
import { RunCoordinator } from "./run-coordinator.js";
import type { AgentRuntimeProvider } from "./agent-runtime/registry.js";
import type { AgentRuntimeEnvelope, StartAgentExecution } from "./agent-runtime/types.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture(vision = true) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-photo-run-")));
  await writeFile(path.join(root, "the-way-here.config.yaml"), "version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    paths:\n      wiki: demo/wiki\n      sources: demo/sources\n  other:\n    paths:\n      wiki: other/wiki\n      sources: other/sources\n");
  const knowledge = await KnowledgeRuntime.create(root, "demo");
  let listener: (event: AgentRuntimeEnvelope) => void;
  let sequence = 0;
  const start = vi.fn(async (input: StartAgentExecution) => ({ runtimeId: "codex" as const, sessionId: input.sessionId || `session-${++sequence}`, turnId: `turn-${sequence}` }));
  const provider = {
    subscribe: (cb: typeof listener) => { listener = cb; return () => undefined; },
    resolve: vi.fn(async () => ({ runtimeId: "codex", runtime: { start }, model: { id: "test-model", inputModalities: vision ? ["text", "image"] : ["text"] }, effort: "high" })),
    close: vi.fn(),
  } as unknown as AgentRuntimeProvider;
  const coordinator = new RunCoordinator(knowledge, provider, { error: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger);
  cleanups.push(async () => { coordinator.close(); await knowledge.close(); await rm(root, { recursive: true, force: true }); await rm(stateRootForVault(root), { recursive: true, force: true }); });
  const store = new PhotoMemoryStore(root);
  const content = (await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer()).toString("base64");
  const batch = await store.create(knowledge.index.config, { title: "匿名测试", files: [{ name: "demo.png", content, encoding: "base64" }] });
  await knowledge.rebuildIfActive("demo");
  const target: PhotoMemoryOutputTarget = { kind: "photo-memory", importId: batch.id, storedPath: batch.files[0]!.storedPath, phase: "analyze", label: "照片" };
  const emit = (run: WikiRun, event: AgentRuntimeEvent) => listener({ ref: { runtimeId: run.runtimeId!, sessionId: run.runtimeSessionId!, turnId: run.runtimeTurnId! }, event });
  return { root, coordinator, knowledge, store, target, start, emit };
}

describe("photo-memory runtime contract", () => {
  it("publishes an explicitly consented avatar only after the build run passes validation", async () => {
    const { root, coordinator, knowledge, store, target, emit } = await fixture();
    await store.update(knowledge.index.config, target.importId, { revision: 1, photoId: "photo-1", people: [{ id: "new-person", name: "匿名人物", useAsAvatar: true, box: { x: 0, y: 0, width: 1, height: 1 } }], story: "我与匿名人物的一次出游。" }, knowledge.index);
    const run = await coordinator.start({ mode: "write", knowledgeBaseId: "demo", prompt: "构建确认故事", sourceContext: { importId: target.importId, storedPath: target.storedPath, flow: "dialogue", operation: "build" } });
    const personPath = path.join(root, "demo/wiki/07 实体/人物/匿名人物.md");
    await mkdir(path.dirname(personPath), { recursive: true });
    await writeFile(personPath, "---\ntype: entity\n---\n# 匿名人物\n\n用户确认的匿名出游伙伴。\n");
    emit(run, { type: "turn.completed", outcome: "completed", finalAnswer: "已写入人物页" });
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
    const memory = await store.read(knowledge.index.config, target.importId);
    expect(memory.builtPeople).toEqual([expect.objectContaining({ personId: "new-person", avatar: true })]);
    expect(await sharp(await store.assetPath(knowledge.index.config, target.importId, "photo-1", "new-person")).metadata()).toMatchObject({ width: 256, height: 256 });
  });
  it("attaches server-resolved images and materializes structured output without editing Wiki", async () => {
    const { coordinator, knowledge, store, target, start, emit } = await fixture();
    const run = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "看图", outputTarget: target });
    expect(start.mock.calls[0]![0]).toMatchObject({ mode: "read", images: [{ path: expect.stringContaining("photo-1.jpg"), mimeType: "image/jpeg" }], config: { knowledgeBaseId: "demo" } });
    expect(run.outputTarget).toMatchObject({ expectedRevision: 1 });
    emit(run, { type: "turn.completed", outcome: "completed", finalAnswer: '你想从哪里讲起？<photo-memory>{"photos":[{"id":"photo-1","observation":"白色背景","question":"这张照片对你意味着什么？"}]}</photo-memory>' });
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
    expect((await coordinator.get(run.id))?.result?.finalAnswer).toBe("你想从哪里讲起？");
    expect((await store.read(knowledge.index.config, target.importId)).photos[0]?.observation).toBe("白色背景");
    expect(knowledge.index.list().filter((p) => !p.isSource)).toHaveLength(0);
  });

  it("blocks text-only models before starting a run or sending an image", async () => {
    const { coordinator, target, start } = await fixture(false);
    await expect(coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "看图", outputTarget: target })).rejects.toThrow("图片能力");
    expect(start).not.toHaveBeenCalled();
    expect(await coordinator.list()).toHaveLength(0);
  });

  it("keeps enrichment text-only, blocks unconfirmed builds and cross-library continuation", async () => {
    const { coordinator, knowledge, store, target, start, emit } = await fixture();
    await expect(coordinator.start({ mode: "write", knowledgeBaseId: "demo", prompt: "构建", sourceContext: { importId: target.importId, storedPath: target.storedPath, flow: "dialogue", operation: "build" } })).rejects.toThrow("确认");
    await expect(coordinator.start({ mode: "write", knowledgeBaseId: "demo", prompt: "看图", outputTarget: target })).rejects.toThrow("只保存草稿");
    const run = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "我想讲一次出游", outputTarget: { ...target, phase: "enrich" } });
    expect(start.mock.calls[0]![0].images).toBeUndefined();
    emit(run, { type: "turn.completed", outcome: "completed", finalAnswer: "<photo-memory>用户讲述了一次出游。</photo-memory>" });
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
    expect((await store.read(knowledge.index.config, target.importId)).confirmedAt).toBeUndefined();
    await expect(coordinator.start({ mode: "read", knowledgeBaseId: "other", prompt: "继续", sessionId: run.runtimeSessionId })).rejects.toThrow("跨知识库");
    expect(start).toHaveBeenCalledOnce();
  });
});
