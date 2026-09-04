import { describe, expect, it, vi } from "vitest";
import type { PhotoBox } from "@the-way-here/shared";
import { detectPhotoBatch } from "./photo-detection";
const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
const photos = [{ id: "a", url: "/a" }, { id: "b", url: "/b" }, { id: "c", url: "/c" }];
const defaults = () => ({ signal: new AbortController().signal, shouldSkip: () => false, onStatus: vi.fn(), onDetected: vi.fn() });
describe("automatic local face detection", () => {
  it("detects a batch sequentially without loading all images at once", async () => {
    let finish!: (boxes: PhotoBox[]) => void;
    const detect = vi.fn().mockImplementationOnce(() => new Promise<PhotoBox[]>((resolve) => { finish = resolve; })).mockResolvedValue([box]);
    const options = { ...defaults(), detect };
    const task = detectPhotoBatch(photos, options);
    expect(detect).toHaveBeenCalledTimes(1);
    finish([box]);
    await task;
    expect(detect.mock.calls.map(([url]) => url)).toEqual(["/a", "/b", "/c"]);
    expect(options.onDetected.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
  });
  it("preserves existing annotations and intentionally empty drafts", async () => {
    const drafts = { a: [box], b: [] };
    const options = { ...defaults(), shouldSkip: (id: string) => Object.hasOwn(drafts, id), detect: vi.fn().mockResolvedValue([box]) };
    await detectPhotoBatch(photos, options);
    expect(options.detect).toHaveBeenCalledTimes(1);
    expect(options.onDetected).toHaveBeenCalledWith("c", [box]);
  });
  it("ignores a late result when annotations were restored during detection", async () => {
    let restored = false;
    const options = { ...defaults(), shouldSkip: () => restored, detect: vi.fn(async () => { restored = true; return [box]; }) };
    await detectPhotoBatch(photos, options);
    expect(options.onDetected).not.toHaveBeenCalled();
  });
  it("reports a failed photo and continues with the rest, including no-face results", async () => {
    const options = { ...defaults(), detect: vi.fn().mockRejectedValueOnce(new Error("检测失败")).mockResolvedValueOnce([]).mockResolvedValueOnce([box]) };
    await detectPhotoBatch(photos, options);
    expect(options.onStatus).toHaveBeenCalledWith("a", { state: "failed", error: "检测失败" });
    expect(options.onStatus).toHaveBeenCalledWith("b", { state: "done", count: 0 });
    expect(options.onDetected.mock.calls).toEqual([["c", [box]]]);
  });
  it("does not apply late results or start the next photo after leaving the batch", async () => {
    const controller = new AbortController();
    const options = { ...defaults(), signal: controller.signal, detect: vi.fn(async () => { controller.abort(); return [box]; }) };
    await detectPhotoBatch(photos, options);
    expect(options.detect).toHaveBeenCalledTimes(1);
    expect(options.onDetected).not.toHaveBeenCalled();
  });
});
