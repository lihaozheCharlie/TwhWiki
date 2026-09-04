import { describe, expect, it } from "vitest";
import { orderLifeStagesFromPresent } from "./life-atlas";

const stage = (range: string, order: number, current = false) => ({ range, order, current } as any);

describe("life timeline reading order", () => {
  it("starts at the present and continues backward through recent to earlier stages", () => {
    const ordered = orderLifeStagesFromPresent([
      stage("2018—2020", 0),
      stage("2020—2023", 1),
      stage("2023—2025", 2),
      stage("2025—至今", 3, true),
    ]);

    expect(ordered.map((item) => item.range)).toEqual(["2025—至今", "2023—2025", "2020—2023", "2018—2020"]);
  });

  it("keeps current stages ahead of later-dated completed stages", () => {
    const ordered = orderLifeStagesFromPresent([
      stage("2017—至今", 0, true),
      stage("2025—2026", 1),
    ]);

    expect(ordered.map((item) => item.range)).toEqual(["2017—至今", "2025—2026"]);
  });
});
