import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type UnderstandingTone = "self" | "life" | "people" | "all";

export function UnderstandingGlyph({ tone, size = "large" }: { tone: UnderstandingTone; size?: "small" | "large" }) {
  return <span className={`understanding-glyph understanding-glyph--${tone} understanding-glyph--${size}`} aria-hidden="true">
    <svg viewBox="0 0 48 48" fill="none">
      {tone === "self" ? <>
        <path d="m24 7 12 8-4.5 18H16.5L12 15 24 7Z" />
        <path d="m12 15 12 6 12-6M24 21v12M16.5 33 24 21l7.5 12" />
      </> : tone === "life" ? <>
        <path d="M10 36c5-1 6-7 10-10s8-1 11-5 2-7 7-10" />
        <circle cx="10" cy="36" r="3" /><circle cx="22" cy="25" r="3" /><circle cx="38" cy="11" r="3" />
      </> : tone === "people" ? <>
        <circle cx="24" cy="24" r="4" /><circle cx="12" cy="12" r="3" /><circle cx="38" cy="14" r="3" /><circle cx="11" cy="37" r="3" /><circle cx="38" cy="36" r="3" />
        <path d="m15 14 6 7m6-1 8-5M21 27l-7 7m13-7 8 7" />
      </> : <>
        <path d="M10 11h28v8H10zM10 21h28v8H10zM10 31h28v7H10z" />
        <path d="M16 15h16M16 25h12M16 34.5h18" />
      </>}
    </svg>
  </span>;
}

export function UnderstandingBanner({ tone, title, description, count, countLabel, children }: { tone: UnderstandingTone; title: string; description: string; count: number; countLabel: string; children?: ReactNode }) {
  return <header className={`understanding-banner understanding-banner--${tone}`}>
    <UnderstandingGlyph tone={tone} />
    <div><h1>{title}</h1><p>{description}</p>{children}</div>
    <div className="understanding-banner-count"><b>{new Intl.NumberFormat("zh-CN").format(count)}</b><span>{countLabel}</span></div>
  </header>;
}

export function LifeViewSwitch({ active }: { active: "timeline" | "letters" }) {
  return <nav className="understanding-segmented" aria-label="人生轨迹视角">
    <NavLink className={active === "timeline" ? "active" : ""} to="/timeline">时间线视角</NavLink>
    <NavLink className={active === "letters" ? "active" : ""} to="/letters">回信视角</NavLink>
  </nav>;
}
