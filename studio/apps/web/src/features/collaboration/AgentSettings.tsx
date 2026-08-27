import { useEffect, useState } from "react";
import type {
  AgentGlobalSettings,
  AgentModelOption,
  AgentProviderPreset,
  AgentReasoningEffort,
  AgentRuntimeDescriptor,
  AgentRuntimeId,
  UpdateAgentGlobalSettings,
} from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { Icon } from "../../shared/ui";

export const reasoningLabels: Record<AgentReasoningEffort, string> = {
  off: "关闭", minimal: "最少", low: "快速", medium: "标准", high: "深入", xhigh: "更深入", max: "最大", ultra: "极致",
};

const defaultAgentModel = "gpt-5.6-sol";
const fallbackProvider: AgentProviderPreset = {
  id: "deepseek",
  displayName: "DeepSeek",
  description: "深度求索官方 API",
  models: [{
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    description: "旗舰推理与 Agent",
    supportedReasoningEfforts: ["off", "low", "medium", "high", "max"],
    defaultReasoningEffort: "high",
  }],
};
const defaultSettings: AgentGlobalSettings = {
  runtimeId: "codex",
  codex: { model: defaultAgentModel, effort: "high" },
  thirdParty: {
    providerId: fallbackProvider.id,
    model: fallbackProvider.models[0]!.id,
    effort: fallbackProvider.models[0]!.defaultReasoningEffort,
    apiKeyConfigured: false,
    apiKeyConfiguredProviders: [],
    ready: false,
  },
};

const fallbackRuntime: AgentRuntimeDescriptor = {
  id: "codex",
  displayName: "Codex",
  available: true,
  models: [{ runtimeId: "codex", id: defaultAgentModel, displayName: "GPT-5.6-Sol", supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }],
};

export type AgentSelection = {
  runtimeId: AgentRuntimeId;
  model: string;
  effort: AgentReasoningEffort;
};

export type AgentSettingsController = ReturnType<typeof useAgentSelection>;

