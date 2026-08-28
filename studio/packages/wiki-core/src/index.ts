import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import YAML from "yaml";
import type {
  AgentProviderConfig,
  AgentProviderProtocol,
  AgentRuntimeConfig,
  PageCategory,
  PageSection,
  VaultConfig,
  WikiLink,
  WikiPage,
  WikiPageSummary,
} from "@the-way-here/shared";

const DEFAULT_CONFIG: VaultConfig = {
  version: 3,
  name: "The Way Here",
  knowledgeBaseId: "default",
  knowledgeBases: [{ id: "default", name: "The Way Here" }],
  adapter: "personal-growth",
  paths: {
    wiki: "wiki",
    sources: "sources",
    skills: "skills",
    tools: "tools",
    agentInstructions: "AGENTS.md",
  },
  views: {},
  agents: {
    defaultRuntime: "auto",
    runtimes: {
      codex: { enabled: true, command: "codex", transport: "stdio" },
      pi: { enabled: true, providers: [] },
    },
  },
  validation: { commands: [] },
};

const SECTION_CATEGORY: Array<[string, PageCategory]> = [
  ["00 ", "home"],
  ["01 ", "personal-lines"],
  ["02 ", "life-stages"],
  ["03 ", "events"],
  ["04 ", "cycles"],
  ["05 ", "relationship-roles"],
  ["06 ", "systems"],
  ["07 ", "entities"],
  ["08 ", "sources"],
  ["09 ", "mental-models"],
  ["11 ", "state"],
  ["12 ", "letters"],
  ["13 ", "quotes"],
  ["99 ", "maintenance"],
];

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatedWorkspacePath(vaultRoot: string, value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`配置 ${label} 必须是非空路径`);
  const relative = toPosix(value.trim()).replace(/^\.\//, "").replace(/\/$/, "");
  if (path.isAbsolute(relative)) throw new Error(`配置 ${label} 必须使用工作区相对路径`);
  const resolved = path.resolve(vaultRoot, relative);
  const root = path.resolve(vaultRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`配置 ${label} 超出工作区边界`);
  return relative;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function withoutExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function dateValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

const providerProtocols = new Set<AgentProviderProtocol>(["openai-completions", "openai-responses", "anthropic-messages"]);

function normalizeProviderConfig(value: unknown, label: string): AgentProviderConfig {
  if (!isRecord(value)) throw new Error(`配置 ${label} 必须是对象`);
  if (["apiKey", "token", "secret"].some((field) => value[field] !== undefined)) {
    throw new Error(`配置 ${label} 不得保存明文密钥；请使用 apiKeyEnv 引用环境变量`);
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`配置 ${label}.id 无效`);
  const protocol = value.protocol as AgentProviderProtocol;
  if (!providerProtocols.has(protocol)) throw new Error(`配置 ${label}.protocol 不受支持`);
  const baseUrl = typeof value.baseUrl === "string" ? value.baseUrl.trim().replace(/\/$/, "") : "";
  try {
    const parsed = new URL(baseUrl);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error();
  } catch {
    throw new Error(`配置 ${label}.baseUrl 必须是 HTTP(S) 地址`);
  }
  const apiKeyEnv = value.apiKeyEnv === undefined ? undefined : String(value.apiKeyEnv).trim();
  if (apiKeyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) throw new Error(`配置 ${label}.apiKeyEnv 无效`);
  if (!Array.isArray(value.models) || !value.models.length) throw new Error(`配置 ${label}.models 至少需要一个模型`);
  const models = value.models.map((model: unknown, index: number) => {
    if (!isRecord(model)) throw new Error(`配置 ${label}.models[${index}] 必须是对象`);
    const modelId = typeof model.id === "string" ? model.id.trim() : "";
    if (!modelId) throw new Error(`配置 ${label}.models[${index}].id 不能为空`);
    const contextWindow = Number(model.contextWindow);
    const maxOutputTokens = Number(model.maxOutputTokens);
    if (!Number.isInteger(contextWindow) || contextWindow <= 0) throw new Error(`配置 ${label}.models[${index}].contextWindow 无效`);
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) throw new Error(`配置 ${label}.models[${index}].maxOutputTokens 无效`);
    return {
      id: modelId,
      displayName: String(model.displayName || modelId),
      reasoning: Boolean(model.reasoning),
      contextWindow,
      maxOutputTokens,
    };
  });
  return { id, name: value.name ? String(value.name) : undefined, protocol, baseUrl, apiKeyEnv, models };
}

