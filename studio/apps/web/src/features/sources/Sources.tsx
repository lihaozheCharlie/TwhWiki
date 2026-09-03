import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import type { PaymentJourneySummary, SourceImportBatch, SourceImportChannel, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { graphCategoryNames, type ReturnContext } from "../../app/config";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent } from "../collaboration/model";
import { EditableDocument, documentIdentity } from "../../shared/markdown";
import { apiPageHref, PageLink, pageHref } from "../../shared/routing";
import { ConfirmDeleteDialog } from "../../shared/ConfirmDeleteDialog";
import { CollapsibleIndexPane, Empty, HeroMetric, Icon, Loading, PageHero } from "../../shared/ui";
import { cleanSourcePath, countRecentSources, detectImportSelectionKind, importedFolderForBatch, pendingSourceBuildRecords, sourceBuildActionPresentation, sourceBuildPresentation, sourceBuildRecordForPage, sourceBuildRecords, sourceMonthLabel, sourceMonthOptions, sourceRecordDate, sourceRecordMonth, sourceRecordType, sourceRecordTypes, type SourceBuildRecord, type SourceRecordType } from "./source-model";

export type ImportRoute = "files" | "ai" | "wechat" | "bill";

const aiImportProviders: Array<{ id: Exclude<SourceImportChannel, "files" | "wechat" | "alipay">; label: string }> = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "doubao", label: "豆包" },
  { id: "other-ai", label: "其他 AI" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

type SelectedImportFile = { file: File; relativePath: string };

function selectedFiles(list: FileList | null): SelectedImportFile[] {
  return [...(list || [])].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

async function droppedEntryFiles(entry: FileSystemEntry, parentPath = ""): Promise<SelectedImportFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, relativePath: `${parentPath}${file.name}` }];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  while (true) {
    const page = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!page.length) break;
    children.push(...page);
  }
  const nested = await Promise.all(children.map((child) => droppedEntryFiles(child, `${parentPath}${entry.name}/`)));
  return nested.flat();
}

async function droppedFiles(transfer: DataTransfer): Promise<SelectedImportFile[]> {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  const entries = items.map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (entries.length === items.length && entries.length) {
    return (await Promise.all(entries.map((entry) => droppedEntryFiles(entry)))).flat();
  }
  return selectedFiles(transfer.files);
}

