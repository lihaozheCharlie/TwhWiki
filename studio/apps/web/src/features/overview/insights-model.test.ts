import { describe, expect, test } from "vitest";
import type { StructuredCard } from "@the-way-here/shared";
import { insightCardDetail, insightCoreJudgment, insightExcerpt, mentalModelPanels, plainInsightText } from "./insights-model";

const card: StructuredCard = {
  id: "line",
  title: "一条主线",
  excerpt: "备用摘要",
  sections: [
    { heading: "演化脉络", body: "先走了一段弯路。" },
    { heading: "关键证据", body: "来自 [[原始记录|一次真实经历]]。" },
  ],
};

describe("insights display model", () => {
  test("cleans wiki markup without losing the readable label", () => {
    expect(plainInsightText("- 来自 [[原始记录|一次真实经历]] 和 [另一份记录](/page/record) **支持**"))
      .toBe("来自 一次真实经历 和 另一份记录 支持");
  });

  test("prefers the requested evidence section", () => {
    expect(insightCardDetail(card, ["关键证据"])).toBe("来自 一次真实经历。");
  });

  test("shows the core judgment without falling back to evidence paths", () => {
    expect(insightCoreJudgment(card)).toBe("备用摘要");
    expect(insightCoreJudgment({ ...card, sections: [...card.sections, { heading: "核心判断", body: "我会把敏感训练成判断力。" }] }))
      .toBe("我会把敏感训练成判断力。");
  });

  test("keeps excerpts bounded", () => {
    expect(insightExcerpt("一二三四五六", 4)).toBe("一二三四…");
  });

  test("separates model guidance from its calibration", () => {
    expect(mentalModelPanels("先观察现实证据。这个方法不适用于重大不可逆决定。"))
      .toEqual({ summary: "先观察现实证据。", calibration: "这个方法不适用于重大不可逆决定。" });
  });
});
