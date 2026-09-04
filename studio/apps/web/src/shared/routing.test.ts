import { describe, expect, it } from "vitest";
import { pageDestination } from "./routing";

describe("page destinations", () => {
  it("opens a recent letter in the dedicated letter reader", () => {
    expect(pageDestination({
      id: "wiki/12 近况对话/2026-09-03 能力是在悬而未决里长出来的",
      category: "letters",
    })).toBe("/letters?letter=wiki%2F12+%E8%BF%91%E5%86%B5%E5%AF%B9%E8%AF%9D%2F2026-09-03+%E8%83%BD%E5%8A%9B%E6%98%AF%E5%9C%A8%E6%82%AC%E8%80%8C%E6%9C%AA%E5%86%B3%E9%87%8C%E9%95%BF%E5%87%BA%E6%9D%A5%E7%9A%84");
  });

  it("keeps ordinary knowledge pages in the standalone reader", () => {
    expect(pageDestination({ id: "wiki/01 个人主线/选择", category: "personal-lines" })).toBe("/page/wiki/01%20%E4%B8%AA%E4%BA%BA%E4%B8%BB%E7%BA%BF/%E9%80%89%E6%8B%A9");
  });
});
