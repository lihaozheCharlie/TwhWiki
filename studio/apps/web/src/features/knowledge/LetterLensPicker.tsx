import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReasoningLens } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";

export function LetterLensPicker({ lenses, onSelect }: { lenses: ReasoningLens[]; onSelect: (lens: ReasoningLens) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [placement, setPlacement] = useState({ above: false, maxHeight: 520 });
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 24;
      const above = below < 240 && rect.top > below;
      const maxHeight = Math.max(100, Math.min(520, above ? rect.top - 24 : below));
      setPlacement((current) => current.above === above && current.maxHeight === maxHeight ? current : { above, maxHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!lenses.length) return null;
  return <div ref={rootRef} className="letter-lens-picker" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={triggerRef} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>用其他视角重读 <Icon name="down" size={14} /></button>
    {open && <section id={id} className="letter-lens-popover" data-placement={placement.above ? "above" : "below"} style={{ maxHeight: placement.maxHeight }} aria-label="选择重读视角">
      <p>用 {lenses.length} 种从公开原则提炼的视角重新写这封信。不增加事实、不模仿口头禅，只改变关注点与解释方式。原始回信始终保留。</p>
      <div>{lenses.map((lens) => <button type="button" key={lens.id} onClick={() => { setOpen(false); onSelect(lens); }}><b>{lens.displayName}</b><small>{lens.attention}</small></button>)}</div>
    </section>}
  </div>;
}
