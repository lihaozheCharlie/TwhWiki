import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { PaymentJourneySummary, SourceImportChannel, SourceImportFile } from "@the-way-here/shared";
import { prepareAlipayStatement } from "./modules/imports/payment-statement.js";

export interface PreparedImportFile {
  originalName: string;
  relativePath: string;
  content: string;
  bytes: number;
}

export interface PreparedImportBatch {
  files: PreparedImportFile[];
  journey?: PaymentJourneySummary;
}

const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 20_000;
const supportedChatExtensions = new Set([".json", ".html", ".htm", ".txt", ".md"]);

function safeRelativePath(value: string, index: number, allowedExtensions: Set<string>): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..").map((part) => {
    const cleaned = part.replace(/[\0:*?"<>|]/g, "-").replace(/^\.+/, "").trim();
    return cleaned || `untitled-${index + 1}`;
  });
  const fallback = `untitled-${index + 1}.md`;
  const joined = parts.join("/") || fallback;
  const extension = path.posix.extname(joined).toLocaleLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error(`不支持的文件格式：${value}`);
  return joined;
}

function markdownPath(value: string, index: number): string {
  const safe = safeRelativePath(value, index, supportedChatExtensions);
  const extension = path.posix.extname(safe);
  return extension.toLocaleLowerCase() === ".md" ? safe : `${safe.slice(0, -extension.length)}.md`;
}

function decodeZipEntries(buffer: Buffer): Array<{ name: string; content: Buffer }> {
  const minimumEocd = 22;
  const lowerBound = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - minimumEocd; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP 文件结构无效或不完整");
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) throw new Error("暂不支持 ZIP64 格式，请拆分压缩包后重试");
  if (entryCount > MAX_ZIP_ENTRIES) throw new Error("ZIP 内文件数量过多，请拆分压缩包后重试");

  const entries: Array<{ name: string; content: Buffer }> = [];
  let offset = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP 中央目录损坏");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw new Error("ZIP 文件名信息损坏");
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8").replace(/\\/g, "/");
    offset = nameEnd + extraLength + commentLength;
    if (!name || name.endsWith("/") || name.startsWith("__MACOSX/") || name.split("/").some((part) => part === ".DS_Store")) continue;
    if (flags & 0x1) throw new Error(`ZIP 中包含加密文件：${name}`);
    if (![0, 8].includes(method)) throw new Error(`ZIP 中的 ${name} 使用了暂不支持的压缩方式`);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP 中的 ${name} 本地文件头损坏`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`ZIP 中的 ${name} 内容不完整`);
    const compressed = buffer.subarray(dataStart, dataEnd);
    const content = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    if (content.length !== uncompressedSize) throw new Error(`ZIP 中的 ${name} 解压后大小不一致`);
    totalBytes += content.length;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("ZIP 解压后的内容超过 100 MB，请拆分后重试");
    entries.push({ name, content });
  }
  return entries;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLocaleLowerCase()] || `&${entity};`;
  });
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|hr)\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function channelLabel(channel: SourceImportChannel): string {
  return ({ files: "文件", chatgpt: "ChatGPT", gemini: "Gemini", deepseek: "DeepSeek", doubao: "豆包", "other-ai": "其他 AI", wechat: "微信", alipay: "支付宝账单" })[channel];
}

function frontmatter(channel: SourceImportChannel, source: string, createdAt: string): string {
  return `---\ntype: source\nimport_channel: ${JSON.stringify(channel)}\nsource: ${JSON.stringify(source)}\nimported_at: ${createdAt}\n---\n\n`;
}

function plainTextMarkdown(content: string, source: string, channel: SourceImportChannel, createdAt: string): string {
  const title = path.posix.basename(source, path.posix.extname(source)).replace(/^#+\s*/, "") || `${channelLabel(channel)}记录`;
  return `${frontmatter(channel, source, createdAt)}# ${title}\n\n${content.trim()}\n`;
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textFromUnknown(record.text ?? record.content ?? record.message ?? record.parts ?? "");
  }
  return "";
}

