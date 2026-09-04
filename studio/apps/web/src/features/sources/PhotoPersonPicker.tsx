import { useId, useState } from "react";
import type { PhotoPerson } from "@the-way-here/shared";

type PersonOption = { id: string; title: string };
export function matchingPhotoPeople(people: PersonOption[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  return people.filter((person) => person.title.toLocaleLowerCase().includes(term));
}

export function PhotoPersonPicker({ person, people, onChange }: { person: PhotoPerson; people: PersonOption[]; onChange: (patch: Partial<PhotoPerson>) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = matchingPhotoPeople(people, query);
  const options = [...matches.map((p) => ({ pageId: p.id, name: p.title })), { pageId: undefined, name: query.trim() }];
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange({ ...option, useAsAvatar: true });
    setOpen(false); setQuery("");
  }
  return <>
    <div className="photo-person-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <label htmlFor={id}>关联人物</label>
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        value={open ? query : person.name} placeholder="搜索人物，或填写新名字" autoComplete="off" maxLength={100}
        onFocus={() => { setQuery(""); setActive(0); setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((index) => (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length); }
          if (event.key === "Enter" && open) { event.preventDefault(); choose(active); }
        }} />
      {open ? <div id={`${id}-list`} role="listbox" aria-label="匹配的人物" className="photo-person-options">
        {!matches.length ? <p>没有找到已有的人物</p> : null}
        {options.map((option, index) => <button type="button" role="option" id={`${id}-option-${index}`} aria-selected={index === active} key={option.pageId ?? "new"} tabIndex={-1}
          ref={(node) => { if (index === active) node?.scrollIntoView({ block: "nearest" }); }}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>{option.pageId ? option.name : query.trim() ? `新人物：${query.trim()}` : "新人物 / 自己填写"}</button>)}
      </div> : null}
    </div>
    {!person.pageId ? <label>怎么称呼<input value={person.name} maxLength={100} onChange={(event) => onChange({ name: event.target.value, useAsAvatar: true })} placeholder="姓名、称呼，或“我”" /></label> : null}
  </>;
}
