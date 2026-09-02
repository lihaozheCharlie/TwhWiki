export function resizeComposerTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  textarea.style.height = "auto";
  const styles = window.getComputedStyle(textarea);
  const minHeight = Number.parseFloat(styles.minHeight) || 0;
  const parsedMaxHeight = Number.parseFloat(styles.maxHeight);
  const maxHeight = Number.isFinite(parsedMaxHeight) ? parsedMaxHeight : textarea.scrollHeight;
  const height = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
  textarea.style.height = `${height}px`;
  textarea.style.overflowY = textarea.scrollHeight > height + 1 ? "auto" : "hidden";
}