function speakerFromMessage(message: Record<string, unknown>): string {
  const author = message.author;
  const raw = typeof author === "object" && author ? (author as Record<string, unknown>).role : author;
  const role = String(message.role ?? message.sender ?? message.from ?? message.speaker ?? raw ?? "对话").toLocaleLowerCase();
  if (["user", "human", "me", "我"].includes(role)) return "我";
  if (["assistant", "ai", "bot", "model"].includes(role)) return "AI";
  if (role === "system") return "系统";
  return String(raw || message.sender || message.from || message.speaker || "对话");
}

function renderMessages(messages: unknown[]): string {
  return messages.map((item) => {
    if (!item || typeof item !== "object") return "";
    const message = item as Record<string, unknown>;
    const content = textFromUnknown(message.content ?? message.text ?? message.message ?? message.parts);
    if (!content.trim()) return "";
    const rawTime = message.create_time ?? message.created_at ?? message.timestamp ?? message.time ?? message.date;
    let time = "";
    if (typeof rawTime === "number") time = new Date(rawTime > 10_000_000_000 ? rawTime : rawTime * 1000).toISOString();
    else if (typeof rawTime === "string") time = rawTime;
    return `## ${speakerFromMessage(message)}${time ? ` · ${time}` : ""}\n\n${content.trim()}\n`;
  }).filter(Boolean).join("\n");
}

function chatGptConversations(value: unknown): Array<{ title: string; messages: unknown[] }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((conversation, conversationIndex) => {
    if (!conversation || typeof conversation !== "object") return [];
    const record = conversation as Record<string, unknown>;
    if (!record.mapping || typeof record.mapping !== "object") return [];
    const messages: Array<Record<string, unknown> & { __order: number }> = Object.values(record.mapping as Record<string, unknown>).flatMap((node, nodeIndex) => {
      if (!node || typeof node !== "object") return [];
      const message = (node as Record<string, unknown>).message;
      return message && typeof message === "object" ? [{ ...(message as Record<string, unknown>), __order: nodeIndex }] : [];
    }).sort((a, b) => Number((a as Record<string, unknown>).create_time || a.__order || 0) - Number((b as Record<string, unknown>).create_time || b.__order || 0));
    return [{ title: String(record.title || `ChatGPT 对话 ${conversationIndex + 1}`), messages }];
  });
}

function genericConversations(value: unknown, fallbackTitle: string): Array<{ title: string; messages: unknown[] }> {
  const root = value as Record<string, unknown> | unknown[];
  const candidates = Array.isArray(root)
    ? root
    : Array.isArray(root?.conversations) ? root.conversations
      : Array.isArray(root?.chats) ? root.chats
        : Array.isArray(root?.messages) ? [{ title: fallbackTitle, messages: root.messages }]
          : [];
  if (!Array.isArray(candidates)) return [];
  if (candidates.length && candidates.every((item) => item && typeof item === "object" && !Array.isArray((item as Record<string, unknown>).messages))) {
    const rendered = renderMessages(candidates);
    return rendered ? [{ title: fallbackTitle, messages: candidates }] : [];
  }
  return candidates.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const messages = Array.isArray(record.messages) ? record.messages : Array.isArray(record.items) ? record.items : [];
    return messages.length ? [{ title: String(record.title || record.name || `${fallbackTitle} ${index + 1}`), messages }] : [];
  });
}

function safeTitle(value: string, index: number): string {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (cleaned || `对话 ${index + 1}`).slice(0, 120);
}

function chatJsonToMarkdown(content: string, source: string, channel: SourceImportChannel, createdAt: string): Array<{ relativePath: string; content: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [{ relativePath: markdownPath(source, 0), content: plainTextMarkdown(content, source, channel, createdAt) }];
  }
  const fallbackTitle = path.posix.basename(source, path.posix.extname(source)) || `${channelLabel(channel)} 对话`;
  const conversations = channel === "chatgpt" ? chatGptConversations(parsed) : [];
  const normalized = conversations.length ? conversations : genericConversations(parsed, fallbackTitle);
  if (!normalized.length) {
    const body = `${frontmatter(channel, source, createdAt)}# ${fallbackTitle}\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;
    return [{ relativePath: markdownPath(source, 0), content: body }];
  }
  return normalized.map((conversation, index) => {
    const title = safeTitle(conversation.title, index);
    return {
      relativePath: `${title}.md`,
      content: `${frontmatter(channel, source, createdAt)}# ${title}\n\n${renderMessages(conversation.messages) || "暂无可识别的消息正文。\n"}`,
    };
  });
}

