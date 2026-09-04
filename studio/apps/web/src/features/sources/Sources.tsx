import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import type { PaymentJourneySummary, SourceImportBatch, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { graphCategoryNames, type ReturnContext } from "../../app/config";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent } from "../collaboration/model";
import { EditableDocument, MarkdownBody, documentIdentity } from "../../shared/markdown";
import { apiPageHref, pageDestination, pageHref } from "../../shared/routing";
import { ConfirmDeleteDialog } from "../../shared/ConfirmDeleteDialog";
import { Empty, Icon, Loading } from "../../shared/ui";
import { TimelineFilter } from "../../shared/TimelineFilter";
import { ImportMaterialsModal, RecordImportTrigger } from "./ImportMaterialsModal";
import { PhotoMemoryPanel } from "./PhotoMemoryPanel";
import { sourceFolderOptions, useSourceFolders } from "./source-folders";
import { buildableSourceRecordForPage, cleanSourcePath, countRecentSources, importedFolderForBatch, pendingSourceBuildRecords, sourceBuildActionPresentation, sourceBuildPresentation, sourceBuildRecordForPage, sourceBuildRecords, sourceMonthOptions, sourceRecordDate, sourceRecordMonth, sourceRecordType, sourceRecordTypes, type SourceBuildRecord, type SourceRecordType } from "./source-model";

function sourceBuildTitle(record: SourceBuildRecord): string {
  return cleanSourcePath(record.file.storedPath).split("/").at(-1)?.replace(/\.md$/i, "") || record.file.originalName;
}

type SourceItemAction = {
  label: string;
  icon?: "build" | "edit" | "trash";
  danger?: boolean;
  onSelect: () => void;
};

function SourceItemMenu({ label, actions }: { label: string; actions: SourceItemAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return <span ref={rootRef} className={`source-item-menu source-item-menu--row${open ? " is-open" : ""}`}>
    <button ref={triggerRef} type="button" className="source-item-menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}><Icon name="more" size={16} /></button>
    {open ? <span id={menuId} className="source-item-menu-popover" role="menu">{actions.map((action, index) => <React.Fragment key={action.label}>{index > 0 && action.danger ? <i className="source-item-menu-divider" aria-hidden="true" /> : null}<button type="button" role="menuitem" className={action.danger ? "danger" : ""} onClick={() => { setOpen(false); action.onSelect(); }}>{action.icon ? <Icon name={action.icon} size={14} /> : null}{action.label}</button></React.Fragment>)}</span> : null}
  </span>;
}

type SourceBuildIntent = "enrich" | "build";

function SourceBuildConfirmAction({ record, busy, onConfirm, detail = false }: { record: SourceBuildRecord; busy: boolean; onConfirm: () => void; detail?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: -1000, top: -1000 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const placePopover = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(310, window.innerWidth - 24);
      const height = popover.offsetHeight || 180;
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      const below = rect.bottom + 10;
      const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - height - 10);
      setPosition({ left, top });
    };
    const dismiss = (event: PointerEvent) => {
      if (popoverRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    placePopover();
    cancelRef.current?.focus();
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  return <>
    <button ref={triggerRef} type="button" className={`source-build-action is-build-ready${detail ? " is-detail" : ""}`} disabled={busy} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? titleId : undefined} onClick={() => setOpen((value) => !value)}><Icon name="build" size={13} />{busy ? "正在准备…" : "构建这份记录"}</button>
    {open ? createPortal(<div ref={popoverRef} className="source-build-confirm" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId} style={position}>
      <b id={titleId}>把「{sourceBuildTitle(record)}」构建进 Wiki？</b>
      <p id={descriptionId}>只会采用这份报告中已经确认的叙述；候选线索和交易明细不会被当作事实。构建后仍可以回来继续聊。</p>
      <div><button ref={cancelRef} type="button" className="source-build-confirm-cancel" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>再想想</button><button type="button" className="source-build-confirm-submit" onClick={() => { setOpen(false); onConfirm(); }}>确认构建</button></div>
    </div>, document.body) : null}
  </>;
}

function SourceBuildAction({ record, busy, onStart, detail = false }: { record: SourceBuildRecord; busy: boolean; onStart: (record: SourceBuildRecord, intent?: SourceBuildIntent) => void; detail?: boolean }) {
  if (record.batch.channel === "photos") return <button type="button" className="source-build-action is-dialogue" disabled={busy} onClick={() => onStart(record, "enrich")}><Icon name="image" size={13} />打开照片记忆</button>;
  const { file } = record;
  const action = sourceBuildActionPresentation(file);
  if (action.kind === "hidden") return null;
  if (file.buildKind === "dialogue") {
    const chatAction = action.kind === "open"
      ? <button type="button" className={`source-build-action is-quiet${detail ? " is-detail" : ""}`} onClick={() => openContextAgent({ runId: action.runId })}><Icon name="message" size={13} />{action.label}</button>
      : <button type="button" className={`source-build-action is-dialogue${detail ? " is-detail" : ""}`} disabled={busy} onClick={() => onStart(record, "enrich")}><Icon name="message" size={13} />{busy ? "正在准备…" : action.label}</button>;
    return <div className={`source-journey-actions${detail ? " is-detail" : ""}`}>
      {detail ? <div className="source-journey-action-col">{chatAction}<small>只更新这份记录，不影响 Wiki</small></div> : chatAction}
      {file.buildStatus === "ready-to-build" ? detail
        ? <div className="source-journey-action-col"><SourceBuildConfirmAction record={record} busy={busy} detail onConfirm={() => onStart(record, "build")} /><small>确认后写入 Wiki，之后仍可继续聊</small></div>
        : <SourceBuildConfirmAction record={record} busy={busy} onConfirm={() => onStart(record, "build")} /> : null}
    </div>;
  }
  if (action.kind === "open") return <button type="button" className="source-build-action is-quiet" onClick={() => openContextAgent({ runId: action.runId })}>{action.label}</button>;
  return <button type="button" className={`source-build-action is-${file.buildKind}`} disabled={busy} onClick={() => onStart(record)}>{file.buildKind === "direct" && !busy ? <Icon name="build" size={13} /> : null}{busy ? "正在准备…" : action.label}</button>;
}

