import { describe, expect, it } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { attachedContextPrompt, contextPrompt, groupAgentThreads, letterRunVersions, resolveAgentAutoSubmission, resolveComposerMode, runDisplayPrompt, runFinalAnswer, shouldSubmitAgentInput } from "./model";

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

  it("keeps attached topic context separate from the user's own words", () => {
    const prompt = attachedContextPrompt({
      title: "你愿意把哪一种身体信号当作底线？",
      currentUnderstanding: "身体恢复仍不稳定。",
      reason: "近期记录还不足以确认稳定节奏。",
    }, "我想先说说最近一次晚睡。");

    expect(prompt).toContain("不是用户已经说过的话");
    expect(prompt).toContain("话题：你愿意把哪一种身体信号当作底线？");
    expect(prompt).toContain("用户这次想说：\n我想先说说最近一次晚睡。");
  });

  it("groups multiple turns from one Agent session into one conversation", () => {
    const first = { id: "run-1", runtimeSessionId: "session-1", createdAt: "2026-08-20T10:00:00.000Z" } as WikiRun;
    const followUp = { id: "run-2", runtimeSessionId: "session-1", createdAt: "2026-08-20T11:00:00.000Z" } as WikiRun;
    const separate = { id: "run-3", createdAt: "2026-08-21T10:00:00.000Z" } as WikiRun;

    const threads = groupAgentThreads([first, separate, followUp]);

    expect(threads).toHaveLength(2);
    expect(threads[0]?.latest.id).toBe("run-3");
    expect(threads[1]?.runs.map((run) => run.id)).toEqual(["run-1", "run-2"]);
    expect(threads[1]?.latest.id).toBe("run-2");
  });

  it("keeps completed perspective rereads as ordered letter versions", () => {
    const target = { kind: "letter-version" as const, pageId: "wiki/12 回信/今天", lensId: "yanni", lensName: "雅尼", label: "雅尼视角回信" };
    const earlier = { id: "run-1", status: "completed", updatedAt: "2026-08-20T10:00:00.000Z", createdAt: "2026-08-20T09:00:00.000Z", outputTarget: target, result: { finalAnswer: "第一版" }, events: [] } as unknown as WikiRun;
    const latest = { id: "run-2", status: "completed", updatedAt: "2026-08-21T10:00:00.000Z", createdAt: "2026-08-21T09:00:00.000Z", outputTarget: target, result: { finalAnswer: "第二版", completedAt: "2026-08-21T11:00:00.000Z" }, events: [] } as unknown as WikiRun;
    const running = { id: "run-3", status: "running", updatedAt: "2026-08-22T10:00:00.000Z", createdAt: "2026-08-22T09:00:00.000Z", outputTarget: target, result: { finalAnswer: "未完成" }, events: [] } as unknown as WikiRun;
    const otherLetter = { ...latest, id: "run-4", outputTarget: { ...target, pageId: "wiki/12 回信/别处" } } as WikiRun;

    expect(letterRunVersions([latest, running, otherLetter, earlier], target.pageId)).toEqual([
      expect.objectContaining({ id: "run-1", markdown: "第一版" }),
      expect.objectContaining({ id: "run-2", markdown: "第二版", createdAt: "2026-08-21T11:00:00.000Z" }),
    ]);
  });

  it("submits Agent input on Enter while preserving Shift+Enter and IME composition", () => {
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: false })).toBe(true);
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: true })).toBe(false);
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
    expect(shouldSubmitAgentInput({ key: "a", shiftKey: false })).toBe(false);
  });

  it("turns an explicit auto-submit request into one ready-to-send Agent message", () => {
    expect(resolveAgentAutoSubmission({ prompt: "  带上下文的问题  ", displayPrompt: "  我真正输入的话  ", mode: "read", autoSubmit: true })).toEqual({
      prompt: "带上下文的问题",
      displayPrompt: "我真正输入的话",
      mode: "auto",
      outputTarget: undefined,
    });
    expect(resolveAgentAutoSubmission({ prompt: "只预填，不发送" })).toBeUndefined();
    expect(resolveAgentAutoSubmission({ prompt: "   ", autoSubmit: true })).toBeUndefined();
  });

  it("lets Agent infer every normal conversation while preserving validation", () => {
    expect(resolveComposerMode()).toBe("auto");
    expect(resolveComposerMode("read")).toBe("auto");
    expect(resolveComposerMode("write")).toBe("auto");
    expect(resolveComposerMode("auto")).toBe("auto");
    expect(resolveComposerMode("validate")).toBe("validate");
  });
});
