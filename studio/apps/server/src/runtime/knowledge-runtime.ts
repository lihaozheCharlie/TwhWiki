import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { WikiIndex } from "@the-way-here/wiki-core";
import type { AgentRuntimeDescriptor } from "@the-way-here/shared";
import { StudioEvents } from "./studio-events.js";

export class KnowledgeRuntime {
  private activeIndex: WikiIndex;
  private watcher?: FSWatcher;
  private rebuildTimer?: NodeJS.Timeout;

  private constructor(
    readonly vaultRoot: string,
    knowledgeBaseId: string | undefined,
    readonly events: StudioEvents,
  ) {
    this.activeIndex = new WikiIndex(vaultRoot, knowledgeBaseId);
  }

  static async create(vaultRoot: string, knowledgeBaseId: string | undefined, events = new StudioEvents()): Promise<KnowledgeRuntime> {
    const runtime = new KnowledgeRuntime(vaultRoot, knowledgeBaseId, events);
    await runtime.activeIndex.rebuild();
    runtime.watcher = runtime.watch(runtime.activeIndex);
    return runtime;
  }

  get index(): WikiIndex {
    return this.activeIndex;
  }

  async resolve(requestedId?: string): Promise<{ index: WikiIndex; config: WikiIndex["config"] }> {
    const targetId = requestedId || this.activeIndex.config.knowledgeBaseId;
    if (targetId === this.activeIndex.config.knowledgeBaseId) return { index: this.activeIndex, config: this.activeIndex.config };
    const targetIndex = new WikiIndex(this.vaultRoot, targetId);
    await targetIndex.rebuild();
    return { index: targetIndex, config: targetIndex.config };
  }

  async activate(nextId: string): Promise<void> {
    if (!nextId || nextId === this.activeIndex.config.knowledgeBaseId) return;
    const nextIndex = new WikiIndex(this.vaultRoot, nextId);
    await nextIndex.rebuild();
    clearTimeout(this.rebuildTimer);
    await this.watcher?.close();
    this.activeIndex = nextIndex;
    this.watcher = this.watch(nextIndex);
    this.events.broadcast("knowledge-base", { knowledgeBaseId: nextId, indexedAt: nextIndex.lastIndexedAt });
    this.events.broadcast("index", { knowledgeBaseId: nextId, at: nextIndex.lastIndexedAt });
  }

  async rebuildIfActive(knowledgeBaseId: string): Promise<void> {
    if (knowledgeBaseId === this.activeIndex.config.knowledgeBaseId) await this.activeIndex.rebuild();
  }

  vaultInfo(runtimes: AgentRuntimeDescriptor[] = []) {
    const index = this.activeIndex;
    return {
      name: index.config.name,
      root: this.vaultRoot,
      knowledgeBaseId: index.config.knowledgeBaseId,
      knowledgeBases: index.config.knowledgeBases,
      adapter: index.config.adapter,
      pageCount: index.list({ sources: false }).length,
      sourceCount: index.list({ sources: true }).length,
      lastIndexedAt: index.lastIndexedAt,
      categories: index.categoryCounts(),
      agentAvailable: runtimes.some((runtime) => runtime.available),
      runtimes,
    };
  }

  async close(): Promise<void> {
    clearTimeout(this.rebuildTimer);
    await this.watcher?.close();
  }

  private watch(watchedIndex: WikiIndex): FSWatcher {
    const watcher = chokidar.watch([watchedIndex.config.paths.wiki, watchedIndex.config.paths.sources], {
      cwd: this.vaultRoot,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 },
    });
    watcher.on("all", (eventName, changedPath) => {
      if (this.activeIndex !== watchedIndex) return;
      this.events.broadcast("file", { event: eventName, path: changedPath, at: new Date().toISOString() });
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(() => {
        void watchedIndex.rebuild().then(() => this.events.broadcast("index", { at: watchedIndex.lastIndexedAt, path: changedPath }));
      }, 500);
    });
    return watcher;
  }
}