function SourceJourneyContext({ file }: { file: SourceBuildRecord["file"] }) {
  const status = file.buildStatus || "needs-dialogue";
  const dialogueDone = ["ready-to-build", "building", "built"].includes(status);
  const dialogueCurrent = !dialogueDone;
  const buildCurrent = status === "building";
  const buildDone = status === "built";
  const message = buildDone
    ? "这份记录已经构建进 Wiki。你仍可以继续聊来完善来源；有新的补充后，会再次由你决定是否更新 Wiki。"
    : buildCurrent
      ? "正在把已经确认的叙述构建进 Wiki。候选线索和规范化交易只用于核对，不会被当作已经确认的人生事实。"
      : status === "ready-to-build"
        ? "这份内容还只是草稿。对话补充已经保存在来源记录中；只有确认构建后，它才会进入 Wiki。"
        : status === "in-dialogue"
          ? "对话正在完善这份来源记录，不会修改 Wiki。等内容准备好后，再由你决定是否构建。"
          : "账单中的聚类只是回忆候选，还不是人生事实。先聊聊人物、动机或感受，再决定是否构建。";
  return <section className="source-journey-context" data-no-edit>
    <ol className="source-journey-progress" aria-label="消费账单构建进度">
      <li className="done"><i aria-hidden="true" /><b>账单解析</b></li><li className={`rail${dialogueDone ? " done" : ""}`} aria-hidden="true" />
      <li className={`${dialogueDone ? "done" : dialogueCurrent ? "current" : ""}`}><i aria-hidden="true" /><b>对话完善</b><span>可反复</span></li><li className={`rail${buildDone ? " done" : ""}`} aria-hidden="true" />
      <li className={`${buildDone ? "done" : buildCurrent ? "current" : ""}`}><i aria-hidden="true" /><b>构建入 Wiki</b></li>
    </ol>
    <p className={`source-journey-callout is-${buildDone ? "done" : buildCurrent ? "progress" : status === "ready-to-build" ? "ready" : "draft"}`}><Icon name={buildDone ? "check" : "history"} size={15} /><span>{message}</span></p>
  </section>;
}

