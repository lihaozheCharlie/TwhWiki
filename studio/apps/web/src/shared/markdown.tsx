import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { NavLink } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WikiPage } from "@the-way-here/shared";
import { api } from "../api";
import { apiPageHref, pageHref, useReturnContext } from "./routing";

type MarkdownOutlineItem = { id: string; label: string; level: number };

export function shouldEnterDocumentEditMode({ clickCount, insideControl }: { clickCount: number; insideControl: boolean }): boolean {
  return clickCount === 2 && !insideControl;
}

export function documentHeadingPrefix(pageId: string): string {
  return `document-${pageId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function markdownOutline(markdown: string, headingPrefix: string): MarkdownOutlineItem[] {
  const items: MarkdownOutlineItem[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const label = match[2]!
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_~`]/g, "")
      .trim();
    if (!label) continue;
    items.push({ id: `${headingPrefix}-heading-${items.length}`, label, level: match[1]!.length });
  }
  return items;
}

export function DocumentOutline({ markdown, headingPrefix, title = "本页目录", scrollContainerRef, inactive = false }: { markdown: string; headingPrefix: string; title?: string; scrollContainerRef?: RefObject<HTMLElement | null>; inactive?: boolean }) {
  const items = useMemo(() => markdownOutline(markdown, headingPrefix), [markdown, headingPrefix]);
  const [activeId, setActiveId] = useState(items[0]?.id || "");
  const outlineRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current;
    const headings = items.map((item) => document.getElementById(item.id)).filter((heading): heading is HTMLElement => Boolean(heading));
    if (!headings.length) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const threshold = scrollContainer
          ? scrollContainer.getBoundingClientRect().top + Math.min(44, scrollContainer.clientHeight * .12)
          : Math.min(160, window.innerHeight * .24);
        let current = headings[0]!;
        for (const heading of headings) {
          if (heading.getBoundingClientRect().top > threshold) break;
          current = heading;
        }
        const reachedEnd = scrollContainer
          ? scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2
          : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        setActiveId((reachedEnd ? headings.at(-1) : current)?.id || items[0]!.id);
      });
    };
    update();
    const eventTarget: HTMLElement | Window = scrollContainer || window;
    eventTarget.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (scrollContainer) resizeObserver?.observe(scrollContainer);
    return () => {
      eventTarget.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items, scrollContainerRef]);

  useEffect(() => {
    const outline = outlineRef.current;
    const activeLink = [...(outline?.querySelectorAll<HTMLAnchorElement>("a") || [])]
      .find((link) => link.hash === `#${activeId}`);
    if (!outline || !activeLink) return;
    const outlineRect = outline.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    if (linkRect.top < outlineRect.top) outline.scrollTop -= outlineRect.top - linkRect.top;
    else if (linkRect.bottom > outlineRect.bottom) outline.scrollTop += linkRect.bottom - outlineRect.bottom;
  }, [activeId]);

  if (items.length < 2) return null;
  const baseLevel = Math.min(...items.map((item) => item.level));
  return <nav ref={outlineRef} className="document-outline" aria-label={title}>
    <div>
      <h3>{title}</h3>
      <ol>{items.map((item) => <li key={item.id} style={{ "--outline-depth": Math.min(item.level - baseLevel, 3) } as React.CSSProperties}>{inactive
        ? <span>{item.label}</span>
        : <a className={activeId === item.id ? "active" : ""} aria-current={activeId === item.id ? "location" : undefined} href={`#${item.id}`} title={item.label} onClick={(event) => { event.preventDefault(); setActiveId(item.id); const heading = document.getElementById(item.id); const scrollContainer = scrollContainerRef?.current; const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; if (heading && scrollContainer) { const top = scrollContainer.scrollTop + heading.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top - 24; scrollContainer.scrollTo({ top, behavior }); } else heading?.scrollIntoView({ behavior, block: "start" }); window.history.replaceState(window.history.state, "", `#${item.id}`); }}>{item.label}</a>}</li>)}</ol>
    </div>
  </nav>;
}

type NotePropertyKind = "text" | "aliases" | "tags" | "date" | "list" | "boolean";

