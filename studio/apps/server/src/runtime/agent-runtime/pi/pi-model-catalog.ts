import type { AgentModelOption, AgentProviderConfig, AgentReasoningEffort } from "@the-way-here/shared";
import {
  createModels,
  createProvider,
  getSupportedThinkingLevels,
  type Api,
  type Model,
  type MutableModels,
  type ProviderAuth,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import * as anthropicMessages from "@earendil-works/pi-ai/api/anthropic-messages";
import * as openaiCompletions from "@earendil-works/pi-ai/api/openai-completions";
import * as openaiResponses from "@earendil-works/pi-ai/api/openai-responses";

const streams: Record<AgentProviderConfig["protocol"], ProviderStreams> = {
  "anthropic-messages": anthropicMessages,
  "openai-completions": openaiCompletions,
  "openai-responses": openaiResponses,
};

export type PiModelConfig = AgentProviderConfig["models"][number] & {
  thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
  compat?: Model<Api>["compat"];
};

export type PiProviderConfig = Omit<AgentProviderConfig, "models"> & {
  apiKey?: string;
  models: PiModelConfig[];
};

export class PiModelCatalog {
  readonly models: MutableModels;

  constructor(readonly providers: PiProviderConfig[]) {
    this.models = createModels();
    for (const provider of providers) this.models.setProvider(createPiProvider(provider));
  }

  async list(): Promise<AgentModelOption[]> {
    const available = await this.models.getAvailable();
    return available.map((model) => ({
      runtimeId: "pi" as const,
      id: opaqueModelId(model.provider, model.id),
      provider: model.provider,
      providerDisplayName: this.providers.find((provider) => provider.id === model.provider)?.name || model.provider,
      displayName: model.name,
      supportedReasoningEfforts: this.modelConfig(model)?.supportedReasoningEfforts
        || getSupportedThinkingLevels(model) as AgentReasoningEffort[],
      defaultReasoningEffort: this.modelConfig(model)?.defaultReasoningEffort || (model.reasoning ? "medium" : "off"),
    }));
  }

  get(opaqueId: string): Model<Api> | undefined {
    const separator = opaqueId.indexOf("/");
    if (separator < 1) return undefined;
    return this.models.getModel(opaqueId.slice(0, separator), opaqueId.slice(separator + 1));
  }

  private modelConfig(model: Model<Api>) {
    return this.providers.find((provider) => provider.id === model.provider)?.models.find((entry) => entry.id === model.id);
  }
}

function opaqueModelId(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function createPiProvider(config: PiProviderConfig) {
  const auth: ProviderAuth = {
    apiKey: {
      name: config.apiKey || config.apiKeyEnv ? `${config.name || config.id} API key` : `${config.name || config.id} local endpoint`,
      check: async ({ ctx }) => {
        if (config.apiKey) return { type: "api_key", source: "全局 Agent 设置" };
        if (!config.apiKeyEnv) return { type: "api_key", source: "无需密钥" };
        return await ctx.env(config.apiKeyEnv) ? { type: "api_key", source: config.apiKeyEnv } : undefined;
      },
      resolve: async ({ ctx }) => {
        const apiKey = config.apiKey || (config.apiKeyEnv ? await ctx.env(config.apiKeyEnv) : "local-endpoint");
        return apiKey ? { auth: { apiKey }, source: config.apiKey ? "全局 Agent 设置" : config.apiKeyEnv || "无需密钥" } : undefined;
      },
    },
  };
  const models: Model<Api>[] = config.models.map((model) => ({
    id: model.id,
    name: model.displayName,
    api: config.protocol,
    provider: config.id,
    baseUrl: config.baseUrl,
    reasoning: model.reasoning,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: model.maxOutputTokens,
    thinkingLevelMap: model.thinkingLevelMap,
    compat: model.compat,
  } as Model<Api>));
  return createProvider({
    id: config.id,
    name: config.name || config.id,
    baseUrl: config.baseUrl,
    auth,
    models,
    api: streams[config.protocol],
  });
}