function normalizeAgentConfig(raw: Record<string, any>, selected: Record<string, any>): AgentRuntimeConfig {
  const legacyCodex = { ...DEFAULT_CONFIG.agents.runtimes.codex, ...(isRecord(raw.codex) ? raw.codex : {}), ...(isRecord(selected.codex) ? selected.codex : {}) };
  const configured = isRecord(raw.agents) ? raw.agents : {};
  const runtimes = isRecord(configured.runtimes) ? configured.runtimes : {};
  const codex = { ...legacyCodex, ...(isRecord(runtimes.codex) ? runtimes.codex : {}) };
  if (typeof codex.enabled !== "boolean" || typeof codex.command !== "string" || codex.transport !== "stdio") {
    throw new Error("配置 agents.runtimes.codex 必须包含 enabled、command 和 stdio transport");
  }
  const rawPi = { ...DEFAULT_CONFIG.agents.runtimes.pi, ...(isRecord(runtimes.pi) ? runtimes.pi : {}) };
  if (typeof rawPi.enabled !== "boolean" || !Array.isArray(rawPi.providers)) throw new Error("配置 agents.runtimes.pi 必须包含 enabled 和 providers");
  const providers = rawPi.providers.map((provider: unknown, index: number) => normalizeProviderConfig(provider, `agents.runtimes.pi.providers[${index}]`));
  if (new Set(providers.map((provider) => provider.id)).size !== providers.length) throw new Error("配置 agents.runtimes.pi.providers 的 id 不能重复");
  const defaultRuntime = configured.defaultRuntime ?? DEFAULT_CONFIG.agents.defaultRuntime;
  if (!new Set(["auto", "codex", "pi"]).has(defaultRuntime)) throw new Error("配置 agents.defaultRuntime 必须是 auto、codex 或 pi");
  return {
    defaultRuntime,
    runtimes: {
      codex: { enabled: codex.enabled, command: codex.command, transport: "stdio" },
      pi: { enabled: rawPi.enabled, providers },
    },
  };
}

function normalizePropertyValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizePropertyValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalizePropertyValue(entry)]));
  }
  if (value === undefined) return null;
  return value;
}

export function normalizeFrontmatterProperties(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, normalizePropertyValue(value)]));
}

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(markdown: string, relativePath: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.posix.basename(withoutExtension(relativePath));
}

export function extractSections(markdown: string): PageSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: PageSection[] = [];
  let current: PageSection | undefined;
  for (const line of lines) {
    const heading = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading) {
      if (current) current.body = current.body.trim();
      current = { level: heading[1]!.length, heading: heading[2]!.trim(), body: "" };
      sections.push(current);
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) current.body = current.body.trim();
  return sections;
}

/**
 * Extract complete sections at one heading level. Deeper headings remain in
 * the parent body, which is what overview cards and expandable domains need.
 */
export function extractSectionBlocks(markdown: string, level = 2): PageSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: PageSection[] = [];
  let current: PageSection | undefined;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    const headingLevel = heading?.[1]?.length;
    if (heading && headingLevel === level) {
      if (current) current.body = current.body.trim();
      current = { level, heading: heading[2]!.trim(), body: "" };
      sections.push(current);
      continue;
    }
    if (heading && headingLevel && headingLevel < level) {
      if (current) current.body = current.body.trim();
      current = undefined;
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) current.body = current.body.trim();
  return sections;
}

export function extractWikiLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = [];
  const pattern = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
  for (const match of markdown.matchAll(pattern)) {
    const rawTarget = match[1]!.trim();
    const target = rawTarget.split("#", 1)[0]!.trim();
    if (!target) continue;
    links.push({
      raw: match[0],
      target: withoutExtension(target),
      label: (match[2] || rawTarget.split("#").at(-1) || target).trim(),
    });
  }
  return links;
}

