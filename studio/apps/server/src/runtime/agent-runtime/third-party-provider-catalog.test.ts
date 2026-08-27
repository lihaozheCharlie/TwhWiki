import { describe, expect, it } from "vitest";
import {
  defaultThirdPartySelection,
  findThirdPartySelection,
  listThirdPartyProviderPresets,
  piProviderFromPreset,
} from "./third-party-provider-catalog.js";

describe("third-party provider catalog", () => {
  it("publishes curated Chinese and international model vendors without exposing endpoints", () => {
    const presets = listThirdPartyProviderPresets();

    expect(presets.map((provider) => provider.id)).toEqual([
      "deepseek", "zhipu", "qwen", "kimi", "minimax", "openai", "anthropic",
    ]);
    expect(JSON.stringify(presets)).not.toContain("baseUrl");
    expect(presets.every((provider) => provider.models.length > 0)).toBe(true);
  });

  it("keeps official endpoints behind the catalog seam", () => {
    expect(piProviderFromPreset("deepseek", "deepseek-v4-pro", "key")?.baseUrl).toBe("https://api.deepseek.com");
    expect(piProviderFromPreset("zhipu", "glm-5.2", "key")?.baseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(piProviderFromPreset("qwen", "qwen3.8-max", "key")?.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(piProviderFromPreset("kimi", "kimi-k3", "key")?.baseUrl).toBe("https://api.moonshot.cn/v1");
    expect(piProviderFromPreset("minimax", "MiniMax-M2.7", "key")?.baseUrl).toBe("https://api.minimaxi.com/v1");
  });

  it("has a valid default model and reasoning effort", () => {
    const selection = defaultThirdPartySelection();
    const resolved = findThirdPartySelection(selection.providerId, selection.model);

    expect(resolved).toBeDefined();
    expect(resolved?.model.supportedReasoningEfforts).toContain(selection.effort);
  });
});
