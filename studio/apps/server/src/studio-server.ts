import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { registerContentRoutes } from "./routes/content-routes.js";
import { registerImportRoutes } from "./routes/import-routes.js";
import { registerRunRoutes } from "./routes/run-routes.js";
import { registerPhotoMemoryRoutes } from "./routes/photo-memory-routes.js";
import { ImportStore } from "./modules/imports/import-store.js";
import { AgentRuntimeRegistry } from "./runtime/agent-runtime/registry.js";
import { KnowledgeRuntime } from "./runtime/knowledge-runtime.js";
import { RunCoordinator } from "./runtime/run-coordinator.js";

export type StudioServerOptions = {
  vaultRoot: string;
  knowledgeBaseId?: string;
  development?: boolean;
};

export class StudioServer {
  private constructor(
    readonly app: FastifyInstance,
    private readonly knowledge: KnowledgeRuntime,
    private readonly runs: RunCoordinator,
  ) {}

  static async create(options: StudioServerOptions): Promise<StudioServer> {
    const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
    const knowledge = await KnowledgeRuntime.create(options.vaultRoot, options.knowledgeBaseId);
    const runtimes = await AgentRuntimeRegistry.create(knowledge.index.config.agents, knowledge.vaultRoot);
    const runs = new RunCoordinator(knowledge, runtimes, app.log);
    const imports = new ImportStore(knowledge);
    registerContentRoutes(app, knowledge, imports, () => runs.runtimeCatalog(), (knowledgeBaseId) => runs.hasActiveKnowledgeBaseRun(knowledgeBaseId));
    registerImportRoutes(app, imports, runs);
    registerRunRoutes(app, runs);
    registerPhotoMemoryRoutes(app, knowledge, runs);
    app.get("/api/events", async (request, reply) => knowledge.events.connect(request, reply));

    if (!options.development) {
      const serverDir = path.dirname(fileURLToPath(import.meta.url));
      await app.register(fastifyStatic, { root: path.resolve(serverDir, "../../web/dist"), prefix: "/" });
      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "接口不存在" });
        return reply.sendFile("index.html");
      });
    }
    await runs.reconcile();
    return new StudioServer(app, knowledge, runs);
  }

  async listen(host: string, port: number): Promise<void> {
    await this.app.listen({ host, port });
    this.app.log.info(`The Way Here: http://${host}:${port}`);
    this.app.log.info(`Vault: ${this.knowledge.vaultRoot}`);
  }

  async close(): Promise<void> {
    this.runs.close();
    await this.knowledge.close();
    await this.app.close();
  }
}
