import { describe, expect, it } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { contextPrompt, runDisplayPrompt, runFinalAnswer } from "./model";

describe("collaboration model", () => {
  it("extracts the final answer from Codex events", () => {
    const run = { events: [{ payload: { item: { type: "agentMessage", phase: "final_answer", text: "最终判断" } } }] } as unknown as WikiRun;
    expect(runFinalAnswer(run)).toBe("最终判断");
  });

  it("extracts the final answer from the runtime-neutral Pi result", () => {
    const run = {
      runtimeId: "pi",
      result: { finalAnswer: "自定义模型回答" },
      events: [{ payload: { type: "assistant.message", text: "处理中", final: false } }],
    } as unknown as WikiRun;
    expect(runFinalAnswer(run)).toBe("自定义模型回答");
  });

  it("keeps the display prompt separate from the technical context", () => {
    const run = { title: "任务", prompt: "边界\n用户请求：\n真实问题", events: [] } as unknown as WikiRun;
    expect(runDisplayPrompt(run)).toBe("真实问题");
    expect(contextPrompt({ scope: "人物", title: "甲", suggestions: [] }, "继续查证")).toContain("用户请求：\n继续查证");
  });
});
