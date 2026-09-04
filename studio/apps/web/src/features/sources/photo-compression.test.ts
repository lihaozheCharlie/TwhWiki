import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_UPLOAD_LIMIT, preparePhotoFile } from "./photo-compression";

class FakeWorker {
  static current: FakeWorker;
  onmessage?: (event: unknown) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.current = this; }
}
const largeFile = () => new File([new Uint8Array(PHOTO_UPLOAD_LIMIT + 1)], "large.png", { type: "image/png", lastModified: 123 });
beforeEach(() => { vi.stubGlobal("Worker", FakeWorker); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("large photo preparation", () => {
  it("retains the original file within the upload limit", async () => {
    const file = new File(["photo"], "small.jpg");
    expect(await preparePhotoFile(file, new AbortController().signal)).toBe(file);
  });
  it("prepares an oversized image in a worker and returns a named JPEG", async () => {
    const promise = preparePhotoFile(largeFile(), new AbortController().signal);
    FakeWorker.current.onmessage?.({ data: { blob: new Blob(["compressed"], { type: "image/jpeg" }) } });
    const result = await promise;
    expect(result.name).toBe("large.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.lastModified).toBe(123);
    expect(result.size).toBeLessThan(PHOTO_UPLOAD_LIMIT);
    expect(FakeWorker.current.terminate).toHaveBeenCalledOnce();
  });
  it("stops decoding when the dialog closes", async () => {
    const controller = new AbortController();
    const promise = preparePhotoFile(largeFile(), controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.current.terminate).toHaveBeenCalledOnce();
  });
  it("returns an actionable error and releases the worker on timeout", async () => {
    const promise = preparePhotoFile(largeFile(), new AbortController().signal);
    vi.advanceTimersByTime(60_000);
    await expect(promise).rejects.toThrow("超时");
    expect(FakeWorker.current.terminate).toHaveBeenCalledOnce();
  });
  it("does not submit broken or still-oversized compressed output", async () => {
    const promise = preparePhotoFile(largeFile(), new AbortController().signal);
    FakeWorker.current.onmessage?.({ data: { error: "无法解码" } });
    await expect(promise).rejects.toThrow("无法解码");
    const oversized = preparePhotoFile(largeFile(), new AbortController().signal);
    FakeWorker.current.onmessage?.({ data: { blob: new Blob([new Uint8Array(PHOTO_UPLOAD_LIMIT + 1)]) } });
    await expect(oversized).rejects.toThrow("压缩未完成");
  });
});
