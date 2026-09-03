import { normalizeGenericMessage, normalizeGenericJson } from "./generic-adapter.js";
import type { ChatImportAdapter, NormalizedChatMessage } from "./types.js";

export const chatGptAdapter: ChatImportAdapter = {
  channel: "chatgpt",
  label: "ChatGPT",
  selectEntries(entries) {
    const conversations = entries.find((entry) => /(^|\/)conversations\.json$/i.test(entry.name));
    return conversations ? [conversations] : entries;
  },
  normalizeJson(value, fallbackTitle) {
    if (!Array.isArray(value)) return normalizeGenericJson(value, fallbackTitle);
    const conversations = value.flatMap((conversation, conversationIndex) => {
      if (!conversation || typeof conversation !== "object") return [];
      const record = conversation as Record<string, unknown>;
      if (!record.mapping || typeof record.mapping !== "object") return [];
      const messages = Object.values(record.mapping as Record<string, unknown>).flatMap((node, nodeIndex) => {
        if (!node || typeof node !== "object") return [];
        const message = (node as Record<string, unknown>).message;
        return message && typeof message === "object" ? [{ ...(message as Record<string, unknown>), __order: nodeIndex }] : [];
      }).sort((left, right) => Number((left as Record<string, unknown>).create_time || left.__order || 0) - Number((right as Record<string, unknown>).create_time || right.__order || 0))
        .map(normalizeGenericMessage)
        .filter((message): message is NormalizedChatMessage => Boolean(message));
      return [{ title: String(record.title || `ChatGPT 对话 ${conversationIndex + 1}`), messages }];
    });
    return conversations.length ? conversations : normalizeGenericJson(value, fallbackTitle);
  },
};