function ImportedBatchGuide({ batch, busyPath, onStart, onStartAll, onDefer }: { batch: SourceImportBatch; busyPath?: string; onStart: (record: SourceBuildRecord, intent?: SourceBuildIntent) => void; onStartAll: (records: SourceBuildRecord[]) => void; onDefer: (records: SourceBuildRecord[]) => void }) {
  const records = sourceBuildRecords([batch]).filter(({ file }) => !["built", "deferred"].includes(file.buildStatus || "ready"));
  if (!records.length) return null;
  const hasActive = records.some(({ file }) => file.buildStatus === "building" || file.buildStatus === "in-dialogue");
  const directRecords = records.filter(({ file }) => file.buildKind === "direct" && file.buildStatus === "ready");
  const shownRecords = records.slice(0, 5);
  return <section className="source-import-guide" aria-labelledby={`source-import-guide-${batch.id}`}>
    <header><div><span className="source-import-guide-mark" aria-hidden="true"><Icon name="check" size={16} /></span><div><h2 id={`source-import-guide-${batch.id}`}>已收好 {batch.fileCount} 份新记录</h2><p>原文已经保存。下面这一步决定它们怎样进入已有理解，你也可以稍后再说。</p></div></div><time>{new Date(batch.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></header>
    <div className="source-import-guide-list">{shownRecords.map((record) => {
      const state = sourceBuildPresentation(record.file);
      return <article key={record.file.storedPath}><div><b>{sourceBuildTitle(record)}</b><span>{record.file.buildKind === "direct" ? "这份记录语境完整，可以直接读懂" : record.file.buildKind === "dialogue" ? "账单只留下线索，需要你说出背后的故事" : "我还不确定这份材料是什么"}</span></div><div className="source-import-guide-state"><span className={`source-build-chip is-${state.tone}`}><i aria-hidden="true" />{state.label}</span><SourceBuildAction record={record} busy={busyPath === record.file.storedPath} onStart={onStart} /></div></article>;
    })}</div>
    {!hasActive ? <footer><span>{records.length > shownRecords.length ? `另有 ${records.length - shownRecords.length} 份，` : ""}这些记录会继续留在完整列表里。</span><div>{directRecords.length > 1 ? <button type="button" className="source-import-build-all" onClick={() => onStartAll(directRecords)}><Icon name="build" size={13} />批量构建 {directRecords.length} 份</button> : null}<button type="button" onClick={() => onDefer(records)}>稍后再说</button></div></footer> : null}
  </section>;
}

function SourceKnowledgeConnections({ page }: { page: WikiPage }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const related = (page.relatedPages || []).filter((item) => !item.isSource && item.category !== "maintenance");
  if (!related.length) return null;
  const letters = related.filter((item) => item.category === "letters");
  const knowledge = related.filter((item) => item.category !== "letters");
  const shown = expanded ? knowledge : knowledge.slice(0, 8);
  const returnContext: ReturnContext = { returnTo: `${location.pathname}${location.search}`, returnLabel: "返回这篇原始记录" };
  return <section className="source-knowledge-connections" aria-labelledby={`source-connections-${page.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`}>
    <header>
      <div><h2 id={`source-connections-${page.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`}>这篇记录长出的知识</h2><p>构建后的判断、人物与人生脉络都从这里继续；文件底部的双链仍保留在 Markdown 中。</p></div>
      <span>{related.length} 个页面</span>
    </header>
    {letters[0] && <NavLink className="source-letter-feature" to={pageDestination(letters[0])} state={returnContext}>
      <div><span><Icon name="spark" size={15} />近况回信</span><h3>{letters[0].title}</h3><p>{letters[0].excerpt || "沿着这篇记录，留下一封可以从未来回看的信。"}</p></div>
      <i><Icon name="arrow" size={17} /></i>
    </NavLink>}
    {shown.length > 0 && <nav className="source-related-knowledge" aria-label="这篇原始记录关联的知识页面">
      {shown.map((item) => <NavLink key={item.id} to={pageHref(item.id)} state={returnContext}>
        <span>{graphCategoryNames[item.category] || item.category}</span>
        <b>{item.title}</b>
        <i><Icon name="arrow" size={14} /></i>
        <p className="source-related-peek">{item.excerpt || "打开页面继续阅读完整内容。"}</p>
      </NavLink>)}
    </nav>}
    {knowledge.length > 8 && <button type="button" className="source-related-more" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "收起部分页面" : `查看全部 ${knowledge.length} 个知识页面`}<Icon name={expanded ? "back" : "arrow"} size={14} /></button>}
  </section>;
}

function SourcePreview({ page, revision, startEditing = false, fileNameFocusToken = 0, buildRecord, buildBusy = false, onStartBuild, onRenamed }: { page: WikiPageSummary; revision: number; startEditing?: boolean; fileNameFocusToken?: number; buildRecord?: SourceBuildRecord; buildBusy?: boolean; onStartBuild: (record: SourceBuildRecord, intent?: SourceBuildIntent) => void; onRenamed: (page: WikiPage) => void }) {
  const { data, loading, error } = useApi<WikiPage>(apiPageHref(page.id), revision);
  const journeyRecord = buildRecord?.file.buildKind === "dialogue" ? buildRecord : undefined;
  if (data?.importChannel === "photos") return <section className="source-preview source-preview-photo"><header className="source-preview-photo-header"><h2>用户确认的记忆来源</h2><p>请在上方照片工作区修改人物和讲述；这里保留可追溯的确认稿。</p></header><MarkdownBody>{data.markdown}</MarkdownBody><SourceKnowledgeConnections key={data.id} page={data} /></section>;
  return <article className="source-preview">
    {loading ? <Loading label="正在展开正文" /> : error || !data ? <Empty>{error || "正文暂时无法读取"}</Empty> : <EditableDocument page={data} variant="preview" startEditing={startEditing} showOutline identityActions={journeyRecord ? <SourceBuildAction record={journeyRecord} busy={buildBusy} onStart={onStartBuild} detail /> : undefined} fileNameFocusToken={fileNameFocusToken} beforeContent={journeyRecord ? <SourceJourneyContext file={journeyRecord.file} /> : null} afterContent={<SourceKnowledgeConnections key={data.id} page={data} />} onRenamed={onRenamed} />}
  </article>;
}

function NewSourceForm({ folder, folders, foldersLoading, foldersError, onCancel, onCreated }: { folder: string; folders: string[]; foldersLoading: boolean; foldersError?: string; onCancel: () => void; onCreated: (page: WikiPage) => void }) {
  const [title, setTitle] = useState("");
  const [targetFolder, setTargetFolder] = useState(folder);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("输入文件名后再创建。");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const page = await api<WikiPage>("/api/sources", { method: "POST", body: JSON.stringify({ title: title.trim(), folder: targetFolder.trim() }) });
      onCreated(page);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setCreating(false);
    }
  }

  return <form className="new-source-form" onSubmit={create}>
    <header><div><span>写一条生活记录</span><b>创建 Markdown 文件</b></div><button type="button" onClick={onCancel} aria-label="关闭新建文件">×</button></header>
    <label>文件名<input name="new-source-title" autoComplete="off" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：今天的观察…" /></label>
    <label>保存到<select name="new-source-folder" value={targetFolder} onChange={(event) => setTargetFolder(event.target.value)} aria-busy={foldersLoading}><option value="">生活记录根目录</option>{folders.map((folderOption) => <option value={folderOption} key={folderOption}>{folderOption}</option>)}</select>{foldersLoading ? <small>正在读取文件夹…</small> : foldersError ? <small role="status">文件夹列表暂时无法刷新，仍可保存到当前显示的位置。</small> : null}</label>
    <footer><span aria-live="polite">{error || "创建后会直接进入编辑，内容自动保存。"}</span><button disabled={creating}>{creating ? "正在创建…" : "创建文件"}</button></footer>
  </form>;
}

