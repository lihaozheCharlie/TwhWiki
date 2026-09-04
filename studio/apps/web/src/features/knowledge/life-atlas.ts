import type { LifeStageView } from "@the-way-here/shared";

function stageYears(range: string): number[] {
  return (range.match(/(?:19|20)\d{2}/g) || []).map(Number);
}

function stageInterval(range: string): { start: number; end: number } | undefined {
  const years = stageYears(range);
  if (!years.length) return undefined;
  return {
    start: years[0]!,
    end: /至今|现在|current/i.test(range) ? Number.POSITIVE_INFINITY : years.at(-1)!,
  };
}

export function orderLifeStagesFromPresent(stages: LifeStageView[]): LifeStageView[] {
  return [...stages].sort((a, b) => {
    if (a.current !== b.current) return Number(b.current) - Number(a.current);
    const aStart = stageInterval(a.range)?.start ?? Number.NEGATIVE_INFINITY;
    const bStart = stageInterval(b.range)?.start ?? Number.NEGATIVE_INFINITY;
    return bStart - aStart || b.order - a.order;
  });
}
