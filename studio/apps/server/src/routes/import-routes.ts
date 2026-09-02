import type { FastifyInstance } from "fastify";
import type { SourceImportChannel, SourceImportFile } from "@the-way-here/shared";
import { ImportRequestError, ImportStore } from "../modules/imports/import-store.js";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { RunCoordinator } from "../runtime/run-coordinator.js";

export function registerImportRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, runs: RunCoordinator): void {
  const imports = new ImportStore(knowledge);
  app.get("/api/imports", async () => imports.list(await runs.list()));
  app.post<{ Body: { files?: SourceImportFile[]; channel?: SourceImportChannel; targetFolder?: string } }>("/api/imports/files", { bodyLimit: 145 * 1024 * 1024 }, async (request, reply) => {
    try {
      return reply.code(201).send(await imports.create(request.body || {}));
    } catch (error) {
      if (error instanceof ImportRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.patch<{ Params: { id: string }; Body: { storedPath?: string; status?: "deferred" } }>("/api/imports/:id/build-status", async (request, reply) => {
    try {
      const { storedPath, status } = request.body || {};
      if (typeof storedPath !== "string" || !storedPath.trim()) return reply.code(400).send({ error: "请选择需要更新的生活记录" });
      if (status !== "deferred") return reply.code(400).send({ error: "这里只能记住稍后处理的选择" });
      return await imports.updateBuildStatus(request.params.id, storedPath, status);
    } catch (error) {
      if (error instanceof ImportRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
