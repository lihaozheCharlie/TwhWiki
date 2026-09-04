export const PHOTO_UPLOAD_LIMIT = 20 * 1024 * 1024;

// Decoding and encoding large photos stay off the UI thread. Termination also
// releases decoder memory when the dialog closes or a file exceeds the deadline.
export function preparePhotoFile(file: File, signal: AbortSignal): Promise<File> {
  if (signal.aborted) return Promise.reject(new DOMException("已取消", "AbortError"));
  if (file.size <= PHOTO_UPLOAD_LIMIT) return Promise.resolve(file);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./photo-compression.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", cancel); worker.terminate(); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const cancel = () => fail(new DOMException("已取消", "AbortError"));
    const timeout = setTimeout(() => fail(new Error("压缩超时，请导出较小的 JPG 后重试")), 60_000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => fail(new Error("无法压缩这张图片，请导出 JPG 后重试"));
    worker.onmessage = ({ data }: MessageEvent<{ blob?: Blob; error?: string }>) => {
      if (!data.blob || data.blob.size > PHOTO_UPLOAD_LIMIT || !data.blob.size) { fail(new Error(data.error || "压缩未完成，请导出较小的 JPG 后重试")); return; }
      cleanup();
      resolve(new File([data.blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg", lastModified: file.lastModified }));
    };
    try { worker.postMessage(file); } catch { fail(new Error("无法读取这张图片，请重新选择")); }
  });
}
