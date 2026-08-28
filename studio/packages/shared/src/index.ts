export type PageCategory =
  | "home"
  | "personal-lines"
  | "life-stages"
  | "events"
  | "cycles"
  | "relationship-roles"
  | "systems"
  | "entities"
  | "sources"
  | "mental-models"
  | "state"
  | "letters"
  | "quotes"
  | "maintenance"
  | "other";

export interface WikiLink {
  raw: string;
  target: string;
  label: string;
  resolvedId?: string;
  ambiguous?: boolean;
}

export interface PageSection {
  level: number;
  heading: string;
  body: string;
}

export interface WikiPageSummary {
  id: string;
  relativePath: string;
  title: string;
  category: PageCategory;
  type?: string;
  aliases: string[];
  tags: string[];
  status?: string;
  start?: string;
  end?: string;
  locations: string[];
  sources: string[];
  excerpt: string;
  modifiedAt: string;
  isSource: boolean;
}

export interface WikiPage extends WikiPageSummary {
  markdown: string;
  renderedMarkdown: string;
  properties: Record<string, unknown>;
  sections: PageSection[];
  outgoingLinks: WikiLink[];
  relatedPages?: WikiPageSummary[];
  incomingLinks: WikiPageSummary[];
}

export interface VaultConfig {
  version: number;
  name: string;
  knowledgeBaseId: string;
  knowledgeBases: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  adapter: string;
  paths: {
    wiki: string;
    sources: string;
    skills: string;
    tools: string;
    agentInstructions: string;
  };
  views: Record<string, boolean>;
  agents: AgentRuntimeConfig;
  validation: {
    commands: string[][];
  };
}

export interface VaultInfo {
  name: string;
  root: string;
  knowledgeBaseId: string;
  knowledgeBases: VaultConfig["knowledgeBases"];
  adapter: string;
  pageCount: number;
  sourceCount: number;
  lastIndexedAt: string;
  categories: Record<string, number>;
  agentAvailable: boolean;
  runtimes: AgentRuntimeDescriptor[];
}

export interface SourceImportFile {
  name: string;
  relativePath?: string;
  content: string;
  encoding?: "utf8" | "base64";
  mimeType?: string;
}

export type SourceImportChannel = "files" | "chatgpt" | "gemini" | "deepseek" | "doubao" | "other-ai" | "wechat" | "alipay";

export type PaymentJourneyClusterKind = "journey" | "place" | "routine" | "day-story" | "theme";

export interface PaymentJourneyCluster {
  id: string;
  kind: PaymentJourneyClusterKind;
  title: string;
  summary: string;
  question: string;
  startDate: string;
  endDate: string;
  entryCount: number;
  categories: string[];
  evidence: string[];
}

export interface PaymentJourneySummary {
  provider: "alipay";
  title: string;
  reportPath: string;
  period: { start: string; end: string };
  transactionCount: number;
  activeDays: number;
  netExpense: number;
  refundCount: number;
  clusters: PaymentJourneyCluster[];
  agentPrompt: string;
}

export interface SourceImportBatch {
  id: string;
  createdAt: string;
  channel?: SourceImportChannel;
  targetFolder?: string;
  fileCount: number;
  totalBytes: number;
  files: Array<{
    originalName: string;
    storedPath: string;
    bytes: number;
  }>;
  journey?: PaymentJourneySummary;
}

export interface BuildSkill {
  id: string;
  name: string;
  description: string;
  relativePath: string;
  modifiedAt: string;
}

export interface ReasoningLens {
  id: string;
  displayName: string;
  attention: string;
  signals: string[];
  helperUse: string;
  relativePath: string;
}

export interface SkillTreeNode {
  path: string;
  name: string;
  kind: "directory" | "file";
  modifiedAt: string;
  bytes?: number;
  fileCount?: number;
  skillName?: string;
  children?: SkillTreeNode[];
}

export interface SkillFileContent {
  path: string;
  name: string;
  bytes: number;
  modifiedAt: string;
  content: string;
  truncated: boolean;
  skillName?: string;
  description?: string;
}

export interface StateSignal {
  id: string;
  name: string;
  kind: string;
  judgment: string;
  observation: string;
  links: WikiLink[];
  score?: number;
  reason?: string;
}