export function OrganizedSources({ revision }: { revision: number }) {
  const { data, loading } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  const { data: sourceFolders, loading: sourceFoldersLoading, error: sourceFoldersError } = useSourceFolders(revision);
  const [params, setParams] = useSearchParams();
  const [creatingSource, setCreatingSource] = useState(false);
  const [createdPageId, setCreatedPageId] = useState<string>();
  const [folderPaneOpen, setFolderPaneOpen] = useState(true);
  const [filePaneOpen, setFilePaneOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [recentJourney, setRecentJourney] = useState<PaymentJourneySummary>();
  const [recentBatch, setRecentBatch] = useState<SourceImportBatch>();
  const [busyBuildPath, setBusyBuildPath] = useState<string>();
  const [buildError, setBuildError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "file"; page: WikiPageSummary } | { kind: "folder"; folder: string; count: number }>();
  const [selectedBuildPaths, setSelectedBuildPaths] = useState<Set<string>>(() => new Set());
  const [renameRequest, setRenameRequest] = useState<{ pageId: string; token: number }>();
  useEffect(() => {
    if (!creatingSource && !importOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCreatingSource(false);
      setImportOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [creatingSource, importOpen]);
  const pages = data || [];
  const buildRecords = sourceBuildRecords(importBatches || []);
  const pendingBuilds = pendingSourceBuildRecords(importBatches || []);
  const shownBatch = recentBatch || importBatches?.find((batch) => batch.id === params.get("batch"));
  const query = params.get("q") || "";
  const folder = params.get("folder") || "";
  const requestedType = params.get("type") || "all";
  const type = (requestedType === "pending" || sourceRecordTypes.some((item) => item.id === requestedType) ? requestedType : "all") as "all" | SourceRecordType | "pending";
  const month = params.get("month") || "";
  const folderCounts = new Map<string, number>();
  for (const page of pages) {
    const parts = cleanSourcePath(page.relativePath).split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const key = parts.slice(0, depth).join("/");
      folderCounts.set(key, (folderCounts.get(key) || 0) + 1);
    }
  }
  const folderPaths = sourceFolderOptions(sourceFolders, folder);
  const folders = (sourceFolders ? folderPaths : [...folderCounts.keys()].sort((left, right) => left.localeCompare(right, "zh-CN"))).map((name) => [name, folderCounts.get(name) || 0] as const);
  const months = sourceMonthOptions(pages);
  const recentCount = countRecentSources(pages);
  const filtered = pages.filter((page) => {
    const sourcePath = cleanSourcePath(page.relativePath);
    return (!folder || sourcePath.startsWith(`${folder}/`))
      && (type === "all" ? true : type === "pending" ? Boolean(sourceBuildRecordForPage(page, pendingBuilds)) : sourceRecordType(page) === type)
      && (!month || sourceRecordMonth(page) === month)
      && `${page.title} ${sourcePath} ${page.excerpt}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => sourceRecordDate(b).getTime() - sourceRecordDate(a).getTime());
  const requestedLimit = Number.parseInt(params.get("limit") || "120", 10);
  const visibleLimit = Number.isFinite(requestedLimit) ? Math.max(120, requestedLimit) : 120;
  const visiblePages = filtered.slice(0, visibleLimit);
  const selected = filtered.find((page) => page.id === params.get("file")) || filtered[0];
  const selectedBuildRecord = selected ? sourceBuildRecordForPage(selected, buildRecords) : undefined;
  const photoBatch = shownBatch?.channel === "photos" ? shownBatch : selectedBuildRecord?.batch.channel === "photos" ? selectedBuildRecord.batch : undefined;
  const filteredPaths = new Set(filtered.map((page) => cleanSourcePath(page.relativePath)));
  const selectableBuildRecords = pendingBuilds.filter(({ file }) => file.buildKind === "direct"
    && ["ready", "deferred"].includes(file.buildStatus || "ready")
    && filteredPaths.has(cleanSourcePath(file.storedPath)));
  const selectableBuildPaths = selectableBuildRecords.map(({ file }) => file.storedPath);
  const selectableBuildKey = selectableBuildPaths.join("\n");
  useEffect(() => {
    if (type !== "pending") return;
    setSelectedBuildPaths(new Set(selectableBuildPaths));
  }, [type, selectableBuildKey]);
  const selectedBuildRecords = selectableBuildRecords.filter(({ file }) => selectedBuildPaths.has(file.storedPath));
  const allSelectableBuildsSelected = selectableBuildRecords.length > 0 && selectedBuildRecords.length === selectableBuildRecords.length;
  const anySelectableBuildsSelected = selectedBuildRecords.length > 0;
  const recentJourneyRecord = useMemo(() => recentBatch?.files.find((file) => file.storedPath === recentJourney?.reportPath && file.buildKind === "dialogue"), [recentBatch, recentJourney?.reportPath]);
  const agentContext = useMemo(() => selectedBuildRecord?.file.buildKind === "dialogue" ? {
    scope: "消费旅程",
    title: selected?.title || sourceBuildTitle(selectedBuildRecord),
    pageId: selected?.id,
    summary: selected?.excerpt || `${selectedBuildRecord.file.clueCount || 0} 条账单线索正在等待你补充真实语境。`,
    defaultMode: "read" as const,
    defaultOutputTarget: { kind: "journey-report" as const, importId: selectedBuildRecord.batch.id, storedPath: selectedBuildRecord.file.storedPath, label: "消费旅程报告" },
    defaultSourceContext: { importId: selectedBuildRecord.batch.id, storedPath: selectedBuildRecord.file.storedPath, flow: "dialogue" as const, operation: "enrich" as const },
    launcherLabel: selectedBuildRecord.file.dialogueRunId ? "继续聊聊" : "聊聊这段旅程",
    suggestions: selectedBuildRecord.batch.journey?.clusters.length
      ? [`请从「${selectedBuildRecord.batch.journey.clusters[0]!.title}」开始，一次问我一个关于人物、动机或感受的问题。`, "先从最有画面的一段线索开始，邀请我慢慢讲出来。"]
      : ["请从最完整的一条消费线索开始，一次只问我一个开放式问题。", "帮我从这份账单里找到值得继续讲述的一段经历。"],
  } : recentJourney && recentBatch && recentJourneyRecord ? {
    scope: "消费旅程",
    title: recentJourney.title,
    summary: `${recentJourney.transactionCount} 笔消费被串成 ${recentJourney.clusters.length} 组旅程线索。`,
    defaultMode: "read" as const,
    defaultOutputTarget: { kind: "journey-report" as const, importId: recentBatch.id, storedPath: recentJourneyRecord.storedPath, label: "消费旅程报告" },
    defaultSourceContext: { importId: recentBatch.id, storedPath: recentJourneyRecord.storedPath, flow: "dialogue" as const, operation: "enrich" as const },
    launcherLabel: "聊聊这段旅程",
    suggestions: [`请从「${recentJourney.title}」里最有画面的一段线索开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来。`, "先从最有画面的一次出行、聚会或生活变化开始，邀请我慢慢讲出来。"],
  } : {
    scope: "生活记录",
    title: selected?.title || "生活记录",
    pageId: selected?.id,
    summary: selected?.excerpt || `当前有 ${pages.length} 份原始记录。`,
    defaultMode: "read" as const,
    launcherLabel: "聊聊这份记录",
    suggestions: ["这份记录里有哪些还没有真正说清楚、值得我继续补充的地方？", "请概括这份记录，并区分事实、感受和后来的解释。"],
  }, [pages.length, recentBatch, recentJourney, recentJourneyRecord, selected?.excerpt, selected?.id, selected?.title, selectedBuildRecord]);
  if (loading || !data) return <Loading label="正在打开生活记录" />;
  function update(next: Record<string, string | undefined>) {
    setParams((current) => {
      const value = new URLSearchParams(current);
      for (const [key, entry] of Object.entries(next)) entry ? value.set(key, entry) : value.delete(key);
      return value;
    }, { replace: true });
  }
  async function deleteSelectedTarget() {
    if (!deleteTarget) return;
    setCreatedPageId(undefined);
    if (deleteTarget.kind === "file") {
      await api<{ ok: true }>("/api/sources/file", { method: "DELETE", body: JSON.stringify({ pageId: deleteTarget.page.id, expectedModifiedAt: deleteTarget.page.modifiedAt }) });
      update({ file: undefined });
      return;
    }
    await api<{ ok: true }>("/api/sources/folder", { method: "DELETE", body: JSON.stringify({ folder: deleteTarget.folder, expectedFileCount: deleteTarget.count }) });
    const parentFolder = deleteTarget.folder.split("/").slice(0, -1).join("/");
    update({ q: undefined, type: undefined, month: undefined, folder: parentFolder || undefined, file: undefined, limit: undefined });
  }
  async function updateBuildStatus(record: SourceBuildRecord, status: "deferred") {
    return api<SourceImportBatch>(`/api/imports/${encodeURIComponent(record.batch.id)}/build-status`, { method: "PATCH", body: JSON.stringify({ storedPath: record.file.storedPath, status }) });
  }
  async function beginBuild(record: SourceBuildRecord, intent?: SourceBuildIntent) {
    if (record.batch.channel === "photos") {
      setRecentBatch(record.batch);
      const page = pages.find((p) => p.relativePath === record.file.storedPath);
      update({ file: page?.id, batch: record.batch.id });
      document.querySelector(".photo-memory")?.scrollIntoView({ block: "start" });
      return;
    }
    if (busyBuildPath) return;
    setBusyBuildPath(record.file.storedPath);
    setBuildError("");
    try {
      const flow = intent === "build" && record.file.buildKind === "identify" ? "direct" : record.file.buildKind!;
      const title = sourceBuildTitle(record);
      const operation = intent || (flow === "dialogue" ? "enrich" : "build");
      const sourceContext = { importId: record.batch.id, storedPath: record.file.storedPath, flow, operation };
      if (flow === "direct" || flow === "dialogue" && operation === "build") {
        openContextAgent({
          mode: "write",
          lockMode: true,
          autoSubmit: true,
          displayPrompt: "构建这份记录",
          prompt: flow === "dialogue"
            ? `请按 build-wiki 的「导入后冷启构建」入口读取消费旅程报告「${record.file.storedPath}」。只把“已确认的消费旅程”中具体、耐久且有证据支持的内容收进真正受到影响的已有理解；候选线索和规范化交易只能用于核对，不得当作用户已经确认的人生事实。保持报告和原始 CSV 不变，完成派生内容与质量门，并清楚说明新增、更新或因证据不足而跳过了什么。`
            : `请按 build-wiki 的「导入后冷启构建」入口读取生活记录「${record.file.storedPath}」，保持原始记录正文不变，把其中具体、耐久且证据充分的内容收进真正受到影响的已有理解；完成该入口要求的派生内容与质量门，并清楚列出新增、更新或因证据不足而跳过了什么。`,
          sourceContext,
          attachedContext: { title, currentUnderstanding: flow === "dialogue" ? "消费旅程报告已经经过对话补充，构建时只使用其中已确认的叙述。" : "这份记录的叙事和上下文较完整，可以直接进入构建。", reason: "用户已经明确选择把它收进已有理解。" },
        });
      } else if (flow === "dialogue") {
        const firstClue = record.batch.journey?.clusters[0];
        openContextAgent({
          mode: "read",
          autoSubmit: true,
          displayPrompt: record.file.dialogueRunId ? "继续聊聊，丰富旅程" : "从这段旅程开始聊",
          prompt: `请围绕消费旅程报告「${record.file.storedPath}」开始一次回忆对话。先读取报告，再按需要检索现有 Wiki，利用已有理解寻找关联、避免重复提问；Wiki 只作背景，不触发构建，也不能被修改。${firstClue ? `可以先把「${firstClue.title}」作为候选线索，并说明：${firstClue.summary}` : "先挑一条最完整的候选线索。"} 候选不是事实；一次只问我一个关于人物、动机或感受的开放式问题。每轮根据我已经确认的讲述，完整更新消费旅程报告中的旅程叙述。`,
          outputTarget: { kind: "journey-report", importId: record.batch.id, storedPath: record.file.storedPath, label: "消费旅程报告" },
          sourceContext,
          attachedContext: { title, currentUnderstanding: `${record.file.clueCount || 0} 条结构化线索只是回忆候选，还不是已确认经历。`, reason: "先由用户补上材料本身没有留下的语境；对话只丰富报告，何时构建由用户明确决定。" },
        });
      } else {
        openContextAgent({
          mode: "auto",
          autoSubmit: true,
          displayPrompt: "先帮我看看这是什么",
          prompt: `请读取生活记录「${record.file.storedPath}」。我还不知道它属于哪类材料；先用一句自然的问题请我说明这是什么，不要把无法判类当作错误，也不要在我确认前修改知识库。`,
          sourceContext,
          attachedContext: { title, currentUnderstanding: "这份材料的格式或语境不足，暂时无法判类。", reason: "先由用户补上材料本身没有留下的语境，再决定是否构建。" },
        });
      }
    } catch (reason: any) {
      setBuildError(reason.message || "暂时无法开始，可以稍后再试");
    } finally {
      setBusyBuildPath(undefined);
    }
  }
  function beginBatchBuild(records: SourceBuildRecord[]) {
    if (busyBuildPath || records.length < 2) return;
    setBuildError("");
    const batch = records[0]!.batch;
    const paths = records.map(({ file }) => file.storedPath);
    const pathList = paths.map((path) => `- ${path}`).join("\n");
    openContextAgent({
      mode: "write",
      lockMode: true,
      autoSubmit: true,
      displayPrompt: `批量构建 ${records.length} 份记录`,
      prompt: `请按 build-wiki 的「导入后冷启构建」入口读取下面选中的 ${records.length} 份 direct 生活记录：\n${pathList}\n\n这些记录可能来自不同导入批次。保持原始记录正文不变，把其中具体、耐久且证据充分的内容收进真正受到影响的已有理解；合并重复判断，完成该入口要求的派生内容与质量门，并清楚列出新增、更新或因证据不足而跳过了什么。`,
      sourceContext: { importId: batch.id, storedPath: records[0]!.file.storedPath, storedPaths: paths, flow: "direct", operation: "build" },
      attachedContext: { title: `${records.length} 份语境完整的新记录`, currentUnderstanding: "这些记录可以直接进入构建，但每一条判断仍需保留来源。", reason: "用户已经明确选择批量收进已有理解。" },
    });
  }
  function beginSelectedBuild(records: SourceBuildRecord[]) {
    if (records.length === 1) void beginBuild(records[0]!);
    else beginBatchBuild(records);
  }
  function requestRename(page: WikiPageSummary) {
    setCreatedPageId(undefined);
    setRenameRequest({ pageId: page.id, token: Date.now() });
    update({ file: page.id });
  }
  async function deferBuilds(records: SourceBuildRecord[]) {
    if (busyBuildPath) return;
    setBuildError("");
    try {
      await Promise.all(records.map((record) => updateBuildStatus(record, "deferred")));
      setRecentBatch(undefined);
      update({ batch: undefined });
    } catch (reason: any) {
      setBuildError(reason.message || "暂时无法记住这个选择");
    }
  }
  return <div className="organized-sources-page">
    <header className="source-workspace-intro">
      <div><h1>生活记录</h1><p>日记、笔记、对话和其他原话都留在这里。它们让我记得你的来路，也让每一次理解都能回到真正发生过的生活。</p><div className="source-record-stats" aria-label={`${pages.length} 份记录，本周新增 ${recentCount} 份`}><span><b>{new Intl.NumberFormat("zh-CN").format(pages.length)}</b> 份记录</span><i aria-hidden="true" /><span>本周新增 <b>+{recentCount}</b></span></div></div>
    </header>
    {importOpen ? <ImportMaterialsModal folders={folderPaths} currentFolder={folder} onClose={() => setImportOpen(false)} onImported={(batch) => { setImportOpen(false); setRecentBatch(batch); setCreatedPageId(undefined); update({ q: undefined, type: undefined, month: undefined, folder: importedFolderForBatch(batch) || undefined, file: undefined, limit: undefined, batch: batch.id }); }} onJourney={setRecentJourney} /> : null}
    {deleteTarget ? <ConfirmDeleteDialog
      title={deleteTarget.kind === "folder" ? "删除这个文件夹？" : "删除这份生活记录？"}
      description={deleteTarget.kind === "folder" ? "文件夹内的记录和所有子文件夹都会一起删除。" : "文件会从生活记录中永久移除。"}
      itemName={deleteTarget.kind === "folder" ? deleteTarget.folder : documentIdentity(deleteTarget.page.relativePath).fileName}
      impact={deleteTarget.kind === "folder" ? `其中包含 ${deleteTarget.count} 份记录。已有理解不会自动删除，但之后将无法再回到这些原始材料；此操作不能撤销。` : deleteTarget.page.importChannel === "photos" ? "这会删除记忆报告并隐藏人物影像关联，但不会删除隐藏目录中保留的原图。" : "已有理解不会自动删除，但之后将无法再回到这份原始材料；此操作不能撤销。"}
      confirmLabel={deleteTarget.kind === "folder" ? "删除文件夹" : "删除文件"}
      onClose={() => setDeleteTarget(undefined)}
      onConfirm={deleteSelectedTarget}
    /> : null}
    {creatingSource ? <div className="source-compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatingSource(false); }}><div className="source-compose-dialog" role="dialog" aria-modal="true" aria-label="写一条生活记录"><NewSourceForm folder={folder} folders={folderPaths} foldersLoading={sourceFoldersLoading} foldersError={sourceFoldersError} onCancel={() => setCreatingSource(false)} onCreated={(page) => { const nextFolder = cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/"); setCreatingSource(false); setCreatedPageId(page.id); update({ q: undefined, type: undefined, month: undefined, folder: nextFolder || undefined, file: page.id, limit: undefined }); }} /></div></div> : null}
    {photoBatch ? <PhotoMemoryPanel key={photoBatch.id} batch={photoBatch} revision={revision} /> : shownBatch ? <ImportedBatchGuide batch={shownBatch} busyPath={busyBuildPath} onStart={beginBuild} onStartAll={beginBatchBuild} onDefer={deferBuilds} /> : null}
    {buildError ? <p className="source-build-error" role="alert">{buildError}</p> : null}
    <section className="source-discovery-tools" aria-label="筛选生活记录">
      <div className="source-type-filter" role="group" aria-label="按来源类型筛选">{sourceRecordTypes.map((item) => <button type="button" key={item.id} className={type === item.id ? "active" : ""} aria-pressed={type === item.id} onClick={() => { setCreatedPageId(undefined); update({ type: item.id === "all" ? undefined : item.id, file: undefined, limit: undefined }); }}>{item.id !== "all" ? <Icon name={item.id === "notes" ? "journal" : item.id === "ai" ? "spark" : "receipt"} size={14} /> : null}{item.label}</button>)}{pendingBuilds.length ? <button type="button" className={`source-pending-filter${type === "pending" ? " active" : ""}`} aria-pressed={type === "pending"} onClick={() => { setCreatedPageId(undefined); update({ type: type === "pending" ? undefined : "pending", file: undefined, limit: undefined }); }}><Icon name="spark" size={14} />待构建 <b>{pendingBuilds.length}</b></button> : null}</div>
      <label className="source-global-search"><Icon name="search" size={16} /><input name="organized-source-search" autoComplete="off" aria-label="搜索生活记录标题或内容" value={query} onChange={(event) => { setCreatedPageId(undefined); update({ q: event.target.value || undefined, file: undefined, limit: undefined }); }} placeholder="搜索标题或内容…" /></label>
    </section>
    {type !== "pending" && selectableBuildRecords.length > 1 ? <section className="source-batch-banner" aria-label="可批量构建的记录">
      <p>有 <b>{selectableBuildRecords.length} 份</b>新记录语境完整，可以直接批量构建；其余记录仍会留在列表里逐条查看。</p>
      <button type="button" onClick={() => beginBatchBuild(selectableBuildRecords)}><Icon name="build" size={14} />批量构建这 {selectableBuildRecords.length} 份</button>
    </section> : null}
    <TimelineFilter label="按月份浏览记录" allLabel="全部月份" value={month} total={pages.length}
      periods={months.map((item) => ({ value: item.id, label: `${item.id.slice(0, 4)} 年 ${Number(item.id.slice(5))} 月`, count: item.count }))}
      onChange={(value) => { setCreatedPageId(undefined); update({ month: value || undefined, file: undefined, limit: undefined }); }}
      leading={<span className="source-time-label"><Icon name="history" size={14} />按月回望</span>}
      hint="按记录时间从新到旧排列"
    />
    <div className={`source-vault${folderPaneOpen ? "" : " folder-pane-collapsed"}${filePaneOpen ? "" : " file-pane-collapsed"}`} aria-label="生活记录工作区">
      <div className={`source-pane-shell source-folder-shell${folderPaneOpen ? "" : " collapsed"}`}>
        <aside className="source-folder-pane"><header><div><b>文件夹</b><span>{folders.length}</span></div><div className="source-pane-header-actions"><button type="button" className="source-pane-collapse" onClick={() => setFolderPaneOpen((value) => !value)} aria-expanded={folderPaneOpen} aria-label={`${folderPaneOpen ? "收起" : "展开"}文件夹栏`}><Icon name={folderPaneOpen ? "back" : "arrow"} size={13} /></button></div></header><div className="source-folder-contents">
          <div className={`source-folder-row${!folder ? " active" : ""}`}><button type="button" className="source-folder-select" onClick={() => { setCreatedPageId(undefined); update({ folder: undefined, file: undefined, limit: undefined }); }}><Icon name="source" size={15} /><span>全部材料</span><small>{pages.length}</small></button></div>
          {folders.map(([name, count]) => {
            const recordType = sourceRecordType({ relativePath: name, tags: [], type: undefined });
            return <div key={name} className={`source-folder-row${folder === name ? " active" : ""}`}>
              <button type="button" className="source-folder-select" style={{ paddingLeft: 10 + Math.min(name.split("/").length - 1, 3) * 16 }} onClick={() => { setCreatedPageId(undefined); update({ folder: name, file: undefined, limit: undefined }); }}><Icon name={recordType === "notes" ? "journal" : recordType === "ai" ? "spark" : "receipt"} size={15} /><span>{name.split("/").at(-1)}</span><small>{count}</small></button>
              <SourceItemMenu label={`更多文件夹操作：${name}`} actions={[{ label: "删除文件夹…", icon: "trash", danger: true, onSelect: () => setDeleteTarget({ kind: "folder", folder: name, count }) }]} />
            </div>;
          })}
        </div></aside>
      </div>
      <div className={`source-pane-shell source-file-shell${filePaneOpen ? "" : " collapsed"}`}>
        <section className="source-file-pane">
          <header><div><b>{folder ? folder.split("/").at(-1) : "全部记录"}</b><span>{filtered.length} 份</span></div><div className="source-pane-header-actions"><button type="button" className="source-pane-collapse" onClick={() => setFilePaneOpen((value) => !value)} aria-expanded={filePaneOpen} aria-label={`${filePaneOpen ? "收起" : "展开"}文件列表`}><Icon name={filePaneOpen ? "back" : "arrow"} size={13} /></button></div></header>
          <div className="source-file-contents">
            <div className="source-file-create-toolbar" aria-label="新建或导入生活记录"><button type="button" className="source-create-action" onClick={() => setCreatingSource(true)} aria-haspopup="dialog"><Icon name="plus" size={14} />新建记录</button><RecordImportTrigger onClick={() => setImportOpen(true)} className="source-secondary-action" label="导入" /></div>
            {type === "pending" && selectableBuildRecords.length > 0 ? <div className="source-batch-toolbar">
              <label><input type="checkbox" checked={allSelectableBuildsSelected} ref={(node) => { if (node) node.indeterminate = anySelectableBuildsSelected && !allSelectableBuildsSelected; }} onChange={(event) => setSelectedBuildPaths(event.target.checked ? new Set(selectableBuildPaths) : new Set())} />全选可直接构建 <small>（{selectableBuildRecords.length} 份）</small></label>
              <button type="button" disabled={!selectedBuildRecords.length || Boolean(busyBuildPath)} onClick={() => beginSelectedBuild(selectedBuildRecords)}><Icon name="build" size={13} />{selectedBuildRecords.length > 1 ? `批量构建 ${selectedBuildRecords.length} 份` : selectedBuildRecords.length === 1 ? "构建这份记录" : "选择记录"}</button>
            </div> : null}
            <div className="source-file-order"><span>按记录时间排列</span></div><div className="source-file-list">
            {visiblePages.map((page) => {
              const fileName = documentIdentity(page.relativePath).fileName;
              const recordType = sourceRecordType(page);
              const trackedBuildRecord = sourceBuildRecordForPage(page, buildRecords);
              const buildRecord = trackedBuildRecord || buildableSourceRecordForPage(page, buildRecords);
              const buildState = trackedBuildRecord ? sourceBuildPresentation(trackedBuildRecord.file) : undefined;
              const selectable = type === "pending" && selectableBuildRecords.some(({ file }) => file.storedPath === trackedBuildRecord?.file.storedPath);
              return <article key={page.id} className={`source-file-row${selected?.id === page.id ? " active" : ""}${selectable ? " is-selectable" : ""}`}>
                {selectable && trackedBuildRecord ? <label className="source-batch-check"><input type="checkbox" checked={selectedBuildPaths.has(trackedBuildRecord.file.storedPath)} onChange={(event) => setSelectedBuildPaths((current) => { const next = new Set(current); if (event.target.checked) next.add(trackedBuildRecord.file.storedPath); else next.delete(trackedBuildRecord.file.storedPath); return next; })} /><span className="sr-only">选择构建「{fileName}」</span></label> : null}
                <button type="button" className="source-file-select" aria-label={fileName} onClick={() => { setCreatedPageId(undefined); setRecentBatch(undefined); update({ file: page.id, batch: undefined }); }}>
                  <span className="source-file-card-meta"><em className={`source-type-chip source-type-chip--${recordType}`}><Icon name={recordType === "photos" ? "image" : recordType === "notes" ? "journal" : recordType === "ai" ? "spark" : "receipt"} size={11} />{sourceRecordTypes.find((item) => item.id === recordType)?.label}</em></span>
                  <b>{fileName}</b><small>{page.excerpt || cleanSourcePath(page.relativePath)}</small>
                </button>
                <SourceItemMenu label={`更多文件操作：${fileName}`} actions={[{ label: "构建这篇文档", icon: "build", onSelect: () => void beginBuild(buildRecord, "build") }, ...(recordType === "photos" ? [] : [{ label: "重命名", icon: "edit" as const, onSelect: () => requestRename(page) }]), { label: "删除文件…", icon: "trash", danger: true, onSelect: () => setDeleteTarget({ kind: "file", page }) }]} />
                {trackedBuildRecord && buildState ? <div className={`source-file-build${trackedBuildRecord.file.buildKind === "dialogue" && trackedBuildRecord.file.buildStatus === "ready-to-build" ? " is-dual" : ""}`}><span className={`source-build-chip is-${buildState.tone}`}><i aria-hidden="true" />{buildState.label}{buildState.detail ? <small>{buildState.detail}</small> : null}</span><SourceBuildAction record={trackedBuildRecord} busy={busyBuildPath === trackedBuildRecord.file.storedPath} onStart={beginBuild} /></div> : null}
              </article>;
            })}
            {visiblePages.length < filtered.length ? <button className="source-file-list-more" onClick={() => update({ limit: String(visibleLimit + 120) })}>继续显示 <b>{Math.min(120, filtered.length - visiblePages.length)}</b> 份</button> : null}
            {visiblePages.length === 0 ? <div className="source-list-empty"><b>没有匹配的记录</b><p>{type === "pending" ? "新带进来的记录都已经构建完成。" : "换一个来源、月份或搜索词试试。"}</p></div> : null}
          </div></div>
        </section>
      </div>
      {selected ? <SourcePreview page={selected} revision={revision} startEditing={selected.id === createdPageId} fileNameFocusToken={renameRequest?.pageId === selected.id ? renameRequest.token : 0} buildRecord={selectedBuildRecord} buildBusy={busyBuildPath === selectedBuildRecord?.file.storedPath} onStartBuild={beginBuild} onRenamed={(renamed) => { setCreatedPageId(undefined); update({ file: renamed.id }); }} /> : <div className="source-preview-empty"><span>没有匹配的来源</span><p>换一个文件夹或搜索词。</p></div>}
    </div>
    <ContextualAgentDock revision={revision} context={photoBatch ? { scope: "照片记忆", title: photoBatch.files[0]?.originalName || "照片记忆", pageId: selectedBuildRecord?.batch.id === photoBatch.id ? selected?.id : undefined, defaultMode: "read", defaultOutputTarget: { kind: "photo-memory", importId: photoBatch.id, storedPath: photoBatch.files[0]!.storedPath, label: "记忆报告", phase: "enrich" }, suggestions: ["我想讲讲这批照片里的故事，一次问我一个具体问题。"], launcherLabel: "聊聊照片里的故事" } : agentContext} />
  </div>;
}
