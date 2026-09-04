import type { FastifyInstance, FastifyReply } from "fastify";
import type { AgentRuntimeDescriptor, PageCategory } from "@the-way-here/shared";
import { buildCards, buildFocusWorkspace, buildGraph, buildLetters, buildLifeMap, buildMentalModels, buildQuotes, buildRelationships, buildTimeline, buildToday } from "@the-way-here/life-views";
import { listBuildSkills } from "../modules/skills/skill-catalog.js";
import { listReasoningLenses } from "../modules/skills/lens-catalog.js";
import { readSkillFile, readSkillTree, SkillFileRequestError } from "../modules/skills/skill-files.js";
import { ContentRequestError, PageWriter } from "../modules/content/page-writer.js";
import { listSourceFolders } from "../modules/content/source-folder-catalog.js";
import { ImportRequestError, ImportStore } from "../modules/imports/import-store.js";
import { KnowledgeBaseRequestError } from "../modules/knowledge-bases/knowledge-base-manager.js";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { PhotoMemoryStore } from "../modules/imports/photo-memory-store.js";

export function registerContentRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, imports: ImportStore, runtimeCatalog: () => Promise<AgentRuntimeDescriptor[]>, hasActiveKnowledgeBaseRun: (knowledgeBaseId: string) => Promise<boolean>): void {
  const writer = new PageWriter(knowledge);
  app.get("/api/health", async () => ({ ok: true, vaultRoot: knowledge.vaultRoot, indexedAt: knowledge.index.lastIndexedAt }));
  app.get("/api/vault", async () => knowledge.vaultInfo(await runtimeCatalog()));
  app.post<{ Body: { name?: string } }>("/api/vault", async (request, reply) => {
    try {
      const created = await knowledge.createKnowledgeBase(request.body?.name);
      return reply.code(201).send({ ...created, knowledgeBaseId: created.id });
    } catch (error) {
      if (error instanceof KnowledgeBaseRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.delete<{ Params: { knowledgeBaseId: string } }>("/api/vault/:knowledgeBaseId", async (request, reply) => {
    try {
      if (await hasActiveKnowledgeBaseRun(request.params.knowledgeBaseId)) return reply.code(409).send({ error: "这个知识库还有 Agent 任务正在运行，请结束任务后再删除" });
      return await knowledge.deleteKnowledgeBase(request.params.knowledgeBaseId);
    } catch (error) {
      if (error instanceof KnowledgeBaseRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.post<{ Body: { knowledgeBaseId?: string } }>("/api/vault/select", async (request, reply) => {
    const nextId = request.body?.knowledgeBaseId?.trim();
    if (!nextId) return reply.code(400).send({ error: "请选择要打开的知识库" });
    try {
      await knowledge.activate(nextId);
      return { ok: true, knowledgeBaseId: knowledge.index.config.knowledgeBaseId };
    } catch (error: any) {
      return reply.code(404).send({ error: error.message || "知识库不存在" });
    }
  });

  app.get<{ Querystring: { category?: PageCategory; sources?: string } }>("/api/pages", async (request) => {
    const sources = request.query.sources === undefined ? undefined : request.query.sources === "true";
    return knowledge.index.list({ category: request.query.category, sources });
  });
  app.get<{ Params: { "*": string } }>("/api/pages/*", async (request, reply) => {
    const page = knowledge.index.get(decodeURIComponent(request.params["*"]));
    return page || reply.code(404).send({ error: "页面不存在" });
  });
  app.get<{ Querystring: { q?: string } }>("/api/search", async (request) => knowledge.index.search(request.query.q || ""));

  app.get("/api/sources/folders", async () => listSourceFolders(knowledge));
  app.post<{ Body: { title?: string; folder?: string } }>("/api/sources", async (request, reply) => handleContent(reply, async () => {
    const page = await writer.createSource(request.body?.title, request.body?.folder);
    if (page) await imports.trackCreatedSource(page);
    return page;
  }, 201));
  app.delete<{ Body: { pageId?: string; expectedModifiedAt?: string } }>("/api/sources/file", async (request, reply) => handleContent(reply, () => writer.deleteSource(request.body?.pageId, request.body?.expectedModifiedAt)));
  app.delete<{ Body: { folder?: string; expectedFileCount?: number } }>("/api/sources/folder", async (request, reply) => handleContent(reply, () => writer.deleteSourceFolder(request.body?.folder, request.body?.expectedFileCount)));
  app.post<{ Body: { pageId?: string } }>("/api/files/open-in-editor", async (request, reply) => handleContent(reply, () => writer.openInEditor(request.body?.pageId)));
  app.post<{ Body: { pageId?: string; fileName?: string; expectedModifiedAt?: string } }>("/api/pages/rename", async (request, reply) => handleContent(reply, () => writer.rename(request.body?.pageId, request.body?.fileName, request.body?.expectedModifiedAt)));
  app.put<{ Params: { "*": string }; Body: { markdown?: string; expectedModifiedAt?: string } }>("/api/pages/*", async (request, reply) => handleContent(reply, () => writer.save(decodeURIComponent(request.params["*"]), request.body?.markdown, request.body?.expectedModifiedAt)));

  app.get("/api/build/skills", async () => listBuildSkills(knowledge.vaultRoot, knowledge.index));
  app.get("/api/build/skill-tree", async () => readSkillTree(knowledge.vaultRoot, knowledge.index));
  app.get<{ Querystring: { path?: string } }>("/api/build/skill-file", async (request, reply) => {
    try {
      return await readSkillFile(knowledge.vaultRoot, knowledge.index, request.query.path || "");
    } catch (error) {
      if (error instanceof SkillFileRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get("/api/lenses", async () => listReasoningLenses(knowledge.vaultRoot, knowledge.index));
  app.get("/api/views/today", async () => buildToday(knowledge.index));
  app.get("/api/views/focus/:signalId", async (request, reply) => {
    const view = buildFocusWorkspace(knowledge.index, decodeURIComponent((request.params as { signalId: string }).signalId));
    return view || reply.code(404).send({ error: "当前没有可展开的状态问题" });
  });
  app.get("/api/views/timeline", async () => buildTimeline(knowledge.index));
  app.get("/api/views/life-map", async () => buildLifeMap(knowledge.index));
  app.get("/api/views/relationships", async () => {
    const index = knowledge.index;
    return new PhotoMemoryStore(knowledge.vaultRoot).decorate(index.config, buildRelationships(index), index);
  });
  app.get("/api/views/letters", async () => buildLetters(knowledge.index));
  app.get("/api/views/graph", async (request) => buildGraph(knowledge.index, 120, (request.query as { focus?: string }).focus));
  app.get("/api/views/mental-models", async (_request, reply) => buildMentalModels(knowledge.index) || reply.code(404).send({ error: "暂无思维模型页面" }));
  app.get("/api/views/quotes", async (_request, reply) => buildQuotes(knowledge.index) || reply.code(404).send({ error: "暂无金句页面" }));
  app.get<{ Params: { category: PageCategory } }>("/api/views/cards/:category", async (request) => buildCards(knowledge.index, request.params.category));
}

async function handleContent<T>(reply: FastifyReply, action: () => Promise<T>, successCode = 200): Promise<T | FastifyReply> {
  try {
    const result = await action();
    return successCode === 200 ? result : reply.code(successCode).send(result);
  } catch (error) {
    if (error instanceof ContentRequestError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof ImportRequestError) return reply.code(error.statusCode).send({ error: error.message });
    throw error;
  }
}
