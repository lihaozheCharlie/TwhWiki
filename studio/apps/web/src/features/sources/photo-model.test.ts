import { describe, expect, it } from "vitest";
import { clampPhotoBox, photoSelectionError } from "./photo-model";

describe("photo import controls", () => {
  it("limits supported formats and file sizes with actionable messages", () => {
    expect(photoSelectionError({ name: "photo.JPG", size: 123 })).toBeUndefined();
    expect(photoSelectionError({ name: "photo.heic", size: 123 })).toContain("导出");
    expect(photoSelectionError({ name: "photo.png", size: 0 })).toContain("空文件");
    expect(photoSelectionError({ name: "photo.png", size: 21 * 1024 * 1024 })).toBeUndefined();
    expect(photoSelectionError({ name: "photo.png", size: 101 * 1024 * 1024 })).toContain("100 MB");
  });
  it("keeps manual crops inside the image while retaining a visible minimum size", () => {
    expect(clampPhotoBox({ x: -0.3, y: 1, width: 3, height: 0 })).toEqual({ x: 0, y: 0.98, width: 1, height: 0.02 });
    const box = clampPhotoBox({ x: 0.8, y: 0.6, width: 0.6, height: 0.6 });
    expect(box.x + box.width).toBeLessThanOrEqual(1);
    expect(box.y + box.height).toBeLessThanOrEqual(1);
  });
});
