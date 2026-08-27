import path from "node:path";

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function normalizeSourceFolder(value: string): string {
  const parts = value.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.includes("\0"))) {
    throw new Error("文件夹路径无效");
  }
  return parts.join(path.sep);
}

export function markdownFileName(title: string): string {
  const normalized = title.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  if (!normalized || /^\.+$/.test(normalized)) throw new Error("请输入有效的文件名");
  return `${normalized.replace(/\.md$/i, "")}.md`;
}