export function categoryForPath(relativePath: string, config: VaultConfig): PageCategory {
  const normalized = toPosix(relativePath);
  if (!normalized.startsWith(`${config.paths.wiki}/`)) return "sources";
  const section = normalized.slice(config.paths.wiki.length + 1).split("/")[0] || "";
  return SECTION_CATEGORY.find(([prefix]) => section.startsWith(prefix))?.[1] || "other";
}

export function pageIdForPath(relativePath: string, config: VaultConfig): string {
  const normalized = toPosix(relativePath);
  for (const root of [config.paths.wiki, config.paths.sources]) {
    const normalizedRoot = toPosix(root).replace(/\/$/, "");
    if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
      const logicalRoot = path.posix.basename(normalizedRoot);
      return withoutExtension(`${logicalRoot}${normalized.slice(normalizedRoot.length)}`);
    }
  }
  return withoutExtension(normalized);
}

export async function loadVaultConfig(vaultRoot: string, requestedKnowledgeBase?: string): Promise<VaultConfig> {
  const configPath = path.join(vaultRoot, "the-way-here.config.yaml");
  let raw: Record<string, any> = {};
  try {
    const parsed = YAML.parse(await readFile(configPath, "utf8"));
    if (parsed !== undefined && parsed !== null && !isRecord(parsed)) throw new Error("the-way-here.config.yaml 顶层必须是对象");
    raw = parsed || {};
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  const configuredBases = isRecord(raw.knowledgeBases) ? raw.knowledgeBases : undefined;
  const configuredIds = Object.keys(configuredBases || {});
  const configuredDefault = String(raw.defaultKnowledgeBase || configuredIds[0] || "default");
  const customIds = configuredIds.filter((id) => id.toLowerCase() !== "demo");
  const preferredCustomId = customIds.includes(configuredDefault) ? configuredDefault : customIds[0];
  const knowledgeBaseId = requestedKnowledgeBase || preferredCustomId || (configuredIds.includes(configuredDefault) ? configuredDefault : configuredIds[0]) || "default";
  if (!/^[A-Za-z0-9_-]+$/.test(knowledgeBaseId)) throw new Error(`知识库 ID 无效：${knowledgeBaseId}`);
  const version = Number(raw.version ?? DEFAULT_CONFIG.version);
  if (!Number.isInteger(version) || version < 1 || version > 3) throw new Error(`不支持的配置版本：${raw.version}`);
  if (configuredBases && !configuredBases[knowledgeBaseId]) {
    throw new Error(`知识库不存在：${knowledgeBaseId}。可用知识库：${Object.keys(configuredBases).join("、")}`);
  }
  const selected = configuredBases?.[knowledgeBaseId] || {};
  if (!isRecord(selected)) throw new Error(`知识库 ${knowledgeBaseId} 的配置必须是对象`);
  const knowledgeBases = configuredBases
    ? Object.entries(configuredBases).map(([id, value]) => ({ id, name: String(value?.name || id), description: value?.description ? String(value.description) : undefined }))
    : [{ id: "default", name: String(raw.name || DEFAULT_CONFIG.name) }];
  const mergedPaths = { ...DEFAULT_CONFIG.paths, ...(isRecord(raw.paths) ? raw.paths : {}), ...(isRecord(selected.paths) ? selected.paths : {}) };
  const paths = {
    wiki: validatedWorkspacePath(vaultRoot, mergedPaths.wiki, `${knowledgeBaseId}.paths.wiki`),
    sources: validatedWorkspacePath(vaultRoot, mergedPaths.sources, `${knowledgeBaseId}.paths.sources`),
    skills: validatedWorkspacePath(vaultRoot, mergedPaths.skills, "paths.skills"),
    tools: validatedWorkspacePath(vaultRoot, mergedPaths.tools, "paths.tools"),
    agentInstructions: validatedWorkspacePath(vaultRoot, mergedPaths.agentInstructions, "paths.agentInstructions"),
  };
  if (paths.wiki === paths.sources) throw new Error(`知识库 ${knowledgeBaseId} 的 Wiki 与来源目录不能相同`);
  const commands = selected.validation?.commands ?? raw.validation?.commands ?? [];
  if (!Array.isArray(commands) || commands.some((command) => !Array.isArray(command) || command.some((part) => typeof part !== "string"))) {
    throw new Error(`知识库 ${knowledgeBaseId} 的 validation.commands 必须是字符串数组列表`);
  }
  const views = { ...DEFAULT_CONFIG.views, ...(isRecord(raw.views) ? raw.views : {}), ...(isRecord(selected.views) ? selected.views : {}) };
  if (Object.values(views).some((value) => typeof value !== "boolean")) throw new Error("配置 views 的值必须是布尔值");
  const agents = normalizeAgentConfig(raw, selected);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    ...selected,
    version,
    knowledgeBaseId: configuredBases ? knowledgeBaseId : "default",
    knowledgeBases,
    name: String(selected.name || raw.name || DEFAULT_CONFIG.name),
    adapter: String(selected.adapter || raw.adapter || DEFAULT_CONFIG.adapter),
    paths,
    views,
    agents,
    validation: {
      commands: commands.map((command: string[]) => [...command]),
    },
  };
}

