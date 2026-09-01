import { describe, expect, it } from "vitest";
import { buildParallelStageRoute, orderLifeStagesFromPresent } from "./life-atlas";

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

describe("life atlas parallel routes", () => {
  it("branches a family stage from its overlapping main stage with a curved turn", () => {
    const route = buildParallelStageRoute([
      "初中时期",
      "高中时期",
      "2013-2017",
      "2017-2022",
      "2022 至今",
    ], "2024 至今", 0);

    expect(route).toMatchObject({ originX: 800, endX: 900, endY: 188 });
    expect(route.path).toBe("M 800 0 V 164 Q 800 188 824 188 H 900");
  });

  it("stacks multiple parallel stages without changing their main-line origin", () => {
    const main = ["2013-2017", "2017-2022", "2022 至今"];
    const first = buildParallelStageRoute(main, "2024 至今", 0);
    const second = buildParallelStageRoute(main, "2025 至今", 1);

    expect(second.originX).toBe(first.originX);
    expect(second.endX).toBe(first.endX);
    expect(second.endY).toBeGreaterThan(first.endY);
  });

  it("keeps an earlier parallel stage attached to the earlier main-line interval", () => {
    const route = buildParallelStageRoute(["2013-2017", "2017-2022", "2022 至今"], "2015-2016", 0);

    expect(route.originX).toBe(0);
    expect(route.endX).toBe(167);
  });
});