export function useAgentSelection(revision: number) {
  const { data: savedSettings, loading: settingsLoading, error: loadError } = useApi<AgentGlobalSettings>("/api/agent-settings", revision);
  const { data: catalog } = useApi<AgentRuntimeDescriptor[]>("/api/agent-runtimes", revision);
  const { data: loadedProviders, loading: providersLoading } = useApi<AgentProviderPreset[]>("/api/agent-provider-presets", revision);
  const runtimes = catalog?.length ? catalog : [fallbackRuntime];
  const providers = loadedProviders?.length ? loadedProviders : [fallbackProvider];
  const [draft, setDraft] = useState<AgentGlobalSettings>(defaultSettings);
  const [baseline, setBaseline] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!savedSettings) return;
    const signature = JSON.stringify(savedSettings);
    if (signature === baseline) return;
    setDraft(savedSettings);
    setBaseline(signature);
    setApiKey("");
    setClearApiKey(false);
    setError("");
  }, [baseline, savedSettings]);

  const codexRuntime = runtimes.find((entry) => entry.id === "codex") || fallbackRuntime;
  const codexModels = codexRuntime.models.length ? codexRuntime.models : fallbackRuntime.models;
  const selectedCodexModel = codexModels.find((entry) => entry.id === draft.codex.model) || codexModels[0]!;
  const codexEfforts = effortsOf(selectedCodexModel);
  const selectedProvider = providers.find((entry) => entry.id === draft.thirdParty.providerId) || providers[0]!;
  const selectedThirdPartyModel = selectedProvider.models.find((entry) => entry.id === draft.thirdParty.model) || selectedProvider.models[0]!;
  const thirdPartyEfforts = selectedThirdPartyModel.supportedReasoningEfforts;
  const savedKeyForProvider = draft.thirdParty.apiKeyConfiguredProviders.includes(selectedProvider.id);
  const configuredApiKey = !clearApiKey && (savedKeyForProvider || Boolean(apiKey));
  const dirty = Boolean(baseline) && (JSON.stringify(draft) !== baseline || Boolean(apiKey) || clearApiKey);

  function update(next: (current: AgentGlobalSettings) => AgentGlobalSettings) {
    setDraft(next);
    setSaved(false);
    setError("");
  }

  function selectRuntime(runtimeId: AgentRuntimeId) {
    update((current) => ({ ...current, runtimeId }));
  }

  function selectCodexModel(model: string) {
    const option = codexModels.find((entry) => entry.id === model) || selectedCodexModel;
    const supported = effortsOf(option);
    update((current) => ({
      ...current,
      codex: { model: option.id, effort: supported.includes(current.codex.effort) ? current.codex.effort : option.defaultReasoningEffort || supported[0]! },
    }));
  }

  function selectProvider(providerId: string) {
    const provider = providers.find((entry) => entry.id === providerId) || providers[0]!;
    const model = provider.models[0]!;
    setApiKey("");
    setClearApiKey(false);
    update((current) => ({
      ...current,
      thirdParty: { ...current.thirdParty, providerId: provider.id, model: model.id, effort: model.defaultReasoningEffort },
    }));
  }

  function selectThirdPartyModel(modelId: string) {
    const model = selectedProvider.models.find((entry) => entry.id === modelId) || selectedThirdPartyModel;
    update((current) => ({
      ...current,
      thirdParty: {
        ...current.thirdParty,
        model: model.id,
        effort: model.supportedReasoningEfforts.includes(current.thirdParty.effort)
          ? current.thirdParty.effort
          : model.defaultReasoningEffort,
      },
    }));
  }

  function selection(settings = draft): AgentSelection {
    if (settings.runtimeId === "codex") {
      const option = codexModels.find((entry) => entry.id === settings.codex.model) || codexModels[0]!;
      const supported = effortsOf(option);
      return { runtimeId: "codex", model: option.id, effort: supported.includes(settings.codex.effort) ? settings.codex.effort : supported[0]! };
    }
    return { runtimeId: "pi", model: `global-third-party/${settings.thirdParty.model}`, effort: settings.thirdParty.effort };
  }

  async function save(): Promise<AgentSelection> {
    if (!baseline) throw new Error(loadError || "正在读取全局 AI 设置");
    if (!dirty) return selection();
    setSaving(true);
    setError("");
    try {
      const payload: UpdateAgentGlobalSettings = {
        runtimeId: draft.runtimeId,
        codex: { ...draft.codex, model: selectedCodexModel.id },
        thirdParty: {
          providerId: selectedProvider.id,
          model: selectedThirdPartyModel.id,
          effort: thirdPartyEfforts.includes(draft.thirdParty.effort) ? draft.thirdParty.effort : selectedThirdPartyModel.defaultReasoningEffort,
          apiKey: apiKey || undefined,
          clearApiKey,
        },
      };
      const result = await api<AgentGlobalSettings>("/api/agent-settings", { method: "PUT", body: JSON.stringify(payload) });
      setDraft(result);
      setBaseline(JSON.stringify(result));
      setApiKey("");
      setClearApiKey(false);
      setSaved(true);
      return selection(result);
    } catch (reason: any) {
      setError(reason.message);
      throw reason;
    } finally {
      setSaving(false);
    }
  }

  const activeSelection = selection();
  return {
    draft,
    providers,
    selectedProvider,
    selectedThirdPartyModel,
    thirdPartyEfforts,
    loading: settingsLoading || providersLoading,
    saving,
    dirty,
    saved,
    error,
    loadError,
    apiKey,
    configuredApiKey,
    codexRuntime,
    codexModels,
    codexEfforts,
    runtimeId: activeSelection.runtimeId,
    model: activeSelection.model,
    effort: activeSelection.effort,
    providerDisplayName: selectedProvider.displayName,
    selectRuntime,
    selectCodexModel,
    selectProvider,
    selectThirdPartyModel,
    setCodexEffort: (effort: AgentReasoningEffort) => update((current) => ({ ...current, codex: { ...current.codex, effort } })),
    setThirdPartyEffort: (effort: AgentReasoningEffort) => update((current) => ({ ...current, thirdParty: { ...current.thirdParty, effort } })),
    setApiKey: (value: string) => { setApiKey(value); setClearApiKey(false); setSaved(false); setError(""); },
    removeApiKey: () => { setApiKey(""); setClearApiKey(true); setSaved(false); setError(""); },
    save,
  };
}