function decodeSourceFile(file: SourceImportFile): Buffer {
  if (file.encoding === "base64") {
    const compact = file.content.replace(/\s/g, "");
    if (!/^[a-z0-9+/]*={0,2}$/i.test(compact)) throw new Error(`文件编码无效：${file.name}`);
    return Buffer.from(compact, "base64");
  }
  return Buffer.from(file.content, "utf8");
}

function expandedFiles(files: SourceImportFile[], channel: SourceImportChannel): Array<{ name: string; content: Buffer }> {
  const result: Array<{ name: string; content: Buffer }> = [];
  for (const file of files) {
    const fileName = file.relativePath || file.name;
    const buffer = decodeSourceFile(file);
    if (path.posix.extname(file.name).toLocaleLowerCase() !== ".zip") {
      result.push({ name: fileName, content: buffer });
      continue;
    }
    const entries = decodeZipEntries(buffer);
    const officialChatGpt = channel === "chatgpt" ? entries.find((entry) => /(^|\/)conversations\.json$/i.test(entry.name)) : undefined;
    if (officialChatGpt) result.push({ name: officialChatGpt.name, content: officialChatGpt.content });
    else result.push(...entries);
  }
  return result;
}

function prepareGenericImportFiles(files: SourceImportFile[], channel: SourceImportChannel, createdAt: string): PreparedImportFile[] {
  const allowed = channel === "files" ? new Set([".md", ".txt"]) : supportedChatExtensions;
  const expanded = expandedFiles(files, channel).filter((file) => allowed.has(path.posix.extname(file.name).toLocaleLowerCase()));
  if (!expanded.length) throw new Error(channel === "files" ? "没有找到可导入的 Markdown 或 TXT 文件" : "没有找到可识别的聊天记录文件");
  const prepared: PreparedImportFile[] = [];
  const used = new Map<string, number>();
  function add(originalName: string, relativePath: string, content: string, bytes: number) {
    const extension = path.posix.extname(relativePath);
    const base = relativePath.slice(0, -extension.length);
    const seen = used.get(relativePath) || 0;
    used.set(relativePath, seen + 1);
    const uniquePath = seen ? `${base} (${seen + 1})${extension}` : relativePath;
    prepared.push({ originalName, relativePath: uniquePath, content, bytes });
  }
  expanded.forEach((file, index) => {
    const extension = path.posix.extname(file.name).toLocaleLowerCase();
    const text = file.content.toString("utf8");
    if (channel === "files") {
      const relativePath = safeRelativePath(file.name, index, allowed);
      const outputPath = extension === ".txt" ? `${relativePath.slice(0, -4)}.md` : relativePath;
      add(file.name, outputPath, extension === ".txt" ? plainTextMarkdown(text, file.name, channel, createdAt) : text, file.content.length);
      return;
    }
    if (extension === ".json") {
      chatJsonToMarkdown(text, file.name, channel, createdAt).forEach((output) => add(file.name, output.relativePath, output.content, file.content.length));
      return;
    }
    const normalizedText = [".html", ".htm"].includes(extension) ? htmlToText(text) : text;
    add(file.name, markdownPath(file.name, index), extension === ".md" ? text : plainTextMarkdown(normalizedText, file.name, channel, createdAt), file.content.length);
  });
  const totalBytes = prepared.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0);
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("导入后的内容超过 100 MB，请拆分后重试");
  return prepared;
}

export function prepareImportBatch(files: SourceImportFile[], channel: SourceImportChannel, createdAt: string): PreparedImportBatch {
  if (channel === "alipay") {
    if (files.length !== 1) throw new Error("每次请选择一份支付宝账单，以免不同时间范围相互覆盖");
    return prepareAlipayStatement(files[0]!, createdAt);
  }
  return { files: prepareGenericImportFiles(files, channel, createdAt) };
}

export function prepareImportFiles(files: SourceImportFile[], channel: SourceImportChannel, createdAt: string): PreparedImportFile[] {
  return prepareImportBatch(files, channel, createdAt).files;
}
