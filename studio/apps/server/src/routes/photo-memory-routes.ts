import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { PhotoMemoryError, PhotoMemoryStore } from "../modules/imports/photo-memory-store.js";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { RunCoordinator } from "../runtime/run-coordinator.js";

export function registerPhotoMemoryRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, runs: RunCoordinator): void {
  const store = new PhotoMemoryStore(knowledge.vaultRoot);
  async function resolve(id: unknown) {
    if (typeof id !== "string" || !id.trim()) throw new PhotoMemoryError(400, "请指定照片所属知识库");
    return knowledge.resolve(id);
  }
  app.post<{ Body: any }>("/api/imports/photos", { bodyLimit: 145 * 1024 * 1024 }, async (request, reply) => {
    try {
      const { config } = await resolve((request.body as any)?.knowledgeBaseId);
      const batch = await store.create(config, request.body);
      await knowledge.rebuildIfActive(config.knowledgeBaseId);
      knowledge.events.broadcast("index", { knowledgeBaseId: config.knowledgeBaseId, importId: batch.id });
      return reply.code(201).send(batch);
    } catch (error: any) { return reply.code(error instanceof PhotoMemoryError ? error.statusCode : 400).send({ error: error.message }); }
  });
  app.get<{ Params: { id: string }; Querystring: { knowledgeBaseId?: string } }>("/api/photo-memories/:id", async (request, reply) => {
    try {
      const { config } = await resolve(request.query.knowledgeBaseId);
      return await store.read(config, request.params.id);
    } catch (error: any) { return reply.code(error instanceof PhotoMemoryError ? error.statusCode : 404).send({ error: error.message }); }
  });
  app.patch<{ Params: { id: string }; Body: any }>("/api/photo-memories/:id", async (request, reply) => {
    try {
      const { config, index } = await resolve((request.body as any)?.knowledgeBaseId);
      if (await runs.hasActiveKnowledgeBaseRun(config.knowledgeBaseId)) throw new PhotoMemoryError(409, "请等当前任务完成，再修改照片记忆");
      const memory = await store.update(config, request.params.id, request.body, index);
      await knowledge.rebuildIfActive(config.knowledgeBaseId);
      knowledge.events.broadcast("index", { knowledgeBaseId: config.knowledgeBaseId, importId: memory.id });
      return memory;
    } catch (error: any) { return reply.code(error instanceof PhotoMemoryError ? error.statusCode : 400).send({ error: error.message }); }
  });
  app.get<{ Params: { id: string; photoId: string; variant: string }; Querystring: { knowledgeBaseId?: string } }>("/api/photo-memories/:id/assets/:photoId/:variant", async (request, reply) => {
    try {
      const { config } = await resolve(request.query.knowledgeBaseId);
      const file = await store.assetPath(config, request.params.id, request.params.photoId, request.params.variant);
      if (request.params.variant === "original") {
        const memory = await store.read(config, request.params.id);
        const name = memory.photos.find((photo) => photo.id === request.params.photoId)!.name;
        return reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`).type("application/octet-stream").send(await readFile(file));
      }
      return reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").type("image/jpeg").send(await readFile(file));
    } catch (error: any) { return reply.code(error instanceof PhotoMemoryError ? error.statusCode : 404).send({ error: "照片不存在或已移除" }); }
  });
}
