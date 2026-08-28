import { describe, expect, it } from "vitest";
import { localWikiHref } from "./local-page-link";

describe("local page links in Agent answers", () => {
  it("opens an encoded Wiki file link with a line number inside the app", () => {
    expect(localWikiHref("/workspace/TwhWiki/vault/demo/wiki/06%20现实系统/消费与生活轨迹.md:18"))
      .toBe("/page/wiki/06%20%E7%8E%B0%E5%AE%9E%E7%B3%BB%E7%BB%9F/%E6%B6%88%E8%B4%B9%E4%B8%8E%E7%94%9F%E6%B4%BB%E8%BD%A8%E8%BF%B9");
  });

  it("opens source files and legacy vault links inside the app", () => {
    expect(localWikiHref("file:///workspace/vault/personal/sources/消费账单/账单.md:12:4"))
      .toBe("/page/sources/%E6%B6%88%E8%B4%B9%E8%B4%A6%E5%8D%95/%E8%B4%A6%E5%8D%95");
    expect(localWikiHref("/workspace/vault/wiki/总入口/首页.md"))
      .toBe("/page/wiki/%E6%80%BB%E5%85%A5%E5%8F%A3/%E9%A6%96%E9%A1%B5");
  });

  it("keeps app page links and leaves unrelated URLs alone", () => {
    expect(localWikiHref("/page/wiki/existing")).toBe("/page/wiki/existing");
    expect(localWikiHref("https://example.com/report.md")).toBeUndefined();
    expect(localWikiHref("/broken/%E0%A4%A")).toBeUndefined();
  });
});