export interface ConversationPrompt {
  id: string;
  title: string;
  question: string;
  currentUnderstanding: string;
  reason: string;
  unknown: string;
  observation?: string;
  links: WikiLink[];
  status: "active" | "paused" | "archived";
  weight: number;
}

export interface TodayView {
  currentStage?: WikiPageSummary;
  currentStages: Array<{
    page: WikiPageSummary;
    range: string;
    focus: string;
    lane: number;
  }>;
  latestLetter?: WikiPageSummary;
  latestEvent?: WikiPageSummary;
  stateSignals: StateSignal[];
  focusCandidates: StateSignal[];
  conversationPrompts: ConversationPrompt[];
  focusPages: WikiPageSummary[];
  recentPages: WikiPageSummary[];
  guidingQuestion?: string;
}

export interface FocusEvidenceEvent {
  date: string;
  label: string;
  excerpt: string;
  kind: "source" | "letter" | "event" | "wiki";
  page: WikiPageSummary;
}

export interface FocusWorkspaceView {
  signal: StateSignal;
  candidates: StateSignal[];
  related: Array<{
    category: PageCategory;
    label: string;
    pages: WikiPageSummary[];
  }>;
  evidenceTimeline: FocusEvidenceEvent[];
  graph: GraphData;
}

export interface TimelineItem {
  id: string;
  title: string;
  kind: "stage" | "event";
  start?: string;
  end?: string;
  excerpt: string;
}

export interface LifeStageView {
  page: WikiPageSummary;
  range: string;
  focus: string;
  lane: number;
  order: number;
  current: boolean;
  representative?: WikiPageSummary;
  relatedEvents: WikiPageSummary[];
  relatedPeople: WikiPageSummary[];
  relatedPlaces: WikiPageSummary[];
  relatedSystems: WikiPageSummary[];
  relatedLetters: WikiPageSummary[];
}

export interface LifeMapView {
  overview?: WikiPageSummary;
  stages: LifeStageView[];
  events: WikiPageSummary[];
}

export interface StructuredCard {
  id: string;
  title: string;
  excerpt: string;
  updatedAt?: string;
  sections: Array<{ heading: string; body: string }>;
}

export interface PersonGroup {
  name: string;
  people: PersonInsight[];
}

export interface PersonInsight extends WikiPageSummary {
  mentionCount: number;
  lastMention?: string;
  relatedStages: WikiPageSummary[];
  relatedRoles: WikiPageSummary[];
  relatedSystems: WikiPageSummary[];
}

export interface RelationshipsView {
  roles: StructuredCard[];
  groups: PersonGroup[];
  totalPeople: number;
}

export interface SectionedPageView {
  page: WikiPage;
  sections: PageSection[];
}

export interface QuoteEntry {
  title: string;
  quote: string;
  source: string;
  identity: string;
  usage: string;
  confirmed: boolean;
}

export interface QuoteGroup {
  title: string;
  entries: QuoteEntry[];
}

export interface QuotesView {
  page: WikiPage;
  groups: QuoteGroup[];
}

export interface GraphData {
  focusId?: string;
  nodes: Array<{ id: string; title: string; category: PageCategory; degree?: number; distance?: number }>;
  links: Array<{ source: string; target: string }>;
}

export interface LetterViewItem {
  page: WikiPageSummary;
  letterDate: string;
  evidenceFrom?: string;
  evidenceTo?: string;
  themes: WikiPageSummary[];
}

export interface LetterThread {
  id: string;
  title: string;
  category: PageCategory | "uncategorized";
  letters: string[];
  latestDate: string;
}

export interface LettersView {
  letters: LetterViewItem[];
  threads: LetterThread[];
  years: string[];
}

export type RunStatus =
  | "preparing"
  | "running"
  | "waiting-approval"
  | "validating"
  | "completed"
  | "failed"
  | "interrupted";

export interface RunEvent {
  id: string;
  at: string;
  kind: string;
  method?: string;
  message?: string;
  payload?: unknown;
}

export interface RunFileChange {
  path: string;
  kind: "added" | "modified" | "deleted";
  diff?: string;
}

export type AgentRuntimeId = "codex" | "pi";
export type AgentRuntimePreference = AgentRuntimeId | "auto";
export type AgentReasoningEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type AgentProviderProtocol = "openai-completions" | "openai-responses" | "anthropic-messages";