type InternalPage = WikiPageSummary & {
  absolutePath: string;
  fileMarkdown: string;
  rawMarkdown: string;
  properties: Record<string, unknown>;
  sections: PageSection[];
  outgoingLinks: WikiLink[];
};

export class WikiIndex {
  readonly vaultRoot: string;
  readonly knowledgeBaseId?: string;
  config!: VaultConfig;
  lastIndexedAt = "";
  private pages = new Map<string, InternalPage>();
  private lookup = new Map<string, string[]>();
  private incoming = new Map<string, Set<string>>();

  constructor(vaultRoot: string, knowledgeBaseId?: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.knowledgeBaseId = knowledgeBaseId;
  }

  async rebuild(): Promise<void> {
    this.config = await loadVaultConfig(this.vaultRoot, this.knowledgeBaseId);
    const patterns = [
      `${toPosix(this.config.paths.wiki)}/**/*.md`,
      `${toPosix(this.config.paths.sources)}/**/*.md`,
    ];
    const files = await fg(patterns, {
      cwd: this.vaultRoot,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: false,
    });

    const pages = new Map<string, InternalPage>();
    for (const relativeFile of files.sort()) {
      const relativePath = toPosix(relativeFile);
      const absolutePath = path.resolve(this.vaultRoot, relativePath);
      if (!absolutePath.startsWith(`${this.vaultRoot}${path.sep}`)) continue;
      const [content, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
      let parsedContent = content;
      let parsedData: Record<string, any> = {};
      try {
        const parsed = matter(content);
        parsedContent = parsed.content;
        parsedData = parsed.data;
      } catch {
        // Keep malformed files readable in the GUI; validators remain responsible
        // for reporting invalid frontmatter.
      }
      const id = pageIdForPath(relativePath, this.config);
      const body = parsedContent.trim();
      const title = extractTitle(body, relativePath);
      pages.set(id, {
        id,
        absolutePath,
        relativePath,
        title,
        category: categoryForPath(relativePath, this.config),
        type: parsedData.type ? String(parsedData.type) : undefined,
        aliases: stringArray(parsedData.aliases),
        tags: stringArray(parsedData.tags),
        status: parsedData.status ? String(parsedData.status) : undefined,
        start: dateValue(parsedData.Start ?? parsedData.start),
        end: dateValue(parsedData.end ?? parsedData.End),
        locations: stringArray(parsedData.location),
        sources: stringArray(parsedData.source),
        excerpt: plainText(body.replace(/^#\s+.+$/m, "")).slice(0, 260),
        modifiedAt: fileStat.mtime.toISOString(),
        isSource: !relativePath.startsWith(`${this.config.paths.wiki}/`),
        fileMarkdown: content,
        rawMarkdown: body,
        properties: normalizeFrontmatterProperties(parsedData),
        sections: extractSections(body),
        outgoingLinks: extractWikiLinks(body),
      });
    }

    this.pages = pages;
    this.rebuildLookups();
    this.lastIndexedAt = new Date().toISOString();
  }

  private rebuildLookups(): void {
    this.lookup.clear();
    this.incoming.clear();
    for (const page of this.pages.values()) {
      for (const key of [page.id, withoutExtension(page.relativePath), path.posix.basename(page.id), page.title, ...page.aliases]) {
        const normalized = key.trim().toLocaleLowerCase();
        if (!normalized) continue;
        const matches = this.lookup.get(normalized) || [];
        if (!matches.includes(page.id)) matches.push(page.id);
        this.lookup.set(normalized, matches);
      }
    }
    for (const page of this.pages.values()) {
      page.outgoingLinks = page.outgoingLinks.map((link) => {
        const candidates = this.lookup.get(link.target.toLocaleLowerCase()) || [];
        const resolvedId = candidates.length === 1 ? candidates[0] : undefined;
        if (resolvedId) {
          const incoming = this.incoming.get(resolvedId) || new Set<string>();
          incoming.add(page.id);
          this.incoming.set(resolvedId, incoming);
        }
        return { ...link, resolvedId, ambiguous: candidates.length > 1 };
      });
    }
  }

  list(options: { category?: PageCategory; sources?: boolean } = {}): WikiPageSummary[] {
    return [...this.pages.values()]
      .filter((page) => (options.category ? page.category === options.category : true))
      .filter((page) => (options.sources === undefined ? true : page.isSource === options.sources))
      .map(this.summary)
      .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  }

  get(id: string): WikiPage | undefined {
    const normalized = withoutExtension(toPosix(id).replace(/^\/+/, ""));
    const page = this.pages.get(normalized);
    if (!page) return undefined;
    const incomingLinks = [...(this.incoming.get(page.id) || [])]
      .map((sourceId) => this.pages.get(sourceId))
      .filter((value): value is InternalPage => Boolean(value))
      .map(this.summary);
    const relatedPages = [...new Set(page.outgoingLinks.map((link) => link.resolvedId).filter((value): value is string => Boolean(value)))]
      .map((relatedId) => this.pages.get(relatedId))
      .filter((value): value is InternalPage => Boolean(value))
      .map(this.summary);
    const renderedMarkdown = page.rawMarkdown.replace(
      /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
      (raw, rawTarget: string, rawLabel?: string) => {
        const target = rawTarget.split("#", 1)[0]!.trim();
        const label = (rawLabel || rawTarget.split("#").at(-1) || target).trim();
        const candidates = this.lookup.get(withoutExtension(target).toLocaleLowerCase()) || [];
        if (candidates.length !== 1) return label;
        const href = candidates[0]!.split("/").map(encodeURIComponent).join("/");
        return `[${label}](/page/${href})`;
      },
    );
    return {
      ...this.summary(page),
      markdown: page.fileMarkdown,
      renderedMarkdown,
      properties: page.properties,
      sections: page.sections,
      outgoingLinks: page.outgoingLinks,
      relatedPages,
      incomingLinks,
    };
  }

  search(query: string, limit = 30): WikiPageSummary[] {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return [...this.pages.values()]
      .map((page) => {
        const title = `${page.title} ${page.aliases.join(" ")}`.toLocaleLowerCase();
        const body = `${page.rawMarkdown} ${page.tags.join(" ")}`.toLocaleLowerCase();
        const score = terms.reduce((total, term) => {
          if (title.includes(term)) total += 8;
          if (body.includes(term)) total += 2;
          return total;
        }, 0);
        return { page, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.page.modifiedAt.localeCompare(a.page.modifiedAt))
      .slice(0, limit)
      .map(({ page }) => this.summary(page));
  }

  categoryCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const page of this.pages.values()) counts[page.category] = (counts[page.category] || 0) + 1;
    return counts;
  }

  private summary = (page: InternalPage): WikiPageSummary => ({
    id: page.id,
    relativePath: page.relativePath,
    title: page.title,
    category: page.category,
    type: page.type,
    aliases: page.aliases,
    tags: page.tags,
    status: page.status,
    start: page.start,
    end: page.end,
    locations: page.locations,
    sources: page.sources,
    excerpt: page.excerpt,
    modifiedAt: page.modifiedAt,
    isSource: page.isSource,
  });
}
