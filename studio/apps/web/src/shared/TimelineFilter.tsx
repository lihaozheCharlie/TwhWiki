import type { ReactNode } from "react";
import "./timeline-filter.css";

export type TimelinePeriod = { value: string; label: string; count: number };

/** A controlled chronological filter; callers own date semantics and URL state. */
export function TimelineFilter({ label, value, periods, total, allLabel, onChange, leading, hint }: {
  label: string;
  value: string;
  periods: TimelinePeriod[];
  total: number;
  allLabel: string;
  onChange: (value: string) => void;
  leading?: ReactNode;
  hint?: string;
}) {
  const missingPeriod = value && !periods.some((period) => period.value === value);
  return <div className="timeline-filter" role="group" aria-label={label}>
    {leading}
    {leading && <i className="timeline-filter-divider" aria-hidden="true" />}
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{allLabel} · {total}</option>
      {missingPeriod && <option value={value}>{value} · 0</option>}
      {periods.map((period) => <option key={period.value} value={period.value}>{period.label} · {period.count}</option>)}
    </select>
    {hint && <span className="timeline-filter-hint">{hint}</span>}
  </div>;
}
