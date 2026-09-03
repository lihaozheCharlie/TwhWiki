import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { PaymentJourneySummary, SourceImportChannel, SourceImportFile } from "@the-way-here/shared";
import { prepareChatImport } from "./modules/imports/chat/index.js";
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
const supportedFileExtensions = new Set([".md", ".txt"]);

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

function frontmatter(source: string, createdAt: string): string {
  return `---\ntype: source\nimport_channel: "files"\nsource: ${JSON.stringify(source)}\nimported_at: ${createdAt}\n---\n\n`;
}

function plainTextMarkdown(content: string, source: string, createdAt: string): string {
  const title = path.posix.basename(source, path.posix.extname(source)).replace(/^#+\s*/, "") || "文件记录";
  return `${frontmatter(source, createdAt)}# ${title}\n\n${content.trim()}\n`;
}

function decodeSourceFile(file: SourceImportFile): Buffer {
  if (file.encoding === "base64") {
    const compact = file.content.replace(/\s/g, "");
    if (!/^[a-z0-9+/]*={0,2}$/i.test(compact)) throw new Error(`文件编码无效：${file.name}`);
    return Buffer.from(compact, "base64");
  }
  return Buffer.from(file.content, "utf8");
}

function expandedFiles(files: SourceImportFile[]): Array<{ name: string; content: Buffer }> {
  return files.flatMap((file) => {
    const buffer = decodeSourceFile(file);
    return path.posix.extname(file.name).toLocaleLowerCase() === ".zip"
      ? decodeZipEntries(buffer)
      : [{ name: file.relativePath || file.name, content: buffer }];
  });
}

function prepareFileImports(files: SourceImportFile[], createdAt: string): PreparedImportFile[] {
  const expanded = expandedFiles(files).filter((file) => supportedFileExtensions.has(path.posix.extname(file.name).toLocaleLowerCase()));
  if (!expanded.length) throw new Error("没有找到可导入的 Markdown 或 TXT 文件");
  const prepared = expanded.map((file, index) => {
    const extension = path.posix.extname(file.name).toLocaleLowerCase();
    const relativePath = safeRelativePath(file.name, index, supportedFileExtensions);
    const outputPath = extension === ".txt" ? `${relativePath.slice(0, -4)}.md` : relativePath;
    const content = extension === ".txt" ? plainTextMarkdown(file.content.toString("utf8"), file.name, createdAt) : file.content.toString("utf8");
    return { originalName: file.name, relativePath: outputPath, content, bytes: Buffer.byteLength(content, "utf8") };
  });
  const totalBytes = prepared.reduce((total, file) => total + file.bytes, 0);
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("导入后的内容超过 100 MB，请拆分后重试");
  return prepared;
}

export function prepareImportBatch(files: SourceImportFile[], channel: SourceImportChannel, createdAt: string): PreparedImportBatch {
  if (channel === "alipay") {
    if (files.length !== 1) throw new Error("每次请选择一份支付宝账单，以免不同时间范围相互覆盖");
    return prepareAlipayStatement(files[0]!, createdAt);
  }
  if (channel === "files") return { files: prepareFileImports(files, createdAt) };
  return { files: prepareChatImport(expandedFiles(files), channel, createdAt) };
}

export function prepareImportFiles(files: SourceImportFile[], channel: SourceImportChannel, createdAt: string): PreparedImportFile[] {
  return prepareImportBatch(files, channel, createdAt).files;
}