function markdownWithoutFrontmatter(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown);
  return match ? markdown.slice(match[0].length).trimStart() : markdown;
}

function markdownDocumentParts(markdown: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown);
  return match ? { frontmatter: match[0], body: markdown.slice(match[0].length) } : { frontmatter: "", body: markdown };
}

function markdownWithoutSourceRelations(markdown: string): string {
  const result: string[] = [];
  let hiddenLevel = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading && hiddenLevel && heading[1]!.length <= hiddenLevel) hiddenLevel = 0;
    if (heading && /^(相关日记|关联)$/.test(heading[2]!.trim())) {
      hiddenLevel = heading[1]!.length;
      continue;
    }
    if (!hiddenLevel) result.push(line);
  }
  return result.join("\n").trimEnd();
}

function notePropertyKind(key: string, value: unknown): NotePropertyKind {
  const normalized = key.toLocaleLowerCase();
  if (normalized === "tags" || normalized === "tag") return "tags";
  if (normalized === "aliases" || normalized === "alias") return "aliases";
  if (["start", "end", "date", "created", "updated", "imported_at"].includes(normalized) || /\d{4}-\d{2}-\d{2}/.test(String(value || ""))) return "date";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "list";
  return "text";
}

function NotePropertyIcon({ kind }: { kind: NotePropertyKind }) {
  const content = kind === "tags"
    ? <><path d="M4 5.5V11l8 8 7-7-8-8H5.5A1.5 1.5 0 0 0 4 5.5Z" /><circle cx="8" cy="8" r="1" /></>
    : kind === "aliases"
      ? <><path d="M8 8h8v8" /><path d="m8 16 8-8" /><path d="M5 12v6a1 1 0 0 0 1 1h6" /></>
      : kind === "date"
        ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>
        : kind === "boolean"
          ? <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></>
          : kind === "list"
            ? <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></>
            : <><path d="M5 7h14M5 12h10M5 17h14" /></>;
  return <svg className="note-property-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{content}</svg>;
}

function propertyLabel(value: unknown, kind: NotePropertyKind): string {
  if (value === null || value === undefined || value === "") return "没有值";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).replace(/^\[\[/, "").replace(/\]\]$/, "");
  return kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.replaceAll("-", "/") : text;
}

function propertyHasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(propertyHasValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(propertyHasValue);
  return true;
}

function NoteProperties({ properties, compact = false }: { properties: Record<string, unknown>; compact?: boolean }) {
  const entries = Object.entries(properties).filter(([, value]) => propertyHasValue(value));
  if (!entries.length) return null;
  return <section className={`note-properties${compact ? " compact" : ""}`} aria-label="笔记属性">
    {!compact && <h2>笔记属性</h2>}
    <dl>{entries.map(([key, value]) => {
      const kind = notePropertyKind(key, value);
      const values = Array.isArray(value) ? value : [value];
      return <div className={`note-property note-property--${kind}`} key={key}>
        <NotePropertyIcon kind={kind} />
        <dt>{key}</dt>
        <dd>{values.map((entry, index) => <span className={kind === "tags" || kind === "aliases" ? "note-property-token" : "note-property-value"} key={`${key}-${index}`}>{propertyLabel(entry, kind)}</span>)}</dd>
      </div>;
    })}</dl>
  </section>;
}

function pageNoteProperties(page: WikiPage): Record<string, unknown> {
  if (page.properties && Object.keys(page.properties).length) return Object.fromEntries(Object.entries(page.properties).filter(([, value]) => propertyHasValue(value)));
  const entries: Array<[string, unknown]> = [
    ["type", page.type],
    ["aliases", page.aliases.length ? page.aliases : undefined],
    ["tags", page.tags.length ? page.tags : undefined],
    ["status", page.status],
    ["Start", page.start],
    ["end", page.end],
    ["location", page.locations.length ? page.locations : undefined],
    ["source", page.sources.length ? page.sources : undefined],
  ];
  return Object.fromEntries(entries.filter((entry) => entry[1] !== undefined));
}

