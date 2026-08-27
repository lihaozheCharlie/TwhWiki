import { describe, expect, it } from "vitest";
import { shouldEnterDocumentEditMode } from "./markdown";

describe("shared Markdown reading behavior", () => {
  it("enters editing only from a double click on the document surface", () => {
    expect(shouldEnterDocumentEditMode({ clickCount: 1, insideControl: false })).toBe(false);
    expect(shouldEnterDocumentEditMode({ clickCount: 2, insideControl: false })).toBe(true);
    expect(shouldEnterDocumentEditMode({ clickCount: 2, insideControl: true })).toBe(false);
  });
});
