import type { LifeStageView } from "@the-way-here/shared";

const VIEWBOX_WIDTH = 1000;
const FIRST_BRANCH_Y = 188;
const BRANCH_ROW_GAP = 82;
const TURN_RADIUS = 24;

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

export interface ParallelStageRoute {
  originX: number;
  endX: number;
  endY: number;
  path: string;
}

export function buildParallelStageRoute(mainStageRanges: string[], parallelRange: string, row: number): ParallelStageRoute {
  const columns = Math.max(mainStageRanges.length, 1);
  const start = stageInterval(parallelRange)?.start;
  const containing = start === undefined ? -1 : mainStageRanges.findIndex((range) => {
    const interval = stageInterval(range);
    return Boolean(interval && start >= interval.start && start <= interval.end);
  });
  const preceding = start === undefined ? -1 : mainStageRanges
    .map((range, index) => ({ index, start: stageInterval(range)?.start }))
    .filter((stage): stage is { index: number; start: number } => stage.start !== undefined && stage.start <= start)
    .at(-1)?.index ?? -1;
  const column = containing >= 0 ? containing : preceding >= 0 ? preceding : columns - 1;
  const originX = Math.round((column / columns) * VIEWBOX_WIDTH);
  const endX = Math.round(((column + .5) / columns) * VIEWBOX_WIDTH);
  const endY = FIRST_BRANCH_Y + Math.max(row, 0) * BRANCH_ROW_GAP;
  const turnStartY = endY - TURN_RADIUS;
  const turnEndX = Math.min(originX + TURN_RADIUS, endX);
  return {
    originX,
    endX,
    endY,
    path: `M ${originX} 0 V ${turnStartY} Q ${originX} ${endY} ${turnEndX} ${endY} H ${endX}`,
  };
}

export function parallelStageFieldHeight(count: number): number {
  return count > 0 ? FIRST_BRANCH_Y + (count - 1) * BRANCH_ROW_GAP + 58 : 0;
}
