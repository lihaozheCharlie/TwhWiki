import type { PhotoBox } from "@the-way-here/shared";

export type PhotoDetectionStatus = { state: "detecting" | "done" | "failed"; count?: number; error?: string };
export function detectPhotoFaces(url: string, signal: AbortSignal): Promise<PhotoBox[]> {
  if (signal.aborted) return Promise.reject(new DOMException("已取消", "AbortError"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./photo-face.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", cancel); worker.terminate(); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const cancel = () => fail(new DOMException("已取消", "AbortError"));
    const timeout = setTimeout(() => fail(new Error("本地检测超时，请重试；也可以直接讲故事。")), 30_000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ boxes?: PhotoBox[]; error?: string }>) => {
      if (data.error || !Array.isArray(data.boxes)) { fail(new Error(data.error || "本地检测未完成，请重试。")); return; }
      cleanup(); resolve(data.boxes.slice(0, 40));
    };
    worker.onerror = () => fail(new Error("本地人脸检测暂不可用，请重试；也可以直接讲故事。"));
    try { worker.postMessage({ url: new URL(url, window.location.origin).href, origin: window.location.origin }); }
    catch { fail(new Error("无法读取照片，请重试。")); }
  });
}

// Only one decoder runs at a time. Read current annotations before both the
// request and its result so a late response never replaces a restored draft.
export async function detectPhotoBatch(photos: Array<{ id: string; url: string }>, options: {
  signal: AbortSignal;
  shouldSkip: (id: string) => boolean;
  onStatus: (id: string, status: PhotoDetectionStatus) => void;
  onDetected: (id: string, boxes: PhotoBox[]) => void;
  detect?: typeof detectPhotoFaces;
}) {
  for (const photo of photos) {
    if (options.signal.aborted) return;
    if (options.shouldSkip(photo.id)) continue;
    options.onStatus(photo.id, { state: "detecting" });
    try {
      const boxes = await (options.detect ?? detectPhotoFaces)(photo.url, options.signal);
      if (options.signal.aborted) return;
      if (!options.shouldSkip(photo.id) && boxes.length) options.onDetected(photo.id, boxes);
      options.onStatus(photo.id, { state: "done", count: boxes.length });
    } catch (error) {
      if (options.signal.aborted) return;
      options.onStatus(photo.id, { state: "failed", error: error instanceof Error ? error.message : "本地检测未完成，请重试。" });
    }
  }
}
