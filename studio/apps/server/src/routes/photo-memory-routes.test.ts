import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { RunCoordinator } from "../runtime/run-coordinator.js";
import { registerPhotoMemoryRoutes } from "./photo-memory-routes.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanups.splice(0)) await fn(); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-photo-http-")));
  const knowledge = await KnowledgeRuntime.create(root, undefined);
  const app = Fastify();
  const hasActiveKnowledgeBaseRun = vi.fn(async () => false);
  registerPhotoMemoryRoutes(app, knowledge, { hasActiveKnowledgeBaseRun } as unknown as RunCoordinator);
  cleanups.push(async () => { await app.close(); await knowledge.close(); await rm(root, { recursive: true, force: true }); });
  const bytes = await sharp({ create: { width: 10, height: 12, channels: 3, background: "white" } }).png().toBuffer();
  const payload = { knowledgeBaseId: "default", files: [{ name: "测试.png", encoding: "base64", content: bytes.toString("base64") }] };
  return { app, payload, bytes, hasActiveKnowledgeBaseRun };
}

describe("photo-memory HTTP boundaries", () => {
  it("requires a bound knowledge base and serves only scoped images with private cache policy", async () => {
    const { app, payload, bytes } = await fixture();
    expect((await app.inject({ method: "POST", url: "/api/imports/photos", payload: { files: payload.files } })).statusCode).toBe(400);
    const created = await app.inject({ method: "POST", url: "/api/imports/photos", payload });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await app.inject(`/api/photo-memories/${id}`)).statusCode).toBe(400);
    const base = `/api/photo-memories/${id}/assets/photo-1`;
    const preview = await app.inject(`${base}/preview?knowledgeBaseId=default`);
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["cache-control"]).toBe("private, no-store");
    expect(preview.headers["content-type"]).toContain("image/jpeg");
    const original = await app.inject(`${base}/original?knowledgeBaseId=default`);
    expect(original.rawPayload).toEqual(bytes);
    expect(original.headers["content-disposition"]).toContain("attachment;");
    expect((await app.inject(`${base}/unpublished-avatar?knowledgeBaseId=default`)).statusCode).toBe(404);
  });

  it("rejects edits during an active run and rejects stale revision numbers", async () => {
    const { app, payload, hasActiveKnowledgeBaseRun } = await fixture();
    const created = await app.inject({ method: "POST", url: "/api/imports/photos", payload });
    const url = `/api/photo-memories/${created.json().id}`;
    hasActiveKnowledgeBaseRun.mockResolvedValueOnce(true);
    const edit = { knowledgeBaseId: "default", revision: 1, story: "用户确认的故事" };
    expect((await app.inject({ method: "PATCH", url, payload: edit })).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url, payload: edit })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url, payload: edit })).statusCode).toBe(409);
  });
});
