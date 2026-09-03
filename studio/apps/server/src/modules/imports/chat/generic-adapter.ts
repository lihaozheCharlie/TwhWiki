import type { ChatImportAdapter, ChatImportChannel, NormalizedChatConversation, NormalizedChatMessage } from "./types.js";

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

export function normalizeGenericMessage(value: unknown): NormalizedChatMessage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const message = value as Record<string, unknown>;
  const text = textFromUnknown(message.content ?? message.text ?? message.message ?? message.parts).trim();
  if (!text) return undefined;
  const rawTime = message.create_time ?? message.created_at ?? message.timestamp ?? message.time ?? message.date;
  let createdAt: string | undefined;
  if (typeof rawTime === "number") createdAt = new Date(rawTime > 10_000_000_000 ? rawTime : rawTime * 1000).toISOString();
  else if (typeof rawTime === "string" && rawTime.trim()) createdAt = rawTime;
  return { speaker: speakerFromMessage(message), text, createdAt };
}

export function normalizeGenericJson(value: unknown, fallbackTitle: string): NormalizedChatConversation[] {
  const root = value as Record<string, unknown> | unknown[];
  const candidates = Array.isArray(root)
    ? root
    : Array.isArray(root?.conversations) ? root.conversations
      : Array.isArray(root?.chats) ? root.chats
        : Array.isArray(root?.messages) ? [{ title: fallbackTitle, messages: root.messages }]
          : [];
  if (!Array.isArray(candidates)) return [];
  if (candidates.length && candidates.every((item) => item && typeof item === "object" && !Array.isArray((item as Record<string, unknown>).messages))) {
    const messages = candidates.map(normalizeGenericMessage).filter((message): message is NormalizedChatMessage => Boolean(message));
    return messages.length ? [{ title: fallbackTitle, messages }] : [];
  }
  return candidates.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const rawMessages = Array.isArray(record.messages) ? record.messages : Array.isArray(record.items) ? record.items : [];
    if (!rawMessages.length) return [];
    return [{
      title: String(record.title || record.name || `${fallbackTitle} ${index + 1}`),
      messages: rawMessages.map(normalizeGenericMessage).filter((message): message is NormalizedChatMessage => Boolean(message)),
    }];
  });
}

export function createGenericChatAdapter(channel: ChatImportChannel, label: string): ChatImportAdapter {
  return {
    channel,
    label,
    selectEntries: (entries) => entries,
    normalizeJson: normalizeGenericJson,
  };
}
