import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type IconName = "now" | "compass" | "route" | "people" | "library" | "source" | "controls" | "search" | "menu" | "spark" | "arrow" | "up" | "refresh" | "journal" | "message" | "receipt" | "history" | "plus" | "back" | "close" | "down" | "check" | "trash";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    now: <><circle cx="12" cy="12" r="7" /><path d="M12 7v5l3 2" /></>,
    compass: <><circle cx="12" cy="12" r="8" /><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" /></>,
    route: <><path d="M5 19V8a3 3 0 0 1 3-3h8" /><path d="m13 2 3 3-3 3" /><circle cx="5" cy="19" r="2" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15 6.5a3 3 0 0 1 0 5.8M16.5 14.5A5 5 0 0 1 20 19" /></>,
    library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z" /></>,
    source: <><path d="M5 4h14v5H5zM5 15h14v5H5z" /><path d="M8 9v6M16 9v6" /><circle cx="8" cy="6.5" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="17.5" r=".8" fill="currentColor" stroke="none" /></>,
    controls: <><path d="M4 7h8M18 7h2M4 17h2M12 17h8M14 4v6M8 14v6" /><circle cx="14" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    spark: <><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z" /><path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    up: <><path d="M12 19V5M7 10l5-5 5 5" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>,
    journal: <><path d="M6 3h11a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M8 3v18M11 8h5M11 12h5" /></>,
    message: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h6" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    history: <><path d="M4.7 7.8A8 8 0 1 1 4 12" /><path d="M4 4v4h4M12 8v4l2.7 1.6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    back: <><path d="M19 12H5M10 7l-5 5 5 5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    down: <path d="m7 9 5 5 5-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Loading({ label = "正在整理页面" }: { label?: string }) {
  return <div className="loading"><span />{label}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function SectionTabs({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return <nav className="section-tabs" aria-label="页面分类">{items.map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}</nav>;
}

export function ParentBack({ to, label }: { to: string; label: string }) {
  return <NavLink className="context-back parent-back" to={to}><Icon name="back" size={16} />{label}</NavLink>;
}

export function PaneCollapseButton({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return <button type="button" className="pane-collapse-button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? "收起" : "展开"}${label}`} title={`${open ? "收起" : "展开"}${label}`}>
    <span>{label}</span><Icon name={open ? "back" : "arrow"} size={12} />
  </button>;
}

export function CollapsibleIndexPane({ open, onToggle, label, children }: { open: boolean; onToggle: () => void; label: string; children: ReactNode }) {
  return <div className={`collapsible-index-pane${open ? "" : " collapsed"}`}><div className="collapsible-index-content">{children}</div><PaneCollapseButton open={open} onToggle={onToggle} label={label} /></div>;
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-heading"><h2>{title}</h2>{action}</div>;
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return <header className="page-header"><div><h1>{title}</h1><p>{description}</p></div></header>;
}

export type PageHeroProps = { title: string; description: string; aside?: ReactNode; tone?: "surface" | "tinted"; compact?: boolean; className?: string };

export function PageHero({ title, description, aside, tone = "surface", compact = false, className = "" }: PageHeroProps) {
  return <header className={`page-hero page-hero--${tone}${compact ? " page-hero--compact" : ""}${className ? ` ${className}` : ""}`}>
    <div className="page-hero-copy"><h1>{title}</h1><p>{description}</p></div>{aside ? <aside className="page-hero-aside">{aside}</aside> : null}
  </header>;
}

export function HeroMetric({ value, label, detail }: { value: number; label: string; detail?: string }) {
  return <div className="hero-metric"><b>{new Intl.NumberFormat("zh-CN").format(value)}</b><span>{label}</span>{detail ? <small>{detail}</small> : null}</div>;
}
