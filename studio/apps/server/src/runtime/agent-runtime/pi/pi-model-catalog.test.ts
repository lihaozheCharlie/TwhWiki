import { describe, expect, it } from "vitest";
import type { AgentProviderConfig } from "@the-way-here/shared";
import { PiModelCatalog } from "./pi-model-catalog.js";

const provider: AgentProviderConfig = {
  id: "local-openai",
  name: "Local OpenAI-compatible",
  protocol: "openai-completions",
  baseUrl: "http://127.0.0.1:11434/v1",
  models: [{
    id: "qwen3",
    displayName: "Qwen 3",
    reasoning: true,
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
  }],
};

describe("PiModelCatalog", () => {
  it("exposes a configured keyless local model without making a network request", async () => {
    const catalog = new PiModelCatalog([provider]);
    await expect(catalog.list()).resolves.toEqual([expect.objectContaining({
      runtimeId: "pi",
      id: "local-openai/qwen3",
      provider: "local-openai",
      providerDisplayName: "Local OpenAI-compatible",
      displayName: "Qwen 3",
    })]);
    expect(catalog.get("local-openai/qwen3")).toMatchObject({ provider: "local-openai", id: "qwen3" });
  });
});
