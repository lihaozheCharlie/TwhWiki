import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { isPathInside } from "../../path-policy.js";

export class KnowledgeBaseRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

type KnowledgeBaseRegistry = Record<string, {
  name?: string;
  description?: string;
  paths?: { wiki?: string; sources?: string };
}>;

export type DeletedKnowledgeBase = { id: string; name: string; fallbackId: string };

export async function createPersonalKnowledgeBase(vaultRoot: string, requestedName: unknown): Promise<{ id: string; name: string }> {
  const name = typeof requestedName === "string" ? requestedName.trim() : "";
  if (!name) throw new KnowledgeBaseRequestError(400, "请为知识库起一个名字");
  if ([...name].length > 40) throw new KnowledgeBaseRequestError(400, "知识库名称不能超过 40 个字符");

  const configPath = path.join(vaultRoot, "the-way-here.config.yaml");
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new KnowledgeBaseRequestError(409, "当前工作区还没有知识库配置，无法从界面创建");
    throw error;
  }

  const document = YAML.parseDocument(source);
  if (document.errors.length) throw new KnowledgeBaseRequestError(409, "知识库配置无法读取，请先修复 the-way-here.config.yaml");
  const raw = document.toJS() as { knowledgeBases?: KnowledgeBaseRegistry } | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new KnowledgeBaseRequestError(409, "知识库配置格式不正确");
  const knowledgeBases = raw.knowledgeBases && typeof raw.knowledgeBases === "object" && !Array.isArray(raw.knowledgeBases) ? raw.knowledgeBases : {};
  let id = "personal";
  for (let suffix = 2; knowledgeBases[id]; suffix += 1) id = `personal-${suffix}`;

  const wiki = `vault/${id}/wiki`;
  const sources = `vault/${id}/sources`;
  const nextKnowledgeBases = {
    ...knowledgeBases,
    [id]: {
      name,
      description: "你的私人材料与持续构建的个人知识库",
      paths: { wiki, sources },
    },
  };
  document.set("defaultKnowledgeBase", id);
  document.set("knowledgeBases", nextKnowledgeBases);

  await Promise.all([
    mkdir(path.join(vaultRoot, wiki), { recursive: true }),
    mkdir(path.join(vaultRoot, sources), { recursive: true }),
  ]);

  const temporaryPath = path.join(vaultRoot, `.the-way-here.config.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporaryPath, document.toString(), { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, configPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return { id, name };
}

export async function deletePersonalKnowledgeBase(vaultRoot: string, requestedId: unknown): Promise<DeletedKnowledgeBase> {
  const id = typeof requestedId === "string" ? requestedId.trim() : "";
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new KnowledgeBaseRequestError(400, "知识库 ID 无效");
  if (id.toLowerCase() === "demo") throw new KnowledgeBaseRequestError(403, "演示知识库不能删除");

  const configPath = path.join(vaultRoot, "the-way-here.config.yaml");
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new KnowledgeBaseRequestError(409, "当前工作区还没有知识库配置");
    throw error;
  }

  const document = YAML.parseDocument(source);
  if (document.errors.length) throw new KnowledgeBaseRequestError(409, "知识库配置无法读取，请先修复 the-way-here.config.yaml");
  const raw = document.toJS() as { defaultKnowledgeBase?: unknown; paths?: { wiki?: unknown; sources?: unknown }; knowledgeBases?: KnowledgeBaseRegistry } | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new KnowledgeBaseRequestError(409, "知识库配置格式不正确");
  const knowledgeBases = raw.knowledgeBases && typeof raw.knowledgeBases === "object" && !Array.isArray(raw.knowledgeBases) ? raw.knowledgeBases : {};
  const target = knowledgeBases[id];
  if (!target) throw new KnowledgeBaseRequestError(404, "知识库不存在，请刷新后重试");
  if (typeof target.paths?.wiki !== "string" || !target.paths.wiki.trim() || typeof target.paths.sources !== "string" || !target.paths.sources.trim()) {
    throw new KnowledgeBaseRequestError(409, "这个知识库没有独立目录，不能从界面删除");
  }

  const remaining = Object.fromEntries(Object.entries(knowledgeBases).filter(([candidateId]) => candidateId !== id)) as KnowledgeBaseRegistry;
  const remainingIds = Object.keys(remaining);
  if (!remainingIds.length) throw new KnowledgeBaseRequestError(409, "至少需要保留一个知识库");
  const configuredDefault = typeof raw.defaultKnowledgeBase === "string" ? raw.defaultKnowledgeBase : "";
  const fallbackId = remaining[configuredDefault]
    ? configuredDefault
    : remainingIds.find((candidateId) => candidateId.toLowerCase() !== "demo") || remainingIds[0]!;

  const managedRoot = path.resolve(vaultRoot, "vault");
  const deletionPaths = [target.paths.wiki, target.paths.sources].map((entry) => path.resolve(vaultRoot, entry!));
  if (deletionPaths.some((candidate) => !isPathInside(managedRoot, candidate))) {
    throw new KnowledgeBaseRequestError(409, "这个知识库使用了自定义目录，请在文件系统中手动处理");
  }
  if (deletionPaths[0] === deletionPaths[1]
    || isPathInside(deletionPaths[0]!, deletionPaths[1]!)
    || isPathInside(deletionPaths[1]!, deletionPaths[0]!)) {
    throw new KnowledgeBaseRequestError(409, "知识库目录存在包含关系，不能安全删除");
  }
  const remainingPaths = Object.values(remaining).flatMap((entry) => [entry.paths?.wiki || raw.paths?.wiki, entry.paths?.sources || raw.paths?.sources])
    .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    .map((entry) => path.resolve(vaultRoot, entry));
  if (deletionPaths.some((candidate) => remainingPaths.some((remainingPath) => candidate === remainingPath || isPathInside(candidate, remainingPath) || isPathInside(remainingPath, candidate)))) {
    throw new KnowledgeBaseRequestError(409, "这个知识库与其他空间共用目录，不能单独删除");
  }

  const staged: Array<{ original: string; temporary: string }> = [];
  const temporaryConfig = path.join(vaultRoot, `.the-way-here.config.${process.pid}.${Date.now()}.tmp`);
  try {
    for (const [index, original] of deletionPaths.entries()) {
      try {
        const info = await lstat(original);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new KnowledgeBaseRequestError(409, "知识库目录不是可安全删除的文件夹");
      } catch (error: any) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      const temporary = path.join(path.dirname(original), `.${path.basename(original)}.deleting-${process.pid}-${Date.now()}-${index}`);
      await rename(original, temporary);
      staged.push({ original, temporary });
    }

    document.set("defaultKnowledgeBase", fallbackId);
    document.set("knowledgeBases", remaining);
    await writeFile(temporaryConfig, document.toString(), { encoding: "utf8", flag: "wx" });
    await rename(temporaryConfig, configPath);
  } catch (error) {
    await rm(temporaryConfig, { force: true });
    for (const entry of [...staged].reverse()) {
      try { await rename(entry.temporary, entry.original); } catch { /* Keep the original error. */ }
    }
    throw error;
  }

  await Promise.all(staged.map((entry) => rm(entry.temporary, { recursive: true, force: true })));
  return { id, name: typeof target.name === "string" && target.name.trim() ? target.name : id, fallbackId };
}
