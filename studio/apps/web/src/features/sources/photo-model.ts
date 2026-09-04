import type { PhotoBox } from "@the-way-here/shared";

export const PHOTO_LIMIT = 10;
export function photoSelectionError(file: Pick<File, "name" | "size">): string | undefined {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return `${file.name}：请使用 JPG、PNG 或 WebP，HEIC 请先导出为 JPG`;
  if (!file.size || file.size > 100 * 1024 * 1024) return `${file.name}：单张照片最多 100 MB，且不能是空文件`;
  return undefined;
}
export function clampPhotoBox(box: PhotoBox): PhotoBox {
  const x = Math.max(0, Math.min(0.98, box.x));
  const y = Math.max(0, Math.min(0.98, box.y));
  return { x, y, width: Math.max(0.02, Math.min(1 - x, box.width)), height: Math.max(0.02, Math.min(1 - y, box.height)) };
}