export function MarkdownBody({ children, headingPrefix, properties }: { children: string; headingPrefix?: string; properties?: Record<string, unknown> }) {
  const returnContext = useReturnContext();
  const markdown = markdownWithoutFrontmatter(children);
  const hasProperties = Boolean(properties && Object.keys(properties).length);
  const hasLevelOneHeading = /^#\s+.+$/m.test(markdown);
  let propertiesRendered = false;
  let headingIndex = 0;
  const nextHeadingId = () => headingPrefix ? `${headingPrefix}-heading-${headingIndex++}` : undefined;
  return <>{hasProperties && !hasLevelOneHeading ? <NoteProperties properties={properties!} /> : null}<ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children: label }) => href?.startsWith("/page/") ? <NavLink to={href} state={returnContext}>{label}</NavLink> : <a href={href} target="_blank" rel="noreferrer">{label}</a>,
    h1: ({ children: label }) => {
      const showProperties = hasProperties && !propertiesRendered;
      propertiesRendered = propertiesRendered || showProperties;
      return <><h1 id={nextHeadingId()}>{label}</h1>{showProperties ? <NoteProperties properties={properties!} /> : null}</>;
    },
    h2: ({ children: label }) => <h2 id={nextHeadingId()}>{label}</h2>,
    h3: ({ children: label }) => <h3 id={nextHeadingId()}>{label}</h3>,
    h4: ({ children: label }) => <h4 id={nextHeadingId()}>{label}</h4>,
  }}>{markdown}</ReactMarkdown></>;
}

type SavePageResult = { ok: boolean; modifiedAt?: string };

export function documentIdentity(relativePath: string): { folder: string; fileName: string } {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = (parts.pop() || "未命名.md").replace(/\.md$/i, "");
  const logicalRoot = parts.findIndex((part) => /^(wiki|原始知识库|sources?)$/i.test(part));
  const logicalParts = logicalRoot >= 0 ? parts.slice(logicalRoot + 1) : parts;
  return { folder: logicalParts.map((part) => part === "imported" ? "待整理" : part).join(" / ") || "知识库", fileName };
}

