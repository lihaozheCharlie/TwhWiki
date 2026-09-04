export {};
self.onmessage = async ({ data: file }: MessageEvent<File>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片压缩不可用，请导出 JPG 后重试");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close(); bitmap = undefined;
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    self.postMessage({ blob });
  } catch {
    self.postMessage({ error: "无法解码或压缩这张图片，请导出 JPG 后重试" });
  } finally { bitmap?.close(); }
};
