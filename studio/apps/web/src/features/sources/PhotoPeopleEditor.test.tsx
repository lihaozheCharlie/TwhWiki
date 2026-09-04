import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PhotoPeopleEditor } from "./PhotoPeopleEditor";
const editing = ["甲", "乙", "丙"].map((name, i) => ({ id: String(i), name, box: { x: 0, y: 0, width: 1, height: 1 }, useAsAvatar: true }));
const props = { editing, people: [], locked: false, selectedId: "1", onSelect: vi.fn(), onChange: vi.fn(), onRemove: vi.fn() };
describe("compact photo person tabs", () => {
  it("shows all person tabs but only one searchable editor and crop panel", () => {
    const html = renderToStaticMarkup(<PhotoPeopleEditor {...props} />);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html).toContain('value="乙"');
    expect(html).toContain("人物 2 · 共 3 人");
    expect(html).toContain("调整裁剪范围");
  });
  it("falls back to a remaining person when the selected annotation was removed", () => {
    const html = renderToStaticMarkup(<PhotoPeopleEditor {...props} editing={editing.filter((p) => p.id !== "1")} />);
    expect(html).toContain('value="甲"');
    expect(html).toContain("人物 1 · 共 2 人");
  });
});
