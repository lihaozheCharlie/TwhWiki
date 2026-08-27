import React from "react";
import type { LifeStageView } from "@the-way-here/shared";
import { buildParallelStageRoute, parallelStageFieldHeight } from "./life-atlas";

export function LifeStageRoute({ stages, selectedId, onSelect, compact = false, ariaLabel = "人生阶段轨迹" }: {
  stages: LifeStageView[];
  selectedId?: string;
  onSelect: (id: string) => void;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const mainStages = stages.filter((stage) => stage.lane === 0);
  const parallelStages = stages.filter((stage) => stage.lane > 0);
  const branchRoutes = parallelStages.map((stage, index) => buildParallelStageRoute(mainStages.map((item) => item.range), stage.range, index));
  const branchFieldHeight = parallelStageFieldHeight(parallelStages.length);
  return <div className={`atlas-route-field${compact ? " atlas-route-field--compact" : ""}`} style={{ "--atlas-columns": Math.max(mainStages.length, 1) } as React.CSSProperties}>
    <div className="atlas-route" role="listbox" aria-label={ariaLabel}>
      <div className="atlas-route-line" aria-hidden="true" />
      {mainStages.map((stage, index) => <button key={stage.page.id} role="option" aria-selected={selectedId === stage.page.id} className={`${selectedId === stage.page.id ? "active" : ""}${stage.current ? " current" : ""}`} onClick={() => onSelect(stage.page.id)}>
        <span className="atlas-node">{String(index + 1).padStart(2, "0")}</span><time>{stage.range}</time><b>{stage.page.title.split("：")[0]}</b>{stage.current && <em>正在这里</em>}
      </button>)}
    </div>
    {parallelStages.length > 0 && <div className="atlas-parallel-routes" aria-label="并行人生线" style={{ "--branch-field-height": `${branchFieldHeight}px` } as React.CSSProperties}>
      <svg className="atlas-branch-network" viewBox={`0 0 1000 ${branchFieldHeight}`} preserveAspectRatio="none" aria-hidden="true">{branchRoutes.map((route, index) => <path key={parallelStages[index]!.page.id} d={route.path} vectorEffect="non-scaling-stroke" />)}</svg>
      {parallelStages.map((stage, index) => {
        const route = branchRoutes[index]!;
        return <button key={stage.page.id} style={{ left: `${route.endX / 10}%`, top: `${route.endY}px` }} aria-pressed={selectedId === stage.page.id} className={`atlas-parallel-stage${selectedId === stage.page.id ? " active" : ""}`} onClick={() => onSelect(stage.page.id)}><i aria-hidden="true" /><span><time>{stage.range}</time><b>{stage.page.title.split("：")[0]}</b></span>{stage.current && <em>进行中</em>}</button>;
      })}
    </div>}
  </div>;
}
