import { chatGptAdapter } from "./chatgpt-adapter.js";
import { claudeAdapter } from "./claude-adapter.js";
import { createGenericChatAdapter } from "./generic-adapter.js";
import type { ChatImportAdapter, ChatImportChannel } from "./types.js";

const adapters: Record<ChatImportChannel, ChatImportAdapter> = {
  chatgpt: chatGptAdapter,
  claude: claudeAdapter,
  gemini: createGenericChatAdapter("gemini", "Gemini"),
  deepseek: createGenericChatAdapter("deepseek", "DeepSeek"),
  doubao: createGenericChatAdapter("doubao", "豆包"),
  "other-ai": createGenericChatAdapter("other-ai", "其他 AI"),
};

export function chatImportAdapter(channel: ChatImportChannel): ChatImportAdapter {
  return adapters[channel];
}
