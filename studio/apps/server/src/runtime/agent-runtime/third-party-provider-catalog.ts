import type {
  AgentProviderPreset,
  AgentProviderProtocol,
  AgentReasoningEffort,
} from "@the-way-here/shared";
import type { PiModelConfig, PiProviderConfig } from "./pi/pi-model-catalog.js";

const runtimeProviderId = "global-third-party";

type ProviderDefinition = {
  id: string;
  displayName: string;
  description: string;
  protocol: AgentProviderProtocol;
  baseUrl: string;
  models: Array<PiModelConfig & {
    supportedReasoningEfforts: AgentReasoningEffort[];
    defaultReasoningEffort: AgentReasoningEffort;
    description?: string;
  }>;
};

const providers: ProviderDefinition[] = [
  {
    id: "deepseek",
    displayName: "DeepSeek",
    description: "深度求索官方 API",
    protocol: "openai-completions",
    baseUrl: "https://api.deepseek.com",
    models: [
      model("deepseek-v4-pro", "DeepSeek V4 Pro", "旗舰推理与 Agent", 1_000_000, 384_000, ["off", "low", "medium", "high", "max"], "high"),
      model("deepseek-v4-flash", "DeepSeek V4 Flash", "更快、更经济", 1_000_000, 384_000, ["off", "low", "medium", "high", "max"], "medium"),
    ],
  },
  {
    id: "zhipu",
    displayName: "智谱 GLM",
    description: "智谱 BigModel 官方 API",
    protocol: "openai-completions",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      model("glm-5.2", "GLM-5.2", "旗舰长程 Agent", 1_000_000, 128_000, ["off", "low", "medium", "high", "max"], "high", { compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true } }),
      model("glm-5.1", "GLM-5.1", "复杂工程与长任务", 200_000, 128_000, ["off", "low", "medium", "high", "max"], "high", { compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true } }),
      model("glm-4.7-flash", "GLM-4.7 Flash", "快速、低成本", 200_000, 128_000, ["off", "high"], "high", { compat: { thinkingFormat: "zai" } }),
    ],
  },
  {
    id: "qwen",
    displayName: "阿里云千问",
    description: "阿里云百炼官方 API · 中国站",
    protocol: "openai-completions",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      model("qwen3.8-max", "Qwen 3.8 Max", "旗舰通用模型", 1_000_000, 128_000, ["off", "high"], "high", { compat: { thinkingFormat: "qwen" } }),
      model("qwen3.7-plus", "Qwen 3.7 Plus", "均衡能力与成本", 1_000_000, 128_000, ["off", "high"], "high", { compat: { thinkingFormat: "qwen" } }),
      model("qwen3.6-flash", "Qwen 3.6 Flash", "高速度、低延迟", 1_000_000, 64_000, ["off", "high"], "off", { compat: { thinkingFormat: "qwen" } }),
    ],
  },
  {
    id: "kimi",
    displayName: "Kimi",
    description: "Moonshot AI 官方 API",
    protocol: "openai-completions",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      model("kimi-k3", "Kimi K3", "旗舰长程编程与知识工作", 1_000_000, 128_000, ["low", "high", "max"], "max"),
      model("kimi-k2.7-code-highspeed", "Kimi K2.7 Code Highspeed", "高速编程 Agent", 256_000, 128_000, ["high"], "high"),
      model("kimi-k2.6", "Kimi K2.6", "通用多模态与 Agent", 256_000, 128_000, ["off", "high"], "high"),
    ],
  },
  {
    id: "minimax",
    displayName: "MiniMax",
    description: "MiniMax 开放平台官方 API",
    protocol: "openai-completions",
    baseUrl: "https://api.minimaxi.com/v1",
    models: [
      model("MiniMax-M2.7", "MiniMax M2.7", "复杂任务与 Agent", 204_800, 128_000, ["high"], "high"),
      model("MiniMax-M2.7-highspeed", "MiniMax M2.7 Highspeed", "同等能力、更高速度", 204_800, 128_000, ["high"], "high"),
      model("MiniMax-M2.5", "MiniMax M2.5", "高性价比推理", 204_800, 128_000, ["high"], "high"),
    ],
  },
  {
    id: "openai",
    displayName: "OpenAI",
    description: "OpenAI 官方 API",
    protocol: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    models: [
      model("gpt-5.5", "GPT-5.5", "旗舰推理与编程", 1_000_000, 128_000, ["off", "low", "medium", "high", "xhigh"], "high"),
      model("gpt-5.4", "GPT-5.4", "专业工作与编程", 1_050_000, 128_000, ["off", "low", "medium", "high", "xhigh"], "medium"),
      model("gpt-5.4-mini", "GPT-5.4 Mini", "更快、更经济", 400_000, 128_000, ["off", "low", "medium", "high", "xhigh"], "medium"),
    ],
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    description: "Claude 官方 API",
    protocol: "anthropic-messages",
    baseUrl: "https://api.anthropic.com",
    models: [
      model("claude-fable-5", "Claude Fable 5", "最高能力长程 Agent", 1_000_000, 128_000, ["low", "medium", "high", "max"], "high"),
      model("claude-opus-5", "Claude Opus 5", "复杂编程与企业任务", 1_000_000, 128_000, ["low", "medium", "high", "max"], "high"),
      model("claude-sonnet-5", "Claude Sonnet 5", "速度与能力均衡", 1_000_000, 128_000, ["low", "medium", "high"], "medium"),
    ],
  },
];