export function ImportMaterialsModal({ folders, currentFolder, initialRoute = "files", onClose, onImported, onJourney }: { folders: string[]; currentFolder: string; initialRoute?: ImportRoute; onClose: () => void; onImported: (batch: SourceImportBatch) => void; onJourney: (journey: PaymentJourneySummary) => void }) {
  const [route, setRoute] = useState<ImportRoute>(initialRoute);
  const [provider, setProvider] = useState<Exclude<SourceImportChannel, "files" | "wechat" | "alipay">>("chatgpt");
  const [files, setFiles] = useState<SelectedImportFile[]>([]);
  const [folderMode, setFolderMode] = useState<"existing" | "new">("existing");
  const [targetFolder, setTargetFolder] = useState(currentFolder);
  const [newFolder, setNewFolder] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [journey, setJourney] = useState<PaymentJourneySummary>();
  const [draggingMaterials, setDraggingMaterials] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const importingRef = useRef(importing);
  const totalBytes = files.reduce((total, item) => total + item.file.size, 0);
  const selectionKind = files.length ? detectImportSelectionKind(files.map((item) => item.relativePath)) : undefined;
  const channel: SourceImportChannel = route === "ai" ? provider : route === "bill" ? "alipay" : route;
  const acceptedPattern = route === "bill" ? /\.csv$/i : route === "files" ? /\.(md|txt|zip)$/i : /\.(md|txt|zip|json|html?)$/i;
  const accept = route === "bill" ? ".csv,text/csv" : route === "files" ? ".md,.txt,.zip,text/markdown,text/plain,application/zip" : ".md,.txt,.zip,.json,.html,.htm,text/markdown,text/plain,application/json,text/html,application/zip";

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { importingRef.current = importing; }, [importing]);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusDialog = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus(), 0);
    const manageKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !importingRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", manageKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusDialog);
      window.removeEventListener("keydown", manageKeyboard);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

  function changeRoute(next: ImportRoute) {
    setRoute(next);
    setFiles([]);
    setMessage("");
    setError("");
    setJourney(undefined);
    setDraggingMaterials(false);
    dragDepthRef.current = 0;
  }

  function selectFiles(candidates: SelectedImportFile[]) {
    const selected = candidates.filter(({ file }) => acceptedPattern.test(file.name)).slice(0, route === "bill" ? 1 : undefined);
    setFiles(selected);
    setMessage("");
    setError(selected.length || !candidates.length ? "" : route === "bill" ? "请选择支付宝导出的 CSV 账单。" : route === "files" ? "请选择 Markdown、TXT、ZIP 文件或包含这些文件的文件夹。" : "请选择聊天平台导出的 ZIP、JSON、HTML、TXT、Markdown 文件或文件夹。");
  }

  function selectInputFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const candidates = selectedFiles(event.currentTarget.files);
    event.currentTarget.value = "";
    selectFiles(candidates);
  }

  async function selectDroppedFiles(transfer: DataTransfer) {
    try {
      selectFiles(await droppedFiles(transfer));
    } catch {
      setError("无法读取这个文件夹，请确认它仍然可访问后再试。");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!files.length) {
      setError("请先选择需要导入的材料。");
      return;
    }
    if (totalBytes > 100 * 1024 * 1024) {
      setError("这批材料超过 100 MB，请拆分后再导入。");
      return;
    }
    const destination = route === "bill" ? "消费账单" : folderMode === "new" ? newFolder.trim() : targetFolder;
    if (route !== "bill" && folderMode === "new" && !destination) {
      setError("请输入新文件夹名称。");
      return;
    }
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const payload = await Promise.all(files.map(async ({ file, relativePath }) => ({
        name: file.name,
        relativePath,
        content: /\.zip$/i.test(file.name) || route === "bill" ? await fileToBase64(file) : await file.text(),
        encoding: /\.zip$/i.test(file.name) || route === "bill" ? "base64" as const : "utf8" as const,
        mimeType: file.type || undefined,
      })));
      const batch = await api<SourceImportBatch>("/api/imports/files", { method: "POST", body: JSON.stringify({ files: payload, channel, targetFolder: destination }) });
      if (batch.journey) onJourney(batch.journey);
      onClose();
      onImported(batch);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setImporting(false);
    }
  }

  const routeDescription = route === "files"
    ? "导入单个文件、多个文件、文件夹，或包含 Markdown 与 TXT 的 ZIP 压缩包。"
    : route === "ai"
      ? "选择聊天平台后，带入官方导出包、文件夹或常见 JSON、HTML、文本记录。"
      : route === "wechat"
        ? "带入导出的微信聊天文本、HTML、JSON、ZIP 文件或文件夹。"
        : "上传支付宝交易记录 CSV，把零散消费串成可以继续讲述的旅程。";

  function continueWithAgent() {
    if (!journey) return;
    onClose();
    window.setTimeout(() => openContextAgent({ prompt: `请从「${journey.title}」里最有画面的一段线索开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来，不要修改知识库。`, mode: "read" }), 0);
  }

  return <div className="import-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) onClose(); }}>
    <section ref={dialogRef} className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <header className="import-modal-header"><div><h2 id="import-modal-title">带进一段记录</h2><p>选择它来自哪里，以及希望保留到什么位置。</p></div><button type="button" onClick={onClose} disabled={importing} aria-label="关闭记录导入窗口"><Icon name="close" size={18} /></button></header>
      <form onSubmit={submit}>
        <div className="import-modal-body">
          <nav className="import-channel-list" aria-label="材料来源">
            <button type="button" aria-pressed={route === "files"} className={route === "files" ? "active" : ""} onClick={() => changeRoute("files")}><b>日记与笔记</b><span>Markdown、TXT、ZIP</span></button>
            <button type="button" aria-pressed={route === "bill"} className={route === "bill" ? "active" : ""} onClick={() => changeRoute("bill")}><b>消费账单</b><span>从消费找回旅程</span></button>
            <button type="button" aria-pressed={route === "ai"} className={route === "ai" ? "active" : ""} onClick={() => changeRoute("ai")}><b>AI 对话</b><span>常用聊天平台</span></button>
            <button type="button" aria-pressed={route === "wechat"} className={route === "wechat" ? "active" : ""} onClick={() => changeRoute("wechat")}><b>微信记录</b><span>聊天导出文件</span></button>
          </nav>
          <div className="import-modal-main">
            <section className="import-modal-section"><h3>{route === "files" ? "选择本地材料" : route === "ai" ? "选择 AI 平台" : route === "wechat" ? "导入微信聊天记录" : "导入一段消费旅程"}</h3><p>{routeDescription}</p>
              {journey ? <div className="bill-journey-result">
                <header><span>已经串成一段旅程</span><h3>{journey.title}</h3><p>聚类只是回忆线索。接下来可以沿着地点、重复消费和跨类型事件，慢慢讲出背后的故事。</p></header>
                <dl><div><dt>交易</dt><dd>{journey.transactionCount}</dd></div><div><dt>活跃天数</dt><dd>{journey.activeDays}</dd></div><div><dt>旅程线索</dt><dd>{journey.clusters.length}</dd></div><div><dt>退款</dt><dd>{journey.refundCount}</dd></div></dl>
                <div className="bill-journey-thread" aria-label="账单聚类线索">{journey.clusters.slice(0, 5).map((item) => <article key={item.id}><i aria-hidden="true" /><div><span>{item.startDate === item.endDate ? item.startDate.slice(5) : `${item.startDate.slice(5)}—${item.endDate.slice(5)}`}</span><b>{item.title}</b><p>{item.summary}</p></div></article>)}</div>
              </div> : <>
              {route === "ai" ? <div className="import-provider-list" role="group" aria-label="AI 平台">{aiImportProviders.map((item) => <button type="button" key={item.id} aria-pressed={provider === item.id} className={provider === item.id ? "active" : ""} onClick={() => { setProvider(item.id); setFiles([]); setMessage(""); setError(""); }}>{item.label}</button>)}</div> : null}
              <div className={`import-file-actions${route === "bill" ? "" : " is-unified"}`}>
                {route === "bill" ? <label className="import-file-picker">
                  <b>选择支付宝账单</b>
                  <span>支付宝导出的 CSV</span>
                  <input key={`${route}-${provider}-bill`} name="import-files" type="file" accept={accept} onChange={selectInputFiles} />
                </label> : <div
                  className={`import-file-picker is-dropzone${draggingMaterials ? " is-dragging" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDraggingMaterials(true); }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                  onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDraggingMaterials(false); }}
                  onDrop={(event) => { event.preventDefault(); dragDepthRef.current = 0; setDraggingMaterials(false); void selectDroppedFiles(event.dataTransfer); }}
                >
                  <b>{draggingMaterials ? "放在这里" : "选择或拖入材料"}</b>
                  <span>{route === "files" ? "文件、文件夹或 ZIP，自动识别并保留层级" : "文件、文件夹或 ZIP，自动识别格式"}</span>
                  <div className="import-file-picker-controls">
                    <button type="button" onClick={() => fileInputRef.current?.click()}><Icon name="journal" size={14} />选择文件</button>
                    <button type="button" onClick={() => folderInputRef.current?.click()}><Icon name="source" size={14} />选择文件夹</button>
                  </div>
                  <input ref={fileInputRef} key={`${route}-${provider}-files`} name="import-files" type="file" accept={accept} multiple tabIndex={-1} aria-hidden="true" onChange={selectInputFiles} />
                  <input ref={(node) => { folderInputRef.current = node; if (node) node.webkitdirectory = true; }} key={`${route}-${provider}-folder`} name="import-folder" type="file" accept={accept} multiple tabIndex={-1} aria-hidden="true" onChange={selectInputFiles} />
                </div>}
                {route === "bill" ? <div className="bill-import-method"><Icon name="spark" size={18} /><b>自动整理</b><span>归并退款，识别重复地点、消费节律与跨类型旅程。</span></div> : null}
              </div>
              <div className={`import-selection${files.length ? " has-files" : ""}`}>
                {files.length ? <><div><b>{selectionKind === "folder" ? `已识别文件夹 · ${files.length} 个文件` : selectionKind === "archive" ? "已识别 ZIP 压缩包" : selectionKind === "files" ? `${files.length} 个文件` : "已识别文件"}</b><span>{new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(totalBytes / 1024 / 1024)} MB</span></div><p>{files.slice(0, 4).map((item) => item.relativePath).join(" · ")}{files.length > 4 ? ` · 另有 ${files.length - 4} 个` : ""}</p></> : <><b>{route === "bill" ? "尚未选择账单" : "尚未选择材料"}</b><p>{route === "bill" ? "单次最多 100 MB。" : "可以选择文件、选择整个文件夹，或直接拖入；单次最多 100 MB。"}</p></>}
              </div></>}
            </section>
            {!journey && route === "bill" ? <section className="import-modal-section bill-import-destination"><h3>保存到生活记录</h3><p>原始 CSV 与聚类报告会保存在「消费账单」中，每条线索都能回到具体交易证据。</p></section> : !journey ? <section className="import-modal-section import-destination"><h3>保存到</h3><p>记录会进入所选文件夹；同名文件会自动追加序号。</p>
              <div className="import-folder-mode" role="group" aria-label="选择保存位置"><button type="button" aria-pressed={folderMode === "existing"} className={folderMode === "existing" ? "active" : ""} onClick={() => setFolderMode("existing")}>现有文件夹</button><button type="button" aria-pressed={folderMode === "new"} className={folderMode === "new" ? "active" : ""} onClick={() => setFolderMode("new")}>新建文件夹</button></div>
              {folderMode === "existing" ? <label className="import-folder-field"><span>目标文件夹</span><select name="target-folder" value={targetFolder} onChange={(event) => setTargetFolder(event.target.value)}><option value="">生活记录根目录</option>{folders.map((name) => <option value={name} key={name}>{name}</option>)}</select></label> : <label className="import-folder-field"><span>新文件夹名称</span><input name="new-import-folder" autoComplete="off" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder={route === "ai" ? `AI聊天记录/${aiImportProviders.find((item) => item.id === provider)?.label}` : route === "wechat" ? "微信聊天记录" : "导入记录/2026"} /></label>}
            </section> : null}
          </div>
        </div>
        <footer className="import-modal-footer"><div aria-live="polite">{error ? <span role="alert">{error}</span> : message ? <b>{message}</b> : route === "bill" ? "带进来后，可以沿着消费线索慢慢找回人物、动机和变化。" : "带进来后即可在生活记录中查看，并保留原始来源。"}</div><div><button type="button" className="secondary-action" onClick={onClose} disabled={importing}>{journey ? "稍后再聊" : message ? "完成" : "取消"}</button>{journey ? <button type="button" className="primary-action" onClick={continueWithAgent}>聊聊这段旅程<Icon name="arrow" size={15} /></button> : <button className="primary-action" disabled={importing || !files.length}>{importing ? "正在带进来…" : "带进来"}</button>}</div></footer>
      </form>
    </section>
  </div>;
}

function sourceBuildTitle(record: SourceBuildRecord): string {
  return cleanSourcePath(record.file.storedPath).split("/").at(-1)?.replace(/\.md$/i, "") || record.file.originalName;
}

type SourceItemAction = {
  label: string;
  icon?: "edit" | "trash";
  danger?: boolean;
  onSelect: () => void;
};

function SourceItemMenu({ label, actions, placement = "row" }: { label: string; actions: SourceItemAction[]; placement?: "row" | "document" }) {
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
  return <span ref={rootRef} className={`source-item-menu source-item-menu--${placement}${open ? " is-open" : ""}`}>
    <button ref={triggerRef} type="button" className="source-item-menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}><Icon name="more" size={16} /></button>
    {open ? <span id={menuId} className="source-item-menu-popover" role="menu">{actions.map((action, index) => <React.Fragment key={action.label}>{index > 0 && action.danger ? <i className="source-item-menu-divider" aria-hidden="true" /> : null}<button type="button" role="menuitem" className={action.danger ? "danger" : ""} onClick={() => { setOpen(false); action.onSelect(); }}>{action.icon ? <Icon name={action.icon} size={14} /> : null}{action.label}</button></React.Fragment>)}</span> : null}
  </span>;
}

function SourceBuildAction({ record, busy, onStart }: { record: SourceBuildRecord; busy: boolean; onStart: (record: SourceBuildRecord) => void }) {
  const { file } = record;
  const action = sourceBuildActionPresentation(file);
  if (action.kind === "hidden") return null;
  if (action.kind === "open") return <button type="button" className="source-build-action is-quiet" onClick={() => openContextAgent({ runId: action.runId })}>{action.label}</button>;
  return <button type="button" className={`source-build-action is-${file.buildKind}`} disabled={busy} onClick={() => onStart(record)}>{file.buildKind === "direct" && !busy ? <Icon name="build" size={13} /> : null}{busy ? "正在准备…" : action.label}</button>;
}

function ImportedBatchGuide({ batch, busyPath, onStart, onStartAll, onDefer }: { batch: SourceImportBatch; busyPath?: string; onStart: (record: SourceBuildRecord) => void; onStartAll: (records: SourceBuildRecord[]) => void; onDefer: (records: SourceBuildRecord[]) => void }) {
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
    {letters[0] && <NavLink className="source-letter-feature" to={pageHref(letters[0].id)} state={returnContext}>
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

function SourcePreview({ page, revision, startEditing = false, fileNameFocusToken = 0, identityActions, onRenamed }: { page: WikiPageSummary; revision: number; startEditing?: boolean; fileNameFocusToken?: number; identityActions?: ReactNode; onRenamed: (page: WikiPage) => void }) {
  const { data, loading, error } = useApi<WikiPage>(apiPageHref(page.id), revision);
  return <article className="source-preview">
    {loading ? <Loading label="正在展开正文" /> : error || !data ? <Empty>{error || "正文暂时无法读取"}</Empty> : <EditableDocument page={data} variant="preview" startEditing={startEditing} showOutline identityActions={identityActions} fileNameFocusToken={fileNameFocusToken} afterContent={<SourceKnowledgeConnections key={data.id} page={data} />} onRenamed={onRenamed} />}
  </article>;
}

function NewSourceForm({ folder, onCancel, onCreated }: { folder: string; onCancel: () => void; onCreated: (page: WikiPage) => void }) {
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
    <label>保存到<input name="new-source-folder" autoComplete="off" value={targetFolder} onChange={(event) => setTargetFolder(event.target.value)} placeholder="例如：日记/2026…" /></label>
    <footer><span aria-live="polite">{error || "创建后会直接进入编辑，内容自动保存。"}</span><button disabled={creating}>{creating ? "正在创建…" : "创建文件"}</button></footer>
  </form>;
}

export function OrganizedSources({ revision }: { revision: number }) {
  const { data, loading } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
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
  const folders = [...folderCounts.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));
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
  async function beginBuild(record: SourceBuildRecord) {
    if (busyBuildPath) return;
    setBusyBuildPath(record.file.storedPath);
    setBuildError("");
    try {
      const flow = record.file.buildKind!;
      const title = sourceBuildTitle(record);
      const sourceContext = { importId: record.batch.id, storedPath: record.file.storedPath, flow };
      if (flow === "direct") {
        openContextAgent({
          mode: "write",
          autoSubmit: true,
          displayPrompt: "构建这份记录",
          prompt: `请按 build-wiki 的「导入后冷启构建」入口读取生活记录「${record.file.storedPath}」，保持原始记录正文不变，把其中具体、耐久且证据充分的内容收进真正受到影响的已有理解；完成该入口要求的派生内容与质量门，并清楚列出新增、更新或因证据不足而跳过了什么。`,
          sourceContext,
          attachedContext: { title, currentUnderstanding: "这份记录的叙事和上下文较完整，可以直接进入构建。", reason: "用户已经明确选择把它收进已有理解。" },
        });
      } else {
        const firstClue = record.batch.journey?.clusters[0];
        openContextAgent({
          mode: "auto",
          autoSubmit: true,
          displayPrompt: flow === "dialogue" ? "从这段旅程开始聊" : "先帮我看看这是什么",
          prompt: flow === "dialogue"
            ? `请围绕生活记录「${record.file.storedPath}」开始一次回忆对话。${firstClue ? `先把「${firstClue.title}」作为候选线索，并说明：${firstClue.summary}` : "先挑一条最完整的候选线索。"} 候选不是事实；一次只问我一个关于人物、动机或感受的问题。只有我的讲述形成具体、耐久且有证据支持的新理解时，才按仓库规则沉淀，并告诉我实际改了什么。`
            : `请读取生活记录「${record.file.storedPath}」。我还不知道它属于哪类材料；先用一句自然的问题请我说明这是什么，不要把无法判类当作错误，也不要在我确认前修改知识库。`,
          sourceContext,
          attachedContext: { title, currentUnderstanding: flow === "dialogue" ? `${record.file.clueCount || 0} 条结构化线索只是回忆候选，还不是已确认经历。` : "这份材料的格式或语境不足，暂时无法判类。", reason: "先由用户补上材料本身没有留下的语境，再决定是否构建。" },
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
      autoSubmit: true,
      displayPrompt: `批量构建 ${records.length} 份记录`,
      prompt: `请按 build-wiki 的「导入后冷启构建」入口读取下面选中的 ${records.length} 份 direct 生活记录：\n${pathList}\n\n这些记录可能来自不同导入批次。保持原始记录正文不变，把其中具体、耐久且证据充分的内容收进真正受到影响的已有理解；合并重复判断，完成该入口要求的派生内容与质量门，并清楚列出新增、更新或因证据不足而跳过了什么。`,
      sourceContext: { importId: batch.id, storedPath: records[0]!.file.storedPath, storedPaths: paths, flow: "direct" },
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
      <div><h1>生活记录</h1><p>日记、笔记、对话和其他原话都留在这里。它们让我记得你的来路，也让每一次理解都能回到真正发生过的生活。</p></div>
      <div className="source-workspace-actions">
        <div className="source-record-stats"><span><b>{new Intl.NumberFormat("zh-CN").format(pages.length)}</b>份记录</span><span className="recent"><b>+{recentCount}</b>本周新增</span></div>
        <div className="source-workspace-buttons"><button type="button" className="source-secondary-action" onClick={() => setImportOpen(true)} aria-haspopup="dialog"><Icon name="up" size={15} />带一段材料进来</button><button type="button" className="primary-action" onClick={() => setCreatingSource(true)} aria-haspopup="dialog"><Icon name="plus" size={15} />写一条记录</button></div>
      </div>
    </header>
    {importOpen ? <ImportMaterialsModal folders={folders.map(([name]) => name)} currentFolder={folder} onClose={() => setImportOpen(false)} onImported={(batch) => { setImportOpen(false); setRecentBatch(batch); setCreatedPageId(undefined); update({ q: undefined, type: undefined, month: undefined, folder: importedFolderForBatch(batch) || undefined, file: undefined, limit: undefined, batch: batch.id }); }} onJourney={setRecentJourney} /> : null}
    {deleteTarget ? <ConfirmDeleteDialog
      title={deleteTarget.kind === "folder" ? "删除这个文件夹？" : "删除这份生活记录？"}
      description={deleteTarget.kind === "folder" ? "文件夹内的记录和所有子文件夹都会一起删除。" : "文件会从生活记录中永久移除。"}
      itemName={deleteTarget.kind === "folder" ? deleteTarget.folder : documentIdentity(deleteTarget.page.relativePath).fileName}
      impact={deleteTarget.kind === "folder" ? `其中包含 ${deleteTarget.count} 份记录。已有理解不会自动删除，但之后将无法再回到这些原始材料；此操作不能撤销。` : "已有理解不会自动删除，但之后将无法再回到这份原始材料；此操作不能撤销。"}
      confirmLabel={deleteTarget.kind === "folder" ? "删除文件夹" : "删除文件"}
      onClose={() => setDeleteTarget(undefined)}
      onConfirm={deleteSelectedTarget}
    /> : null}
    {creatingSource ? <div className="source-compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatingSource(false); }}><div className="source-compose-dialog" role="dialog" aria-modal="true" aria-label="写一条生活记录"><NewSourceForm folder={folder} onCancel={() => setCreatingSource(false)} onCreated={(page) => { const nextFolder = cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/"); setCreatingSource(false); setCreatedPageId(page.id); update({ q: undefined, type: undefined, month: undefined, folder: nextFolder || undefined, file: page.id, limit: undefined }); }} /></div></div> : null}
    {shownBatch ? <ImportedBatchGuide batch={shownBatch} busyPath={busyBuildPath} onStart={beginBuild} onStartAll={beginBatchBuild} onDefer={deferBuilds} /> : null}
    {buildError ? <p className="source-build-error" role="alert">{buildError}</p> : null}
    <section className="source-discovery-tools" aria-label="筛选生活记录">
      <div className="source-type-filter" role="group" aria-label="按来源类型筛选">{sourceRecordTypes.map((item) => <button type="button" key={item.id} className={type === item.id ? "active" : ""} aria-pressed={type === item.id} onClick={() => { setCreatedPageId(undefined); update({ type: item.id === "all" ? undefined : item.id, file: undefined, limit: undefined }); }}>{item.id !== "all" ? <Icon name={item.id === "notes" ? "journal" : item.id === "ai" ? "spark" : item.id === "wechat" ? "message" : "receipt"} size={14} /> : null}{item.label}</button>)}{pendingBuilds.length ? <button type="button" className={`source-pending-filter${type === "pending" ? " active" : ""}`} aria-pressed={type === "pending"} onClick={() => { setCreatedPageId(undefined); update({ type: type === "pending" ? undefined : "pending", file: undefined, limit: undefined }); }}><Icon name="spark" size={14} />待构建 <b>{pendingBuilds.length}</b></button> : null}</div>
      <label className="source-global-search"><Icon name="search" size={16} /><input name="organized-source-search" autoComplete="off" aria-label="搜索生活记录标题或内容" value={query} onChange={(event) => { setCreatedPageId(undefined); update({ q: event.target.value || undefined, file: undefined, limit: undefined }); }} placeholder="搜索标题或内容…" /></label>
    </section>
    {type !== "pending" && selectableBuildRecords.length > 1 ? <section className="source-batch-banner" aria-label="可批量构建的记录">
      <p>有 <b>{selectableBuildRecords.length} 份</b>新记录语境完整，可以直接批量构建；其余记录仍会留在列表里逐条查看。</p>
      <button type="button" onClick={() => beginBatchBuild(selectableBuildRecords)}><Icon name="build" size={14} />批量构建这 {selectableBuildRecords.length} 份</button>
    </section> : null}
    {months.length > 0 ? <div className="source-month-browser"><span><Icon name="history" size={14} />按月回望</span><nav aria-label="按月份浏览记录">{months.map((item) => <button type="button" key={item.id} className={month === item.id ? "active" : ""} aria-current={month === item.id ? "date" : undefined} onClick={() => { setCreatedPageId(undefined); update({ month: month === item.id ? undefined : item.id, file: undefined, limit: undefined }); }}><i style={{ "--month-weight": Math.min(11, 5 + item.count) } as React.CSSProperties} />{sourceMonthLabel(item.id)}</button>)}</nav>{month ? <button type="button" className="source-month-clear" onClick={() => update({ month: undefined, file: undefined, limit: undefined })}>清除月份</button> : null}</div> : null}
    <div className={`source-vault${folderPaneOpen ? "" : " folder-pane-collapsed"}${filePaneOpen ? "" : " file-pane-collapsed"}`} aria-label="生活记录工作区">
      <div className={`source-pane-shell source-folder-shell${folderPaneOpen ? "" : " collapsed"}`}>
        <aside className="source-folder-pane"><header><div><b>文件夹</b><span>{folders.length}</span></div><div className="source-pane-header-actions"><button type="button" className="source-pane-collapse" onClick={() => setFolderPaneOpen((value) => !value)} aria-expanded={folderPaneOpen} aria-label={`${folderPaneOpen ? "收起" : "展开"}文件夹栏`}><Icon name={folderPaneOpen ? "back" : "arrow"} size={13} /></button></div></header><div className="source-folder-contents">
          <div className={`source-folder-row${!folder ? " active" : ""}`}><button type="button" className="source-folder-select" onClick={() => { setCreatedPageId(undefined); update({ folder: undefined, file: undefined, limit: undefined }); }}><Icon name="source" size={15} /><span>全部材料</span><small>{pages.length}</small></button></div>
          {folders.map(([name, count]) => {
            const recordType = sourceRecordType({ relativePath: name, tags: [], type: undefined });
            return <div key={name} className={`source-folder-row${folder === name ? " active" : ""}`}>
              <button type="button" className="source-folder-select" style={{ paddingLeft: 10 + Math.min(name.split("/").length - 1, 3) * 16 }} onClick={() => { setCreatedPageId(undefined); update({ folder: name, file: undefined, limit: undefined }); }}><Icon name={recordType === "notes" ? "journal" : recordType === "ai" ? "spark" : recordType === "wechat" ? "message" : "receipt"} size={15} /><span>{name.split("/").at(-1)}</span><small>{count}</small></button>
              <SourceItemMenu label={`更多文件夹操作：${name}`} actions={[{ label: "删除文件夹…", icon: "trash", danger: true, onSelect: () => setDeleteTarget({ kind: "folder", folder: name, count }) }]} />
            </div>;
          })}
        </div></aside>
      </div>
      <div className={`source-pane-shell source-file-shell${filePaneOpen ? "" : " collapsed"}`}>
        <section className="source-file-pane">
          <header><div><b>{folder ? folder.split("/").at(-1) : "全部记录"}</b><span>{filtered.length} 份</span></div><div className="source-pane-header-actions"><button type="button" className="source-pane-collapse" onClick={() => setFilePaneOpen((value) => !value)} aria-expanded={filePaneOpen} aria-label={`${filePaneOpen ? "收起" : "展开"}文件列表`}><Icon name={filePaneOpen ? "back" : "arrow"} size={13} /></button></div></header>
          <div className="source-file-contents">
            {type === "pending" && selectableBuildRecords.length > 0 ? <div className="source-batch-toolbar">
              <label><input type="checkbox" checked={allSelectableBuildsSelected} ref={(node) => { if (node) node.indeterminate = anySelectableBuildsSelected && !allSelectableBuildsSelected; }} onChange={(event) => setSelectedBuildPaths(event.target.checked ? new Set(selectableBuildPaths) : new Set())} />全选可直接构建 <small>（{selectableBuildRecords.length} 份）</small></label>
              <button type="button" disabled={!selectedBuildRecords.length || Boolean(busyBuildPath)} onClick={() => beginSelectedBuild(selectedBuildRecords)}><Icon name="build" size={13} />{selectedBuildRecords.length > 1 ? `批量构建 ${selectedBuildRecords.length} 份` : selectedBuildRecords.length === 1 ? "构建这份记录" : "选择记录"}</button>
            </div> : null}
            <div className="source-file-order"><span>按记录时间排列</span></div><div className="source-file-list">
            {visiblePages.map((page) => {
              const fileName = documentIdentity(page.relativePath).fileName;
              const recordType = sourceRecordType(page);
              const buildRecord = sourceBuildRecordForPage(page, buildRecords);
              const buildState = buildRecord ? sourceBuildPresentation(buildRecord.file) : undefined;
              const selectable = type === "pending" && selectableBuildRecords.some(({ file }) => file.storedPath === buildRecord?.file.storedPath);
              return <article key={page.id} className={`source-file-row${selected?.id === page.id ? " active" : ""}${selectable ? " is-selectable" : ""}`}>
                {selectable && buildRecord ? <label className="source-batch-check"><input type="checkbox" checked={selectedBuildPaths.has(buildRecord.file.storedPath)} onChange={(event) => setSelectedBuildPaths((current) => { const next = new Set(current); if (event.target.checked) next.add(buildRecord.file.storedPath); else next.delete(buildRecord.file.storedPath); return next; })} /><span className="sr-only">选择构建「{fileName}」</span></label> : null}
                <button type="button" className="source-file-select" aria-label={fileName} onClick={() => { setCreatedPageId(undefined); update({ file: page.id }); }}>
                  <span className="source-file-card-meta"><em className={`source-type-chip source-type-chip--${recordType}`}><Icon name={recordType === "notes" ? "journal" : recordType === "ai" ? "spark" : recordType === "wechat" ? "message" : "receipt"} size={11} />{sourceRecordTypes.find((item) => item.id === recordType)?.label}</em></span>
                  <b>{fileName}</b><small>{page.excerpt || cleanSourcePath(page.relativePath)}</small>
                </button>
                <SourceItemMenu label={`更多文件操作：${fileName}`} actions={[{ label: "重命名", icon: "edit", onSelect: () => requestRename(page) }, { label: "删除文件…", icon: "trash", danger: true, onSelect: () => setDeleteTarget({ kind: "file", page }) }]} />
                {buildRecord && buildState ? <div className="source-file-build"><span className={`source-build-chip is-${buildState.tone}`}><i aria-hidden="true" />{buildState.label}{buildState.detail ? <small>{buildState.detail}</small> : null}</span><SourceBuildAction record={buildRecord} busy={busyBuildPath === buildRecord.file.storedPath} onStart={beginBuild} /></div> : null}
              </article>;
            })}
            {visiblePages.length < filtered.length ? <button className="source-file-list-more" onClick={() => update({ limit: String(visibleLimit + 120) })}>继续显示 <b>{Math.min(120, filtered.length - visiblePages.length)}</b> 份</button> : null}
            {visiblePages.length === 0 ? <div className="source-list-empty"><b>没有匹配的记录</b><p>{type === "pending" ? "新带进来的记录都已经构建完成。" : "换一个来源、月份或搜索词试试。"}</p></div> : null}
          </div></div>
        </section>
      </div>
      {selected ? <SourcePreview page={selected} revision={revision} startEditing={selected.id === createdPageId} fileNameFocusToken={renameRequest?.pageId === selected.id ? renameRequest.token : 0} identityActions={<SourceItemMenu placement="document" label={`更多文件操作：${documentIdentity(selected.relativePath).fileName}`} actions={[{ label: "重命名", icon: "edit", onSelect: () => requestRename(selected) }, { label: "删除文件…", icon: "trash", danger: true, onSelect: () => setDeleteTarget({ kind: "file", page: selected }) }]} />} onRenamed={(renamed) => { setCreatedPageId(undefined); update({ file: renamed.id }); }} /> : <div className="source-preview-empty"><span>没有匹配的来源</span><p>换一个文件夹或搜索词。</p></div>}
    </div>
    <ContextualAgentDock revision={revision} context={recentJourney ? { scope: "消费旅程", title: recentJourney.title, summary: `${recentJourney.transactionCount} 笔消费被串成 ${recentJourney.clusters.length} 组旅程线索。`, defaultMode: "read", launcherLabel: "聊聊这段旅程", suggestions: [`请从「${recentJourney.title}」里最有画面的一段线索开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来，不要修改知识库。`, "先从最有画面的一次出行、聚会或生活变化开始，邀请我慢慢讲出来。"] } : { scope: "生活记录", title: selected?.title || "生活记录", pageId: selected?.id, summary: selected?.excerpt || `当前有 ${pages.length} 份原始记录。`, defaultMode: "read", launcherLabel: "聊聊这份记录", suggestions: ["这份记录里有哪些还没有真正说清楚、值得我继续补充的地方？", "请概括这份记录，并区分事实、感受和后来的解释。"] }} />
  </div>;
}
