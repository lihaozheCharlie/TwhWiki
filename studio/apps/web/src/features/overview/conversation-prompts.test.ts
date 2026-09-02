import { describe, expect, test } from "vitest";
import { dailyPromptSeed, groundedConversationReplyPrompt, stablePromptOrder } from "./conversation-prompts";

describe("conversation prompt selection", () => {
  const prompts = [
    { id: "one", weight: 1 },
    { id: "two", weight: 2 },
    { id: "three", weight: 4 },
    { id: "four", weight: 1 },
  ];

  test("keeps the order stable for the same day", () => {
    expect(stablePromptOrder(prompts, "2026-08-28")).toEqual(stablePromptOrder(prompts, "2026-08-28"));
    expect(stablePromptOrder(prompts, "2026-08-28")).toHaveLength(prompts.length);
  });

  test("can rotate the order when the daily seed changes", () => {
    expect(stablePromptOrder(prompts, "2026-08-28")).not.toEqual(stablePromptOrder(prompts, "2026-08-29"));
  });

  test("uses a calendar-day seed", () => {
    expect(dailyPromptSeed(new Date("2026-08-28T12:30:00.000Z"))).toBe("2026-08-28");
  });

  test("grounds the first reply in earlier Wiki context before asking another question", () => {
    const prompt = groundedConversationReplyPrompt("当前已有理解：此前只做过一次外部贡献。", "  这次开始维护自己的开源项目。  ");

    expect(prompt).toContain("我刚刚补充：\n这次开始维护自己的开源项目。");
    expect(prompt).toContain("先读取与这次补充最相关的 Wiki 综合页");
    expect(prompt).toContain("先自然说清此前的相关情况");
    expect(prompt).toContain("相较过去新增或改变了什么");
    expect(prompt).toContain("区分可追溯事实、当前理解和仍然未知");
    expect(prompt).toContain("最后只问一个真正需要我补充的具体问题");
    expect(prompt).toContain("不要用猜测补足");
  });
});
