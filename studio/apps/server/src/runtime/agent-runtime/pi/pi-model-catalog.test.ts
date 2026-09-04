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
  it("exposes image support only when the configured model declares it", async () => {
    const catalog = new PiModelCatalog([{ ...provider, models: [...provider.models, { ...provider.models[0]!, id: "vision", inputModalities: ["text", "image"] }] }]);
    const models = await catalog.list();
    expect(models.find((m) => m.id.endsWith("/qwen3"))?.inputModalities).toEqual(["text"]);
    expect(models.find((m) => m.id.endsWith("/vision"))?.inputModalities).toEqual(["text", "image"]);
    expect(catalog.get("local-openai/vision")?.input).toEqual(["text", "image"]);
  });
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
