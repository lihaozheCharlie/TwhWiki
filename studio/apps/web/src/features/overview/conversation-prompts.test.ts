import { describe, expect, test } from "vitest";
import { dailyPromptSeed, stablePromptOrder } from "./conversation-prompts";

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
});
