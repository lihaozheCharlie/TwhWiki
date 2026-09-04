import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TimelineFilter } from "./TimelineFilter";

const base = { label: "按写信年份筛选", value: "", periods: [{ value: "2025", label: "2025 年", count: 3 }], total: 4, allLabel: "全部年份", onChange: vi.fn() };

describe("shared timeline filter", () => {
  it("renders counts, accessible labels and the all-time reset", () => {
    const html = renderToStaticMarkup(<TimelineFilter {...base} />);
    expect(html).toContain('aria-label="按写信年份筛选"');
    expect(html).toContain('value="" selected=""');
    expect(html).toContain("全部年份 · 4");
    expect(html).toContain("2025 年 · 3");
  });

  it("supports month granularity without year-specific behavior", () => {
    const html = renderToStaticMarkup(<TimelineFilter {...base} label="按月份浏览记录" allLabel="全部月份" value="2025-03" periods={[{ value: "2025-03", label: "2025 年 3 月", count: 2 }]} hint="按记录时间从新到旧排列" />);
    expect(html).toContain('value="2025-03" selected=""');
    expect(html).toContain("2025 年 3 月 · 2");
    expect(html).toContain("按记录时间从新到旧排列");
  });

  it("keeps stale URL filters visible instead of pretending all dates are selected", () => {
    const html = renderToStaticMarkup(<TimelineFilter {...base} value="2023" />);
    expect(html).toContain('value="2023" selected=""');
    expect(html).toContain("2023 · 0");
  });

  it("has an all-time option even when empty", () => {
    expect(renderToStaticMarkup(<TimelineFilter {...base} periods={[]} total={0} />)).toContain("全部年份 · 0");
  });

  it("forwards the selected period and the reset value to its owner", () => {
    const onChange = vi.fn();
    const element = TimelineFilter({ ...base, onChange });
    const select = element.props.children.find((child: any) => child?.type === "select");
    select.props.onChange({ target: { value: "2025" } });
    select.props.onChange({ target: { value: "" } });
    expect(onChange.mock.calls).toEqual([["2025"], [""]]);
  });
});
