import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

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
