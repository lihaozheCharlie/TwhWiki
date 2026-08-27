import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRootForVault } from "@the-way-here/run-manager";
import type {
  AgentGlobalSettings,
  AgentProviderProtocol,
  AgentReasoningEffort,
  AgentRuntimeConfig,
  UpdateAgentGlobalSettings,
} from "@the-way-here/shared";
import type { PiProviderConfig } from "./pi/pi-model-catalog.js";
import {
  defaultThirdPartySelection,
  findThirdPartySelection,
  hasThirdPartyProvider,
  inferThirdPartySelection,
  piProviderFromPreset,
} from "./third-party-provider-catalog.js";

const settingsVersion = 2;
const efforts = new Set<AgentReasoningEffort>(["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

type StoredAgentSettings = {
  version: 2;
  runtimeId: "codex" | "pi";
  codex: {
    model: string;
    effort: AgentReasoningEffort;
  };
  thirdParty: {
    providerId: string;
    model: string;
    effort: AgentReasoningEffort;
    apiKeys: Record<string, string>;
  };
};

type LegacyAgentSettings = {
  version: 1;
  runtimeId?: unknown;
  codex?: unknown;
  thirdParty?: unknown;
};

export type AgentSettingsSnapshot = {
  public: AgentGlobalSettings;
  provider?: PiProviderConfig;
};

export class AgentSettingsValidationError extends Error {}

export class AgentSettingsStore {
  private readonly filePath: string;
  private loaded?: StoredAgentSettings;

  constructor(
    private readonly config: AgentRuntimeConfig,
    vaultRoot: string,
    stateRoot = stateRootForVault(vaultRoot),
  ) {
    this.filePath = path.join(stateRoot, "agent-settings.json");
  }

  async load(): Promise<AgentSettingsSnapshot> {
    if (!this.loaded) this.loaded = await this.readStored();
    return snapshotOf(this.loaded);
  }

  async update(input: UpdateAgentGlobalSettings): Promise<AgentSettingsSnapshot> {
    const current = this.loaded || await this.readStored();
    const next = normalizeUpdate(input, current);
    await atomicWrite(this.filePath, next);
    this.loaded = next;
    return snapshotOf(next);
  }

  private async readStored(): Promise<StoredAgentSettings> {
    try {
      return normalizeStored(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error: any) {
      if (error?.code === "ENOENT") return defaultsFrom(this.config);
      if (error instanceof AgentSettingsValidationError) throw error;
      throw new Error(`全局 Agent 设置无法读取：${error.message || String(error)}`);
    }
  }
}

function defaultsFrom(config: AgentRuntimeConfig): StoredAgentSettings {
  const configured = config.runtimes.pi.providers[0];
  const configuredModel = configured?.models[0];
  const selection = configured && configuredModel
    ? inferThirdPartySelection(configured.protocol, configured.baseUrl, configuredModel.id)
    : defaultThirdPartySelection();
  const configuredKey = configured?.apiKeyEnv ? process.env[configured.apiKeyEnv] : undefined;
  return {
    version: settingsVersion,
    runtimeId: config.defaultRuntime === "pi" ? "pi" : "codex",
    codex: { model: "", effort: "high" },
    thirdParty: {
      ...selection,
      apiKeys: configuredKey ? { [selection.providerId]: configuredKey } : {},
    },
  };
}

function normalizeStored(value: unknown): StoredAgentSettings {
  if (!isRecord(value)) throw new AgentSettingsValidationError("全局 Agent 设置无效");
  if (value.version === 1) return migrateLegacy(value as LegacyAgentSettings);
  if (value.version !== settingsVersion) throw new AgentSettingsValidationError("全局 Agent 设置版本无效");
  const runtimeId = runtime(value.runtimeId);
  const codex = isRecord(value.codex) ? value.codex : {};
  const thirdParty = isRecord(value.thirdParty) ? value.thirdParty : {};
  const selection = validateSelection(thirdParty.providerId, thirdParty.model, thirdParty.effort);
  return {
    version: settingsVersion,
    runtimeId,
    codex: {
      model: text(codex.model, "Codex 模型", false),
      effort: effort(codex.effort, "Codex 思考深度"),
    },
    thirdParty: { ...selection, apiKeys: apiKeys(thirdParty.apiKeys) },
  };
}

function migrateLegacy(value: LegacyAgentSettings): StoredAgentSettings {
  const codex = isRecord(value.codex) ? value.codex : {};
  const thirdParty = isRecord(value.thirdParty) ? value.thirdParty : {};
  const selection = inferThirdPartySelection(
    legacyProtocol(thirdParty.protocol),
    typeof thirdParty.baseUrl === "string" ? thirdParty.baseUrl.trim() : "",
    typeof thirdParty.model === "string" ? thirdParty.model.trim() : "",
  );
  const legacyKey = secret(thirdParty.apiKey);
  return {
    version: settingsVersion,
    runtimeId: runtime(value.runtimeId),
    codex: {
      model: text(codex.model, "Codex 模型", false),
      effort: effort(codex.effort, "Codex 思考深度"),
    },
    thirdParty: {
      ...selection,
      apiKeys: legacyKey ? { [selection.providerId]: legacyKey } : {},
    },
  };
}

function normalizeUpdate(input: UpdateAgentGlobalSettings, current: StoredAgentSettings): StoredAgentSettings {
  const raw: unknown = input;
  if (!isRecord(raw)) throw new AgentSettingsValidationError("Agent 设置必须是对象");
  const codex: Record<string, unknown> = isRecord(raw.codex) ? raw.codex : {};
  const thirdParty: Record<string, unknown> = isRecord(raw.thirdParty) ? raw.thirdParty : {};
  const runtimeId = runtime(raw.runtimeId);
  const selection = validateSelection(thirdParty.providerId, thirdParty.model, thirdParty.effort);
  const nextKeys = { ...current.thirdParty.apiKeys };
  if (thirdParty.clearApiKey) delete nextKeys[selection.providerId];
  const nextKey = secret(thirdParty.apiKey);
  if (nextKey) nextKeys[selection.providerId] = nextKey;
  if (runtimeId === "pi" && !nextKeys[selection.providerId]) {
    const providerName = findThirdPartySelection(selection.providerId, selection.model)?.provider.displayName || "模型厂商";
    throw new AgentSettingsValidationError(`请填写 ${providerName} API Key`);
  }
  return {
    version: settingsVersion,
    runtimeId,
    codex: {
      model: text(codex.model, "Codex 模型", runtimeId === "codex"),
      effort: effort(codex.effort, "Codex 思考深度"),
    },
    thirdParty: { ...selection, apiKeys: nextKeys },
  };
}

function snapshotOf(stored: StoredAgentSettings): AgentSettingsSnapshot {
  const apiKey = stored.thirdParty.apiKeys[stored.thirdParty.providerId];
  const ready = Boolean(apiKey && findThirdPartySelection(stored.thirdParty.providerId, stored.thirdParty.model));
  return {
    public: {
      runtimeId: stored.runtimeId,
      codex: { ...stored.codex },
      thirdParty: {
        providerId: stored.thirdParty.providerId,
        model: stored.thirdParty.model,
        effort: stored.thirdParty.effort,
        apiKeyConfigured: Boolean(apiKey),
        apiKeyConfiguredProviders: Object.keys(stored.thirdParty.apiKeys).filter((providerId) => Boolean(stored.thirdParty.apiKeys[providerId])),
        ready,
      },
    },
    provider: ready ? piProviderFromPreset(stored.thirdParty.providerId, stored.thirdParty.model, apiKey!) : undefined,
  };
}

function validateSelection(providerValue: unknown, modelValue: unknown, effortValue: unknown) {
  const providerId = text(providerValue, "模型厂商", true);
  const modelId = text(modelValue, "模型", true);
  const selectedEffort = effort(effortValue, "第三方模型思考深度");
  const selection = findThirdPartySelection(providerId, modelId);
  if (!selection) throw new AgentSettingsValidationError("模型厂商或模型不受支持，请重新选择");
  if (!selection.model.supportedReasoningEfforts.includes(selectedEffort)) {
    throw new AgentSettingsValidationError(`${selection.model.displayName} 不支持所选思考深度`);
  }
  return { providerId, model: modelId, effort: selectedEffort };
}

function runtime(value: unknown): "codex" | "pi" {
  if (value === "codex" || value === "pi") return value;
  throw new AgentSettingsValidationError("运行方式必须是 Codex 或第三方模型");
}

function effort(value: unknown, label: string): AgentReasoningEffort {
  if (efforts.has(value as AgentReasoningEffort)) return value as AgentReasoningEffort;
  throw new AgentSettingsValidationError(`${label}无效`);
}

function legacyProtocol(value: unknown): AgentProviderProtocol {
  if (value === "openai-responses" || value === "anthropic-messages") return value;
  return "openai-completions";
}

function text(value: unknown, label: string, required: boolean): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new AgentSettingsValidationError(`${label}不能为空`);
  if (normalized.length > 240) throw new AgentSettingsValidationError(`${label}过长`);
  return normalized;
}

function apiKeys(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new AgentSettingsValidationError("模型密钥设置无效");
  return Object.fromEntries(Object.entries(value).flatMap(([providerId, raw]) => {
    const key = secret(raw);
    return key && hasThirdPartyProvider(providerId) ? [[providerId, key]] : [];
  }));
}

function secret(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AgentSettingsValidationError("API Key 必须是字符串");
  const normalized = value.trim();
  if (normalized.length > 8_192) throw new AgentSettingsValidationError("API Key 过长");
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function atomicWrite(filePath: string, value: StoredAgentSettings): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}
