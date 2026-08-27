import type { FastifyInstance, FastifyReply } from "fastify";
import type { AgentApprovalDecision, UpdateAgentGlobalSettings } from "@the-way-here/shared";
import { RunCoordinator, RunRequestError, type StartRunInput } from "../runtime/run-coordinator.js";

export function registerRunRoutes(app: FastifyInstance, runs: RunCoordinator): void {
  app.get("/api/runs", async () => runs.list());
  app.get("/api/agent-runtimes", async () => runs.runtimeCatalog());
  app.get("/api/agent-models", async () => runs.models());
  app.get("/api/agent-provider-presets", async () => runs.providerPresets());
  app.get("/api/agent-settings", async () => runs.agentSettings());
  app.put<{ Body: UpdateAgentGlobalSettings }>("/api/agent-settings", async (request, reply) => handleRun(reply, () => runs.updateAgentSettings(request.body)));
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => (await runs.get(request.params.id)) || reply.code(404).send({ error: "任务不存在" }));
  app.post<{ Body: StartRunInput }>("/api/runs", async (request, reply) => handleRun(reply, () => runs.start(request.body || {}), 202));
  app.post<{ Params: { id: string }; Body: { prompt?: string } }>("/api/runs/:id/steer", async (request, reply) => handleRun(reply, () => runs.steer(request.params.id, request.body?.prompt)));
  app.post<{ Params: { id: string } }>("/api/runs/:id/interrupt", async (request, reply) => handleRun(reply, () => runs.interrupt(request.params.id)));
  app.post<{ Params: { id: string }; Body: { requestId: string | number; decision: AgentApprovalDecision } }>("/api/runs/:id/approval", async (request, reply) => handleRun(reply, () => runs.approve(request.params.id, request.body?.requestId, request.body?.decision)));
}

async function handleRun<T>(reply: FastifyReply, action: () => Promise<T>, successCode = 200): Promise<T | FastifyReply> {
  try {
    const result = await action();
    return successCode === 200 ? result : reply.code(successCode).send(result);
  } catch (error) {
    if (error instanceof RunRequestError) return reply.code(error.statusCode).send(error.payload || { error: error.message });
    throw error;
  }
}
