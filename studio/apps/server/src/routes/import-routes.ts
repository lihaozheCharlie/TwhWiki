import type { FastifyInstance } from "fastify";
import type { SourceImportChannel, SourceImportFile } from "@the-way-here/shared";
import { ImportRequestError, ImportStore } from "../modules/imports/import-store.js";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";

export function registerImportRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime): void {
  const imports = new ImportStore(knowledge);
  app.get("/api/imports", async () => imports.list());
  app.post<{ Body: { files?: SourceImportFile[]; channel?: SourceImportChannel; targetFolder?: string } }>("/api/imports/files", { bodyLimit: 145 * 1024 * 1024 }, async (request, reply) => {
    try {
      return reply.code(201).send(await imports.create(request.body || {}));
    } catch (error) {
      if (error instanceof ImportRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
