import type { ChatImportAdapter, NormalizedChatMessage } from "./types.js";

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function visibleText(message: Record<string, unknown>): string {
  const exportedText = stringField(message, "text");
  if (exportedText) return exportedText;
  if (!Array.isArray(message.content)) return "";
  return message.content.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const record = block as Record<string, unknown>;
    return record.type === "text" && typeof record.text === "string" ? [record.text] : [];
  }).join("\n").trim();
}

function attachments(message: Record<string, unknown>): string[] {
  const candidates = [
    ...(Array.isArray(message.files) ? message.files : []),
    ...(Array.isArray(message.attachments) ? message.attachments : []),
  ];
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const name = record.file_name ?? record.name ?? record.filename;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
}

function normalizeMessage(value: unknown): NormalizedChatMessage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const message = value as Record<string, unknown>;
  const text = visibleText(message);
  const fileNames = attachments(message);
  if (!text && !fileNames.length) return undefined;
  const sender = String(message.sender ?? "").toLocaleLowerCase();
  return {
    speaker: sender === "human" ? "我" : sender === "assistant" ? "AI" : sender || "对话",
    text,
    createdAt: stringField(message, "created_at"),
    attachments: fileNames.length ? fileNames : undefined,
  };
}

export const claudeAdapter: ChatImportAdapter = {
  channel: "claude",
  label: "Claude",
  selectEntries(entries) {
    const conversations = entries.find((entry) => /(^|\/)conversations\.json$/i.test(entry.name));
    return conversations ? [conversations] : entries;
  },
  normalizeJson(value) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate, index) => {
      if (!candidate || typeof candidate !== "object") return [];
      const conversation = candidate as Record<string, unknown>;
      if (!Array.isArray(conversation.chat_messages)) return [];
      const metadata = Object.fromEntries([
        ["conversation_id", stringField(conversation, "uuid")],
        ["conversation_created_at", stringField(conversation, "created_at")],
        ["conversation_updated_at", stringField(conversation, "updated_at")],
        ["conversation_summary", stringField(conversation, "summary")],
      ].filter((entry): entry is [string, string] => Boolean(entry[1])));
      return [{
        title: stringField(conversation, "name") || `Claude 对话 ${index + 1}`,
        messages: conversation.chat_messages.map(normalizeMessage).filter((message): message is NormalizedChatMessage => Boolean(message)),
        metadata,
      }];
    });
  },
};
