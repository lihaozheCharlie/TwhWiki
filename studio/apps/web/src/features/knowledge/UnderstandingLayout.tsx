import type { ReactNode } from "react";

export type UnderstandingTone = "self" | "life" | "letter" | "people";

export function UnderstandingGlyph({ tone, size = "large" }: { tone: UnderstandingTone; size?: "small" | "large" }) {
  return <span className={`understanding-glyph understanding-glyph--${tone} understanding-glyph--${size}`} aria-hidden="true">
    <svg viewBox="0 0 48 48" fill="none">
      {tone === "self" ? <>
        <path d="m24 7 12 8-4.5 18H16.5L12 15 24 7Z" />
        <path d="m12 15 12 6 12-6M24 21v12M16.5 33 24 21l7.5 12" />
      </> : tone === "life" ? <>
        <path d="M10 36c5-1 6-7 10-10s8-1 11-5 2-7 7-10" />
        <circle cx="10" cy="36" r="3" /><circle cx="22" cy="25" r="3" /><circle cx="38" cy="11" r="3" />
      </> : tone === "letter" ? <>
        <path d="M8 13h32v23H8z" />
        <path d="m9 15 15 12 15-12M9 34l10-10m20 10L29 24" />
      </> : <>
        <circle cx="24" cy="24" r="4" /><circle cx="12" cy="12" r="3" /><circle cx="38" cy="14" r="3" /><circle cx="11" cy="37" r="3" /><circle cx="38" cy="36" r="3" />
        <path d="m15 14 6 7m6-1 8-5M21 27l-7 7m13-7 8 7" />
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
