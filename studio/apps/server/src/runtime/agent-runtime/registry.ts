import type {
  AgentGlobalSettings,
  AgentModelOption,
  AgentProviderPreset,
  AgentReasoningEffort,
  AgentRuntimeDescriptor,
  AgentRuntimeId,
  AgentRuntimePreference,
  UpdateAgentGlobalSettings,
  VaultConfig,
} from "@the-way-here/shared";
import { AgentSettingsStore, AgentSettingsValidationError, type AgentSettingsSnapshot } from "./agent-settings-store.js";
import { CodexRuntimeAdapter } from "./codex-runtime-adapter.js";
import { PiRuntimeAdapter } from "./pi/pi-runtime-adapter.js";
import { listThirdPartyProviderPresets } from "./third-party-provider-catalog.js";
import type { AgentRuntime, AgentRuntimeEnvelope } from "./types.js";

export interface ResolvedAgentSelection {
  runtime: AgentRuntime;
  runtimeId: AgentRuntimeId;
  model: AgentModelOption;
  effort: AgentReasoningEffort;
}

export interface AgentRuntimeProvider {
  catalog(): Promise<AgentRuntimeDescriptor[]>;
  providerPresets(): AgentProviderPreset[];
  settings(): AgentGlobalSettings;
  updateSettings(input: UpdateAgentGlobalSettings): Promise<AgentGlobalSettings>;
  resolve(preference: AgentRuntimePreference | undefined, requestedModel: string | undefined, requestedEffort: AgentReasoningEffort | undefined): Promise<ResolvedAgentSelection>;
  require(id: AgentRuntimeId): AgentRuntime;
  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void;
  close(): void;
}

export class AgentRuntimeRegistry implements AgentRuntimeProvider {
  private readonly runtimes = new Map<AgentRuntimeId, AgentRuntime>();
  private readonly listeners = new Set<(envelope: AgentRuntimeEnvelope) => void>();
  private readonly enabled: Record<AgentRuntimeId, boolean>;
  private readonly pi: PiRuntimeAdapter;
  private catalogPromise?: Promise<AgentRuntimeDescriptor[]>;

  private constructor(
    config: VaultConfig["agents"],
    private readonly settingsStore: AgentSettingsStore,
    private globalSettings: AgentSettingsSnapshot,
    vaultRoot: string,
  ) {
    this.enabled = {
      codex: config.runtimes.codex.enabled,
      pi: config.runtimes.pi.enabled,
    };
    this.pi = new PiRuntimeAdapter(vaultRoot, config.runtimes.pi.enabled, globalSettings.provider ? [globalSettings.provider] : []);
    this.register(new CodexRuntimeAdapter(config.runtimes.codex.command));
    this.register(this.pi);
  }

  static async create(config: VaultConfig["agents"], vaultRoot: string): Promise<AgentRuntimeRegistry> {
    const settingsStore = new AgentSettingsStore(config, vaultRoot);
    const settings = await settingsStore.load();
    return new AgentRuntimeRegistry(config, settingsStore, settings, vaultRoot);
  }

  async catalog(): Promise<AgentRuntimeDescriptor[]> {
    this.catalogPromise ||= Promise.all([...this.runtimes.values()].map(async (runtime): Promise<AgentRuntimeDescriptor> => {
      if (!this.enabled[runtime.id]) return { id: runtime.id, displayName: runtime.id === "codex" ? "Codex" : "自定义模型", available: false, reason: "运行时未启用", models: [] };
      try {
        return await runtime.inspect();
      } catch (error: any) {
        return {
          id: runtime.id,
          displayName: runtime.id === "codex" ? "Codex" : "自定义模型",
          available: false,
          reason: error.message || "运行时初始化失败",
          models: [],
        };
      }
    }));
    return this.catalogPromise;
  }

  settings(): AgentGlobalSettings {
    return this.globalSettings.public;
  }

  providerPresets(): AgentProviderPreset[] {
    return listThirdPartyProviderPresets();
  }

  async updateSettings(input: UpdateAgentGlobalSettings): Promise<AgentGlobalSettings> {
    if (input.runtimeId === "pi" && !this.enabled.pi) throw new AgentSettingsValidationError("此工作区未启用第三方模型运行方式");
    const next = await this.settingsStore.update(input);
    this.globalSettings = next;
    this.pi.configure(this.enabled.pi, next.provider ? [next.provider] : []);
    this.catalogPromise = undefined;
    return next.public;
  }

  async resolve(preference: AgentRuntimePreference | undefined, requestedModel: string | undefined, requestedEffort: AgentReasoningEffort | undefined): Promise<ResolvedAgentSelection> {
    const catalog = await this.catalog();
    const available = catalog.filter((runtime) => runtime.available && runtime.models.length);
    const preferredRuntime = preference && preference !== "auto" ? preference : this.globalSettings.public.runtimeId;
    let descriptor = available.find((entry) => entry.id === preferredRuntime);
    let model: AgentModelOption | undefined;
    if (!descriptor && requestedModel) {
      descriptor = available.find((entry) => entry.models.some((candidate) => candidate.id === requestedModel));
    }
    if (!descriptor) throw new Error(`${preferredRuntime === "codex" ? "Codex" : "第三方模型"}当前不可用，请先完成全局 AI 设置`);
    const configuredModel = descriptor.id === "codex"
      ? this.globalSettings.public.codex.model
      : this.globalSettings.public.thirdParty.model;
    if (requestedModel) {
      model = descriptor.models.find((entry) => entry.id === requestedModel);
      if (!model) throw new Error(`${descriptor.displayName} 中不存在模型：${requestedModel}`);
    } else {
      model = descriptor.models.find((entry) => entry.id === configuredModel || entry.id.endsWith(`/${configuredModel}`));
    }
    model ||= descriptor.models[0];
    if (!model) throw new Error(`${descriptor.displayName} 没有可用模型`);
    const supported = model.supportedReasoningEfforts.length ? model.supportedReasoningEfforts : ["off" as const];
    const configuredEffort = descriptor.id === "codex" ? this.globalSettings.public.codex.effort : this.globalSettings.public.thirdParty.effort;
    const effort = (requestedEffort || configuredEffort) && supported.includes(requestedEffort || configuredEffort)
      ? requestedEffort || configuredEffort
      : model.defaultReasoningEffort && supported.includes(model.defaultReasoningEffort)
        ? model.defaultReasoningEffort
        : supported.includes("high") ? "high" : supported[0]!;
    return { runtime: this.require(descriptor.id), runtimeId: descriptor.id, model, effort };
  }

  require(id: AgentRuntimeId): AgentRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Agent 运行时不存在：${id}`);
    return runtime;
  }

  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    for (const runtime of this.runtimes.values()) runtime.close();
    this.listeners.clear();
  }

  private register(runtime: AgentRuntime): void {
    this.runtimes.set(runtime.id, runtime);
    runtime.subscribe((envelope) => {
      for (const listener of this.listeners) listener(envelope);
    });
  }
}
