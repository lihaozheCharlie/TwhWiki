import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

export function ConfirmDeleteDialog({ title, description, itemName, impact, confirmLabel, onClose, onConfirm }: {
  title: string;
  description: string;
  itemName: string;
  impact: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const deletingRef = useRef(deleting);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { deletingRef.current = deleting; }, [deleting]);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusCancel = window.setTimeout(() => cancelRef.current?.focus(), 0);
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && !deletingRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusCancel);
      window.removeEventListener("keydown", handleKeyboard);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (reason: any) {
      setDeleting(false);
      setError(reason.message || "暂时无法删除，请稍后再试");
    }
  }

  return <div className="kb-dialog-backdrop delete-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onClose(); }}>
    <section ref={dialogRef} className="kb-dialog delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
      <form onSubmit={confirm}>
        <header>
          <div className="kb-dialog-symbol delete-dialog-symbol"><Icon name="trash" size={21} /></div>
          <div><h2 id="delete-dialog-title">{title}</h2><p id="delete-dialog-description">{description}</p></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={deleting} aria-label="关闭删除确认"><Icon name="close" size={18} /></button>
        </header>
        <div className="kb-dialog-body delete-dialog-body">
          <strong>{itemName}</strong>
          <p>{impact}</p>
          {error ? <div className="kb-dialog-error" role="alert">{error}</div> : null}
        </div>
        <footer>
          <button ref={cancelRef} type="button" className="secondary-action" onClick={onClose} disabled={deleting}>取消</button>
          <button className="danger-action" disabled={deleting}>{deleting ? "正在删除…" : confirmLabel}</button>
        </footer>
      </form>
    </section>
  </div>;
}