export function AiConfiguration({ id, agent }: { id: string; agent: AgentSettingsController }) {
  const { draft } = agent;
  const codexSelected = draft.runtimeId === "codex";

  return <fieldset className="ai-configuration">
    <legend><Icon name="controls" size={15} />全局 AI 设置</legend>
    <div className="ai-runtime-choices" role="radiogroup" aria-label="选择 Agent 运行方式">
      <button type="button" role="radio" aria-checked={codexSelected} className={codexSelected ? "active" : ""} onClick={() => agent.selectRuntime("codex")}>
        <span className="ai-runtime-mark"><Icon name="spark" size={16} /></span><span><b>Codex</b><small>使用本机 Codex 登录与模型能力</small></span><i>{agent.codexRuntime.available ? "已就绪" : "不可用"}</i>
      </button>
      <button type="button" role="radio" aria-checked={!codexSelected} className={!codexSelected ? "active" : ""} onClick={() => agent.selectRuntime("pi")}>
        <span className="ai-runtime-mark"><Icon name="controls" size={16} /></span><span><b>第三方模型</b><small>由 pi-agent 连接模型厂商官方服务</small></span><i>{agent.configuredApiKey ? "已配置" : "待配置"}</i>
      </button>
    </div>

    {codexSelected ? <div className="ai-config-fields ai-config-fields--codex">
      <div className="ai-config-intro"><b>Codex 自行管理模型服务</b><span>这里不需要填写 API Key 或选择服务商。</span></div>
      <label htmlFor={`${id}-codex-model`}><span>模型</span><select id={`${id}-codex-model`} value={agent.codexModels.some((entry) => entry.id === draft.codex.model) ? draft.codex.model : agent.codexModels[0]?.id} onChange={(event) => agent.selectCodexModel(event.target.value)}>{agent.codexModels.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
      <label htmlFor={`${id}-codex-effort`}><span>思考深度</span><select id={`${id}-codex-effort`} value={agent.codexEfforts.includes(draft.codex.effort) ? draft.codex.effort : agent.codexEfforts[0]} onChange={(event) => agent.setCodexEffort(event.target.value as AgentReasoningEffort)}>{agent.codexEfforts.map((entry) => <option key={entry} value={entry}>{reasoningLabels[entry]}</option>)}</select></label>
      {!agent.codexRuntime.available && <p className="ai-config-warning">{agent.codexRuntime.reason || "本机没有可用的 Codex。"}</p>}
    </div> : <div className="ai-config-fields ai-config-fields--third-party">
      <div className="ai-config-intro"><b>第三方请求由 pi-agent 执行</b><span>选择厂商即可使用官方服务地址，密钥只保存在本机。</span></div>
      <label className="wide" htmlFor={`${id}-provider`}><span>模型厂商</span><select id={`${id}-provider`} value={agent.selectedProvider.id} onChange={(event) => agent.selectProvider(event.target.value)}>{agent.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName} · {provider.description}</option>)}</select></label>
      <section className="wide ai-model-bundle" aria-labelledby={`${id}-model-bundle-label`}>
        <header><span id={`${id}-model-bundle-label`}>模型与思考</span><small>模型不同，可选的思考深度也不同</small></header>
        <div>
          <label htmlFor={`${id}-model`}><span>模型</span><select id={`${id}-model`} value={agent.selectedThirdPartyModel.id} onChange={(event) => agent.selectThirdPartyModel(event.target.value)}>{agent.selectedProvider.models.map((model) => <option key={model.id} value={model.id}>{model.displayName}{model.description ? ` · ${model.description}` : ""}</option>)}</select></label>
          <label htmlFor={`${id}-third-party-effort`}><span>思考深度</span><select id={`${id}-third-party-effort`} value={agent.thirdPartyEfforts.includes(draft.thirdParty.effort) ? draft.thirdParty.effort : agent.selectedThirdPartyModel.defaultReasoningEffort} onChange={(event) => agent.setThirdPartyEffort(event.target.value as AgentReasoningEffort)}>{agent.thirdPartyEfforts.map((entry) => <option key={entry} value={entry}>{reasoningLabels[entry]}</option>)}</select></label>
        </div>
      </section>
      <label className="wide ai-key-field" htmlFor={`${id}-api-key`}><span>{agent.selectedProvider.displayName} API Key <i>{agent.configuredApiKey ? "已保存" : "必填"}</i></span><div><input id={`${id}-api-key`} name={`${id}-api-key`} type="password" autoComplete="new-password" value={agent.apiKey} onChange={(event) => agent.setApiKey(event.target.value)} placeholder={agent.configuredApiKey ? "已安全保存，留空保持不变" : `粘贴 ${agent.selectedProvider.displayName} API Key`} />{agent.configuredApiKey && <button type="button" onClick={agent.removeApiKey}>移除</button>}</div></label>
    </div>}

    <footer className="ai-config-footer">
      <span><Icon name="spark" size={14} /><b>一处设置，所有 Agent 入口共用</b><small>{agent.dirty ? "有更改尚未应用" : agent.saved ? "全局设置已更新" : "已使用当前全局设置"}</small></span>
      <button type="button" onClick={() => void agent.save().catch(() => undefined)} disabled={agent.loading || agent.saving || !agent.dirty}>{agent.saving ? "正在应用…" : "应用到所有入口"}</button>
    </footer>
    {(agent.error || agent.loadError) && <p className="ai-config-error" role="alert">{agent.error || agent.loadError}</p>}
  </fieldset>;
}

function effortsOf(model: AgentModelOption): AgentReasoningEffort[] {
  return model.supportedReasoningEfforts.length ? model.supportedReasoningEfforts : ["off"];
}
