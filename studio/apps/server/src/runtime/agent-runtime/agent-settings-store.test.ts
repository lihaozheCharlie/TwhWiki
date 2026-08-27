import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntimeConfig, UpdateAgentGlobalSettings } from "@the-way-here/shared";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSettingsStore, AgentSettingsValidationError } from "./agent-settings-store.js";

const config: AgentRuntimeConfig = {
  defaultRuntime: "auto",
  runtimes: {
    codex: { enabled: true, command: "codex", transport: "stdio" },
    pi: { enabled: true, providers: [] },
  },
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AgentSettingsStore", () => {
  it("uses a Codex-first global default with a curated DeepSeek selection", async () => {
    const { store } = await fixture();
    const settings = await store.load();

    expect(settings.public.runtimeId).toBe("codex");
    expect(settings.public.thirdParty.providerId).toBe("deepseek");
    expect(settings.public.thirdParty.model).toBe("deepseek-v4-pro");
    expect(settings.public.thirdParty.apiKeyConfigured).toBe(false);
    expect(settings.provider).toBeUndefined();
  });

  it("persists a vendor selection while masking its API key", async () => {
    const { store, stateRoot } = await fixture();
    const saved = await store.update(update({ providerId: "zhipu", model: "glm-5.2", apiKey: "secret-value" }));
    const reloaded = await new AgentSettingsStore(config, "/anonymous/workspace", stateRoot).load();

    expect(saved.public).toEqual(reloaded.public);
    expect(saved.public.thirdParty.apiKeyConfiguredProviders).toEqual(["zhipu"]);
    expect(saved.provider?.baseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(saved.provider?.apiKey).toBe("secret-value");
    expect(JSON.stringify(saved.public)).not.toContain("secret-value");
    expect(await readFile(path.join(stateRoot, "agent-settings.json"), "utf8")).toContain("secret-value");
    if (process.platform !== "win32") expect((await stat(path.join(stateRoot, "agent-settings.json"))).mode & 0o777).toBe(0o600);
  });

  it("remembers separate API keys when switching vendors", async () => {
    const { store } = await fixture();
    await store.update(update({ providerId: "deepseek", model: "deepseek-v4-pro", apiKey: "deepseek-key" }));
    await store.update(update({ providerId: "zhipu", model: "glm-5.2", apiKey: "zhipu-key" }));
    const deepseek = await store.update(update({ providerId: "deepseek", model: "deepseek-v4-flash" }));

    expect(deepseek.public.thirdParty.apiKeyConfigured).toBe(true);
    expect(deepseek.public.thirdParty.apiKeyConfiguredProviders).toEqual(expect.arrayContaining(["deepseek", "zhipu"]));
    expect(deepseek.provider?.apiKey).toBe("deepseek-key");
  });

  it("rejects unknown models, unsupported effort, and missing vendor keys", async () => {
    const { store } = await fixture();

    await expect(store.update(update({ model: "made-up-model", apiKey: "key" }))).rejects.toThrow(AgentSettingsValidationError);
    await expect(store.update(update({ model: "deepseek-v4-pro", effort: "ultra", apiKey: "key" }))).rejects.toThrow("不支持所选思考深度");
    await expect(store.update(update())).rejects.toThrow("请填写 DeepSeek API Key");
  });

  it("migrates the previous endpoint-based format to a vendor preset", async () => {
    const { stateRoot } = await fixture();
    await mkdir(stateRoot, { recursive: true });
    await writeFile(path.join(stateRoot, "agent-settings.json"), JSON.stringify({
      version: 1,
      runtimeId: "pi",
      codex: { model: "gpt-5.6-sol", effort: "high" },
      thirdParty: {
        protocol: "openai-completions",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        effort: "high",
        apiKey: "legacy-key",
      },
    }));

    const migrated = await new AgentSettingsStore(config, "/anonymous/workspace", stateRoot).load();
    expect(migrated.public.thirdParty.providerId).toBe("deepseek");
    expect(migrated.provider?.apiKey).toBe("legacy-key");
  });
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-agent-settings-"));
  roots.push(root);
  const stateRoot = path.join(root, "state");
  return { stateRoot, store: new AgentSettingsStore(config, "/anonymous/workspace", stateRoot) };
}

function update(overrides: Partial<UpdateAgentGlobalSettings["thirdParty"]> = {}): UpdateAgentGlobalSettings {
  return {
    runtimeId: "pi",
    codex: { model: "gpt-5.6-sol", effort: "high" },
    thirdParty: {
      providerId: "deepseek",
      model: "deepseek-v4-pro",
      effort: "high",
      ...overrides,
    },
  };
}
