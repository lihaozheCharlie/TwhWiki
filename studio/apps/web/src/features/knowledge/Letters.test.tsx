import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LettersView, WikiPage, WikiPageSummary, WikiRun } from "@the-way-here/shared";
import { Letters } from "./KnowledgePages";
import { EditableDocument } from "../../shared/markdown";

const mocks = vi.hoisted(() => ({ useApi: vi.fn() }));
vi.mock("../../api", () => ({ useApi: mocks.useApi }));
vi.mock("../collaboration/Collaboration", () => ({ ContextualAgentDock: () => null }));

const page: WikiPageSummary = { id: "letter-new", title: "2026-02-20 给自己的信", relativePath: "wiki/letters/new.md", excerpt: "不应重复出现在列表的摘要", tags: [], aliases: [], category: "letters", locations: [], sources: [], modifiedAt: "2026-02-20T00:00:00Z", isSource: false };
const markdown = "# 给自己的信\n\n## 这段时间\n\n原始回信正文。";
const document: WikiPage = { ...page, type: "letter", markdown, renderedMarkdown: markdown, properties: {}, sections: [], outgoingLinks: [], incomingLinks: [] };
const themes = ["工作", "家庭", "创作", "关系"].map((title, index) => ({ ...page, id: `theme-${index}`, title, category: "personal-lines" as const }));
const data: LettersView = {
  letters: [
    { page: { ...page, id: "letter-old", title: "较早的回信" }, letterDate: "2024-01-01", themes: [] },
    { page, letterDate: "2026-02-20", themes, evidenceFrom: "2026-01-01", evidenceTo: "2026-02-18" },
  ],
  years: ["2024", "2026"],
  threads: themes.map((theme) => ({ id: theme.id, title: theme.title, letters: [page.id], latestDate: "2026-02-20", category: "personal-lines" })),
};
const version = { id: "version-1", status: "completed", createdAt: "2026-02-21T10:00:00Z", events: [], result: { finalAnswer: "这是新视角的回信正文。" }, outputTarget: { kind: "letter-version", pageId: page.id, lensId: "lens", lensName: "示例", label: "示例视角回信" } } as unknown as WikiRun;
let runs: WikiRun[];
let lettersError: string | undefined;
let runsError: string | undefined;
let view: LettersView;

beforeEach(() => {
  runs = [];
  lettersError = undefined;
  runsError = undefined;
  view = data;
  mocks.useApi.mockImplementation((url: string) => {
    if (url === "/api/views/letters") return { data: lettersError ? undefined : view, loading: false, error: lettersError };
    if (url === "/api/runs") return { data: runs, loading: false, error: runsError };
    if (url === "/api/lenses") return { data: [{ id: "lens", displayName: "示例", attention: "关注证据" }], loading: false };
    return { data: document, loading: false };
  });
});

function render(search = "") {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/letters${search}`]}><Letters revision={0} /></MemoryRouter>);
}

describe("letter reader", () => {
  it("uses one shared filter and a date/title-only index in descending order", () => {
    const html = render();
    const index = html.slice(html.indexOf('<aside class="letter-index"'), html.indexOf("</aside>"));
    expect(html).toContain('class="timeline-filter"');
    expect(index.indexOf("给自己的信")).toBeLessThan(index.indexOf("较早的回信"));
    expect(index).not.toContain(page.excerpt);
    expect(index).not.toContain("家庭");
    expect(html).not.toContain("letter-origin-facts");
    expect(html).not.toContain("letter-version-switcher");
    expect(html).not.toContain('aria-label="切换回信版本"');
    expect(html).toContain("原始回信正文。");
  });

  it("keeps overflow themes accessible and reread explanations closed initially", () => {
    const html = render();
    expect(html).toContain('aria-label="另外 2 个主题"');
    expect(html).toContain("创作");
    expect(html).toContain("关系");
    expect(html).toContain("用其他视角重读");
    expect(html).not.toContain("选择重读视角");
  });

  it("defaults to the latest completed version and retains original/version deep links", () => {
    runs = [version, { ...version, id: "version-2", createdAt: "2026-02-22T10:00:00Z", result: { ...version.result!, finalAnswer: "最新正文。" } }];
    expect(render()).toContain("最新正文。");
    expect(render()).toContain('aria-label="切换回信版本"');
    expect(render()).toContain("查看生成对话");
    expect(render("?letter=letter-new&version=version-1")).toContain("这是新视角的回信正文。");
    expect(render("?letter=letter-new&version=original")).toContain("原始回信正文。");
  });

  it("honors the selected letter instead of forcing the newest one", () => {
    expect(render("?letter=letter-old")).toContain('dateTime="2024-01-01"');
    expect(render("?letter=letter-old")).not.toContain('class="letter-more-themes"');
  });

  it("uses the standard editor order instead of a letter-only compact layout", () => {
    const html = render();
    expect(html).not.toContain("editable-document-properties-disclosure");
    expect(html).toContain('class="editable-document editable-document--preview knowledge-document has-outline"');
    expect(html.indexOf('class="editable-document-toolbar')).toBeLessThan(html.indexOf('class="editable-document-properties'));
    expect(html.indexOf('class="editable-document-properties')).toBeLessThan(html.indexOf('class="editable-document-body'));
    expect(html).toContain("双击正文开始修改 · 自动保存");
  });

  it("renders the exact same editor as other knowledge pages, including its outline", () => {
    const standard = renderToStaticMarkup(<MemoryRouter><EditableDocument page={document} variant="preview" showOutline showIdentity={false} /></MemoryRouter>);
    expect(render()).toContain(standard);
  });

  it("uses the shared document layout and outline for immutable generated versions", () => {
    runs = [{ ...version, result: { ...version.result!, finalAnswer: "# 新视角\n\n## 这段时间\n\n回信内容。" } }];
    const html = render();
    expect(html).toContain('class="editable-document editable-document--preview knowledge-document has-outline"');
    expect(html).toContain('class="document-outline');
    expect(html).not.toContain("editable-document-activate");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("双击正文开始修改");
    expect(html).toContain("查看生成对话");
  });

  it("shows empty/error feedback instead of loading forever", () => {
    view = { letters: [], threads: [], years: [] };
    expect(render()).toContain("当前范围暂无回信");
    lettersError = "暂时无法连接";
    expect(render()).toContain("暂时无法连接");
    expect(render()).not.toContain("正在整理回信");
  });

  it("keeps original reading available when version history fails", () => {
    runsError = "历史读取失败";
    expect(render()).toContain("历史版本暂时无法读取");
    expect(render()).toContain("原始回信正文。");
  });
});
