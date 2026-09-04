import { describe, expect, it } from "vitest";
import { parsePhotoDraft, photoDraftKey } from "./photo-draft";

describe("unconfirmed photo draft recovery", () => {
  it("separates knowledge bases and batches without ambiguous key collisions", () => {
    expect(photoDraftKey("a", "b")).not.toBe(photoDraftKey("b", "a"));
    expect(photoDraftKey("a:b", "c")).not.toBe(photoDraftKey("a", "b:c"));
  });
  it("restores incomplete person annotations and unconfirmed stories without a build flag", () => {
    const draft = { revision: 1, photoId: "photo-1", people: [{ id: "person", name: "", box: { x: 0, y: 0, width: 1, height: 1 }, useAsAvatar: false }], peopleDirty: true, story: "还没讲完", storyDirty: true };
    expect(parsePhotoDraft(JSON.stringify(draft))).toEqual(draft);
  });
  it("retains drafts on several photos while the selected photo is unchanged, including removals", () => {
    const person = { id: "person", name: "待确认的人", box: { x: 0, y: 0, width: 1, height: 1 }, useAsAvatar: true };
    const draft = { revision: 2, photoId: "photo-3", people: [], peopleDirty: false, story: "", storyDirty: false, photoDrafts: { "photo-1": [person], "photo-2": [] } };
    expect(parsePhotoDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parsePhotoDraft(JSON.stringify({ ...draft, photoDrafts: { "photo-2": [null] } }))).toBeUndefined();
  });
  it("ignores malformed or oversized browser storage", () => {
    expect(parsePhotoDraft("not json")).toBeUndefined();
    expect(parsePhotoDraft(JSON.stringify({ revision: 1, photoId: "photo-1", people: [null], peopleDirty: true, story: "", storyDirty: false }))).toBeUndefined();
    expect(parsePhotoDraft("a".repeat(256_001))).toBeUndefined();
  });
});
