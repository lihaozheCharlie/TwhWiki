import type { SourceChatImportChannel } from "@the-way-here/shared";

export type ChatImportChannel = SourceChatImportChannel;

export interface ChatArchiveEntry {
  name: string;
  content: Buffer;
}

export interface NormalizedChatMessage {
  speaker: string;
  text: string;
  createdAt?: string;
  attachments?: string[];
}

export interface NormalizedChatConversation {
  title: string;
  messages: NormalizedChatMessage[];
  metadata?: Record<string, string>;
}

export interface ChatImportAdapter {
  readonly channel: ChatImportChannel;
  readonly label: string;
  selectEntries(entries: ChatArchiveEntry[]): ChatArchiveEntry[];
  normalizeJson(value: unknown, fallbackTitle: string): NormalizedChatConversation[];
}

export interface PreparedChatImportFile {
  originalName: string;
  relativePath: string;
  content: string;
  bytes: number;
}
