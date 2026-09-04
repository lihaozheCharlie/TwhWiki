import { useId, useRef } from "react";
import type { PhotoPerson } from "@the-way-here/shared";
import { PhotoPersonPicker } from "./PhotoPersonPicker";
import { clampPhotoBox } from "./photo-model";

export function PhotoPeopleEditor({ people, editing, selectedId, locked, onSelect, onChange, onRemove }: {
  people: Array<{ id: string; title: string }>;
  editing: PhotoPerson[];
  selectedId: string;
  locked: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<PhotoPerson>) => void;
  onRemove: (id: string) => void;
}) {
  const prefix = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, editing.findIndex((p) => p.id === selectedId));
  const person = editing[index];
  if (!person) return null;
  return <>
    <div className="photo-person-tabs" role="tablist" aria-label="照片里的人物">
      {editing.map((p, i) => <button type="button" key={p.id} ref={(node) => { tabs.current[i] = node; }} role="tab" id={`${prefix}-tab-${i}`} aria-selected={i === index} aria-controls={`${prefix}-panel`} tabIndex={i === index ? 0 : -1}
        onClick={() => onSelect(p.id)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (i + 1) % editing.length : event.key === "ArrowLeft" ? (i + editing.length - 1) % editing.length : event.key === "Home" ? 0 : event.key === "End" ? editing.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); onSelect(editing[next]!.id); tabs.current[next]?.focus(); tabs.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}>{p.name || `人物 ${i + 1}`}</button>)}
    </div>
    <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-tab-${index}`} tabIndex={0}>
      <fieldset className="photo-person-editor" key={person.id} disabled={locked}>
        <legend>人物 {index + 1} · 共 {editing.length} 人</legend>
        <PhotoPersonPicker person={person} people={people} onChange={(patch) => onChange(person.id, patch)} />
        <details><summary>调整裁剪范围</summary>{(["x", "y", "width", "height"] as const).map((axis, i) => <label className="photo-crop-control" key={axis}>{["左右位置", "上下位置", "宽度", "高度"][i]}<input aria-label={`人物 ${index + 1} ${["左右位置", "上下位置", "宽度", "高度"][i]}`} type="range" min={axis === "x" || axis === "y" ? 0 : 0.02} max={1} step={0.01} value={person.box[axis]} onChange={(event) => onChange(person.id, { box: clampPhotoBox({ ...person.box, [axis]: Number(event.target.value) }) })} /></label>)}</details>
        <button type="button" className="photo-skip" onClick={() => onRemove(person.id)}>不记录这个人</button>
      </fieldset>
    </div>
  </>;
}