export function EditableDocument({ page, variant = "reader", startEditing = false, showOutline = false, showIdentity = true, identityActions, fileNameFocusToken = 0, beforeContent, afterContent, onRenamed }: { page: WikiPage; variant?: "reader" | "preview"; startEditing?: boolean; showOutline?: boolean; showIdentity?: boolean; identityActions?: ReactNode; fileNameFocusToken?: number; beforeContent?: ReactNode; afterContent?: ReactNode; onRenamed?: (page: WikiPage) => void }) {
  const identity = documentIdentity(page.relativePath);
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(page.markdown);
  const [fileName, setFileName] = useState(identity.fileName);
  const [saveState, setSaveState] = useState("已同步");
  const pageIdRef = useRef(page.id);
  const draftRef = useRef(page.markdown);
  const lastSavedRef = useRef(page.markdown);
  const fileNameRef = useRef(identity.fileName);
  const lastSavedFileNameRef = useRef(identity.fileName);
  const expectedModifiedAtRef = useRef(page.modifiedAt);
  const savingRef = useRef(false);
  const renamingRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileNameInputRef = useRef<HTMLInputElement>(null);
  const documentBodyRef = useRef<HTMLDivElement>(null);
  const documentScrollTopRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pageIdRef.current === page.id) return;
    pageIdRef.current = page.id;
    draftRef.current = page.markdown;
    lastSavedRef.current = page.markdown;
    expectedModifiedAtRef.current = page.modifiedAt;
    pendingRef.current = null;
    const nextIdentity = documentIdentity(page.relativePath);
    fileNameRef.current = nextIdentity.fileName;
    lastSavedFileNameRef.current = nextIdentity.fileName;
    setDraft(page.markdown);
    setFileName(nextIdentity.fileName);
    setEditing(startEditing);
    setSaveState("已同步");
  }, [page.id, page.markdown, page.modifiedAt, startEditing]);

  useEffect(() => {
    if (!fileNameFocusToken) return;
    fileNameInputRef.current?.focus();
    fileNameInputRef.current?.select();
  }, [fileNameFocusToken]);

  useEffect(() => {
    if (pageIdRef.current !== page.id || expectedModifiedAtRef.current === page.modifiedAt) return;
    if (draftRef.current !== lastSavedRef.current) {
      setSaveState("文件已在别处更新，请退出编辑后刷新");
      return;
    }
    expectedModifiedAtRef.current = page.modifiedAt;
    lastSavedRef.current = page.markdown;
    draftRef.current = page.markdown;
    setDraft(page.markdown);
    setSaveState("已同步");
  }, [page.id, page.markdown, page.modifiedAt]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draftRef.current === lastSavedRef.current && fileNameRef.current === lastSavedFileNameRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useLayoutEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.style.height = "auto";
      editorRef.current.style.height = `${editorRef.current.scrollHeight}px`;
      editorRef.current.focus({ preventScroll: true });
    }
    window.scrollTo({ top: documentScrollTopRef.current, behavior: "auto" });
  }, [editing]);

  useLayoutEffect(() => {
    if (!editing || !editorRef.current) return;
    editorRef.current.style.height = "auto";
    editorRef.current.style.height = `${editorRef.current.scrollHeight}px`;
  }, [editing, draft]);

  async function persist(content: string): Promise<void> {
    pendingRef.current = content;
    if (savingRef.current) return;
    while (renamingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 40));
    savingRef.current = true;
    while (pendingRef.current !== null) {
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next === lastSavedRef.current) continue;
      if (mountedRef.current) setSaveState("正在保存…");
      try {
        const result = await api<SavePageResult>(apiPageHref(pageIdRef.current), {
          method: "PUT",
          body: JSON.stringify({ markdown: next, expectedModifiedAt: expectedModifiedAtRef.current }),
        });
        lastSavedRef.current = next;
        if (result.modifiedAt) expectedModifiedAtRef.current = result.modifiedAt;
        if (mountedRef.current) setSaveState(draftRef.current === next ? "已自动保存" : "正在保存新修改…");
      } catch (reason: any) {
        pendingRef.current = null;
        if (mountedRef.current) setSaveState(`保存失败：${reason.message}`);
      }
    }
    savingRef.current = false;
  }

  async function persistFileName(value: string): Promise<void> {
    const next = value.trim().replace(/\.md$/i, "");
    if (!next) {
      setSaveState("文件名不能为空，请输入名称");
      return;
    }
    if (next === lastSavedFileNameRef.current || renamingRef.current) return;
    while (savingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 40));
    renamingRef.current = true;
    if (mountedRef.current) setSaveState("正在重命名…");
    try {
      const renamed = await api<WikiPage>("/api/pages/rename", {
        method: "POST",
        body: JSON.stringify({ pageId: pageIdRef.current, fileName: next, expectedModifiedAt: expectedModifiedAtRef.current }),
      });
      const nextIdentity = documentIdentity(renamed.relativePath);
      pageIdRef.current = renamed.id;
      expectedModifiedAtRef.current = renamed.modifiedAt;
      fileNameRef.current = nextIdentity.fileName;
      lastSavedFileNameRef.current = nextIdentity.fileName;
      if (mountedRef.current) {
        setFileName(nextIdentity.fileName);
        setSaveState("文件名已自动保存");
      }
      if (onRenamed) onRenamed(renamed);
      else window.location.assign(pageHref(renamed.id));
    } catch (reason: any) {
      if (mountedRef.current) setSaveState(`重命名失败：${reason.message}`);
    } finally {
      renamingRef.current = false;
    }
  }

  useEffect(() => {
    if (!editing || draft === lastSavedRef.current) return;
    setSaveState("有未保存更改");
    const timer = window.setTimeout(() => void persist(draft), 800);
    return () => window.clearTimeout(timer);
  }, [draft, editing]);

  useEffect(() => {
    if (fileName === lastSavedFileNameRef.current) return;
    setSaveState("文件名有未保存更改");
    const timer = window.setTimeout(() => void persistFileName(fileName), 1000);
    return () => window.clearTimeout(timer);
  }, [fileName]);

  function changeDraft(value: string) {
    draftRef.current = value;
    setDraft(value);
  }

  function changeDocumentBody(value: string) {
    const { frontmatter } = markdownDocumentParts(draftRef.current);
    changeDraft(`${frontmatter}${value}`);
  }

  function changeFileName(value: string) {
    const next = value.replace(/[\r\n]/g, "");
    fileNameRef.current = next;
    setFileName(next);
  }

  function beginEditing() {
    if (editing) return;
    documentScrollTopRef.current = window.scrollY;
    setEditing(true);
  }

  function requestEditing(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const insideControl = Boolean(target.closest("a, button, input, textarea, select, summary, [role='button'], [data-no-edit]"));
    if (shouldEnterDocumentEditMode({ clickCount: event.detail, insideControl })) beginEditing();
  }

  const headingPrefix = documentHeadingPrefix(page.id);
  const outlineVisible = showOutline && markdownOutline(draft, headingPrefix).length > 1;
  const properties = pageNoteProperties(page);
  const propertiesPinned = true;
  const documentBody = markdownDocumentParts(draft).body;
  const indexedMarkdown = draft === page.markdown ? page.renderedMarkdown : documentBody;
  const readingMarkdown = page.isSource ? markdownWithoutSourceRelations(indexedMarkdown) : indexedMarkdown;
  const statusMessage = editing ? saveState : saveState === "已同步" ? "双击正文开始修改 · 自动保存" : saveState;

  return <section className={`editable-document editable-document--${variant}${showIdentity ? "" : " knowledge-document"}${editing ? " editing" : ""}${outlineVisible ? " has-outline" : ""}`}>
    {showIdentity && <header className="editable-document-identity">
      <div><small>{identity.folder}</small><label className="document-file-name"><span className="sr-only">文件名</span><input ref={fileNameInputRef} name={`file-name-${page.id}`} autoComplete="off" aria-label={`${page.title} 文件名`} style={{ width: `${Math.min(Math.max(fileName.length * 1.08 + 2, 12), 37)}em` }} value={fileName} onChange={(event) => changeFileName(event.target.value)} onBlur={() => void persistFileName(fileNameRef.current)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { changeFileName(lastSavedFileNameRef.current); event.currentTarget.blur(); } }} spellCheck={false} /></label></div>
      <div className="editable-document-identity-actions"><span className="document-save-state" aria-live="polite"><i className={saveState.includes("失败") || saveState.includes("不能为空") ? "error" : ""} />{statusMessage}{editing && <kbd>⌘ S</kbd>}</span>{identityActions}</div>
    </header>}
    {!showIdentity && <div className="editable-document-toolbar"><span aria-live="polite"><i className={saveState.includes("失败") || saveState.includes("不能为空") ? "error" : ""} />{statusMessage}</span>{editing && <kbd>⌘ S</kbd>}</div>}
    {propertiesPinned && Object.keys(properties).length > 0 && <div className="editable-document-properties"><NoteProperties properties={properties} compact /></div>}
    {editing ? <textarea ref={editorRef} name={`page-${page.id}`} aria-label={`${page.title} Markdown 正文`} value={documentBody} onChange={(event) => changeDocumentBody(event.target.value)} onBlur={() => { documentScrollTopRef.current = window.scrollY; void persist(draftRef.current); setEditing(false); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "s") { event.preventDefault(); void persist(draftRef.current); } if (event.key === "Escape") event.currentTarget.blur(); }} spellCheck={false} /> : <div ref={documentBodyRef} className="editable-document-body editable-document-activate" role="textbox" aria-label={`${page.title} 正文，双击后编辑`} aria-readonly="true" tabIndex={0} onDoubleClick={requestEditing} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); beginEditing(); } }}>{beforeContent}<MarkdownBody headingPrefix={headingPrefix} properties={propertiesPinned ? undefined : properties}>{readingMarkdown}</MarkdownBody>{afterContent}</div>}
    {outlineVisible && <DocumentOutline markdown={draft} headingPrefix={headingPrefix} inactive={editing} />}
  </section>;
}