export interface AgentProviderModelConfig {
  id: string;
  displayName: string;
  reasoning: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportedReasoningEfforts?: AgentReasoningEffort[];
  defaultReasoningEffort?: AgentReasoningEffort;
}

export interface AgentProviderConfig {
  id: string;
  name?: string;
  protocol: AgentProviderProtocol;
  baseUrl: string;
  apiKeyEnv?: string;
  models: AgentProviderModelConfig[];
}

export interface AgentRuntimeConfig {
  defaultRuntime: AgentRuntimePreference;
  runtimes: {
    codex: {
      enabled: boolean;
      command: string;
      transport: "stdio";
    };
    pi: {
      enabled: boolean;
      providers: AgentProviderConfig[];
    };
  };
}

export interface AgentModelOption {
  runtimeId: AgentRuntimeId;
  id: string;
  provider?: string;
  providerDisplayName?: string;
  displayName: string;
  description?: string;
  supportedReasoningEfforts: AgentReasoningEffort[];
  defaultReasoningEffort?: AgentReasoningEffort;
}

export interface AgentRuntimeDescriptor {
  id: AgentRuntimeId;
  displayName: string;
  available: boolean;
  reason?: string;
  models: AgentModelOption[];
}

export interface AgentProviderPreset {
  id: string;
  displayName: string;
  description: string;
  models: Array<{
    id: string;
    displayName: string;
    description?: string;
    supportedReasoningEfforts: AgentReasoningEffort[];
    defaultReasoningEffort: AgentReasoningEffort;
  }>;
}

export interface AgentGlobalSettings {
  runtimeId: AgentRuntimeId;
  codex: {
    model: string;
    effort: AgentReasoningEffort;
  };
  thirdParty: {
    providerId: string;
    model: string;
    effort: AgentReasoningEffort;
    apiKeyConfigured: boolean;
    apiKeyConfiguredProviders: string[];
    ready: boolean;
  };
}

export interface UpdateAgentGlobalSettings {
  runtimeId: AgentRuntimeId;
  codex: {
    model: string;
    effort: AgentReasoningEffort;
  };
  thirdParty: {
    providerId: string;
    model: string;
    effort: AgentReasoningEffort;
    apiKey?: string;
    clearApiKey?: boolean;
  };
}

export type AgentApprovalDecision = "allow-once" | "allow-for-session" | "deny" | "cancel";

export interface ApprovalRequest {
  requestId: number | string;
  runtimeId: AgentRuntimeId;
  operation: "command" | "file-write" | "network" | "tool";
  title: string;
  detail?: string;
  method?: string;
  params?: Record<string, unknown>;
}

export type AgentRuntimeEvent =
  | { type: "turn.started"; sessionId: string; turnId: string }
  | { type: "assistant.message"; text: string; final: boolean }
  | { type: "tool.started"; callId: string; toolName: string; summary?: string }
  | { type: "tool.completed"; callId: string; toolName: string; success: boolean; summary?: string }
  | { type: "approval.requested"; approval: ApprovalRequest }
  | { type: "turn.completed"; outcome: "completed" | "failed" | "interrupted"; finalAnswer?: string; error?: string }
  | { type: "diagnostic"; level: "info" | "warning" | "error"; message: string };

export interface AgentRunResult {
  finalAnswer?: string;
  completedAt?: string;
}

export interface LetterVersionOutputTarget {
  kind: "letter-version";
  pageId: string;
  lensId: string;
  lensName: string;
  label: string;
}

export type AgentOutputTarget = LetterVersionOutputTarget;

export interface WikiRun {
  id: string;
  knowledgeBaseId: string;
  configSnapshot: VaultConfig;
  title: string;
  prompt: string;
  displayPrompt?: string;
  runtimeId?: AgentRuntimeId;
  runtimeSessionId?: string;
  runtimeTurnId?: string;
  provider?: string;
  model?: string;
  effort?: AgentReasoningEffort;
  outputTarget?: AgentOutputTarget;
  recoveredFromLegacyWorkspace?: boolean;
  mode: "auto" | "read" | "write" | "validate";
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  result?: AgentRunResult;
  error?: string;
  events: RunEvent[];
  approvals: ApprovalRequest[];
  changes: RunFileChange[];
  validation?: Array<{
    command: string[];
    exitCode: number | null;
    output: string;
  }>;
}