export function listThirdPartyProviderPresets(): AgentProviderPreset[] {
  return providers.map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    description: provider.description,
    models: provider.models.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      description: entry.description,
      supportedReasoningEfforts: [...entry.supportedReasoningEfforts],
      defaultReasoningEffort: entry.defaultReasoningEffort,
    })),
  }));
}

export function defaultThirdPartySelection(): { providerId: string; model: string; effort: AgentReasoningEffort } {
  const provider = providers[0]!;
  const selectedModel = provider.models[0]!;
  return { providerId: provider.id, model: selectedModel.id, effort: selectedModel.defaultReasoningEffort };
}

export function findThirdPartySelection(providerId: string, modelId: string) {
  const provider = providers.find((entry) => entry.id === providerId);
  const selectedModel = provider?.models.find((entry) => entry.id === modelId);
  return provider && selectedModel ? { provider, model: selectedModel } : undefined;
}

export function hasThirdPartyProvider(providerId: string): boolean {
  return providers.some((provider) => provider.id === providerId);
}

export function inferThirdPartySelection(protocol: AgentProviderProtocol, baseUrl: string, modelId: string) {
  const normalizedUrl = baseUrl.replace(/\/$/, "");
  const exact = providers.find((provider) => provider.protocol === protocol && provider.baseUrl === normalizedUrl && provider.models.some((entry) => entry.id === modelId));
  const provider = exact || providers.find((entry) => entry.protocol === protocol && entry.baseUrl === normalizedUrl);
  const selectedModel = provider?.models.find((entry) => entry.id === modelId) || provider?.models[0];
  return provider && selectedModel
    ? { providerId: provider.id, model: selectedModel.id, effort: selectedModel.defaultReasoningEffort }
    : defaultThirdPartySelection();
}

export function piProviderFromPreset(providerId: string, modelId: string, apiKey: string): PiProviderConfig | undefined {
  const selection = findThirdPartySelection(providerId, modelId);
  if (!selection) return undefined;
  const { provider, model: selectedModel } = selection;
  return {
    id: runtimeProviderId,
    name: provider.displayName,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey,
    models: [{ ...selectedModel }],
  };
}

function model(
  id: string,
  displayName: string,
  description: string,
  contextWindow: number,
  maxOutputTokens: number,
  supportedReasoningEfforts: AgentReasoningEffort[],
  defaultReasoningEffort: AgentReasoningEffort,
  pi: Pick<PiModelConfig, "compat" | "thinkingLevelMap"> = {},
): ProviderDefinition["models"][number] {
  return {
    id,
    displayName,
    description,
    reasoning: supportedReasoningEfforts.some((entry) => entry !== "off"),
    contextWindow,
    maxOutputTokens,
    supportedReasoningEfforts,
    defaultReasoningEffort,
    ...pi,
  };
}
