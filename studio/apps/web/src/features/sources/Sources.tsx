import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import type { PaymentJourneySummary, SourceImportBatch, SourceImportChannel, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { graphCategoryNames, type ReturnContext } from "../../app/config";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent } from "../collaboration/model";
import { EditableDocument, documentIdentity } from "../../shared/markdown";
import { apiPageHref, PageLink, pageHref } from "../../shared/routing";
import { CollapsibleIndexPane, Empty, HeroMetric, Icon, Loading, PageHero, PaneCollapseButton } from "../../shared/ui";

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

export function ImportMaterialsModal({ folders, currentFolder, initialRoute = "files", onClose, onJourney }: { folders: string[]; currentFolder: string; initialRoute?: ImportRoute; onClose: () => void; onJourney: (journey: PaymentJourneySummary) => void }) {
  const [route, setRoute] = useState<ImportRoute>(initialRoute);
  const [provider, setProvider] = useState<Exclude<SourceImportChannel, "files" | "wechat" | "alipay">>("chatgpt");
  const [files, setFiles] = useState<File[]>([]);
  const [folderMode, setFolderMode] = useState<"existing" | "new">("existing");
  const [targetFolder, setTargetFolder] = useState(currentFolder);
  const [newFolder, setNewFolder] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [journey, setJourney] = useState<PaymentJourneySummary>();
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const importingRef = useRef(importing);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const folderAttributes = { webkitdirectory: "", directory: "" } as Record<string, string>;
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
  }

  function selectFiles(list: FileList | null) {
    const selected = [...(list || [])].filter((file) => acceptedPattern.test(file.name)).slice(0, route === "bill" ? 1 : undefined);
    setFiles(selected);
    setMessage("");
    setError(selected.length || !list?.length ? "" : route === "bill" ? "请选择支付宝导出的 CSV 账单。" : route === "files" ? "请选择 Markdown、TXT 或 ZIP 文件。" : "请选择聊天平台导出的 ZIP、JSON、HTML、TXT 或 Markdown 文件。");
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
      const payload = await Promise.all(files.map(async (file) => ({
        name: file.name,
        relativePath: file.webkitRelativePath || file.name,
        content: /\.zip$/i.test(file.name) || route === "bill" ? await fileToBase64(file) : await file.text(),
        encoding: /\.zip$/i.test(file.name) || route === "bill" ? "base64" as const : "utf8" as const,
        mimeType: file.type || undefined,
      })));
      const batch = await api<SourceImportBatch>("/api/imports/files", { method: "POST", body: JSON.stringify({ files: payload, channel, targetFolder: destination }) });
      setMessage(`已带进 ${batch.fileCount} 份记录${destination ? `到「${destination}」` : "到生活记录根目录"}。`);
      setJourney(batch.journey);
      if (batch.journey) onJourney(batch.journey);
      setFiles([]);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setImporting(false);
    }
  }

  const routeDescription = route === "files"
    ? "导入单个文件、多个文件，或包含 Markdown 与 TXT 的 ZIP 压缩包。"
    : route === "ai"
      ? "选择聊天平台后，上传官方导出包或常见 JSON、HTML、文本记录。"
      : route === "wechat"
        ? "上传导出的微信聊天文本、HTML、JSON 或 ZIP 文件。"
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
              <div className="import-file-actions">
                <label className="import-file-picker"><b>{route === "bill" ? "选择支付宝账单" : "选择文件"}</b><span>{route === "bill" ? "支付宝导出的 CSV" : route === "files" ? "MD、TXT 或 ZIP" : "ZIP、JSON、HTML 或文本"}</span><input key={`${route}-${provider}-files`} name="import-files" type="file" accept={accept} multiple={route !== "bill"} onChange={(event) => selectFiles(event.target.files)} /></label>
                {route !== "bill" ? <label className="import-file-picker"><b>选择文件夹</b><span>保留文件夹内的层级</span><input key={`${route}-${provider}-folder`} name="import-folder" type="file" accept={accept} multiple {...folderAttributes} onChange={(event) => selectFiles(event.target.files)} /></label> : <div className="bill-import-method"><Icon name="spark" size={18} /><b>自动整理</b><span>归并退款，识别重复地点、消费节律与跨类型旅程。</span></div>}
              </div>
              <div className={`import-selection${files.length ? " has-files" : ""}`}>
                {files.length ? <><div><b>{files.length} 个文件</b><span>{new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(totalBytes / 1024 / 1024)} MB</span></div><p>{files.slice(0, 4).map((file) => file.webkitRelativePath || file.name).join(" · ")}{files.length > 4 ? ` · 另有 ${files.length - 4} 个` : ""}</p></> : <><b>尚未选择文件</b><p>单次最多 100 MB。ZIP 解压后也需在 100 MB 内。</p></>}
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

export function cleanSourcePath(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const sourceRoot = parts.findIndex((part) => /^(原始知识库|sources?)$/i.test(part));
  const logical = sourceRoot >= 0 ? parts.slice(sourceRoot + 1) : parts;
  return logical.map((part) => part === "imported" ? "待整理" : part).join("/");
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

function SourcePreview({ page, revision, startEditing = false, onRenamed }: { page: WikiPageSummary; revision: number; startEditing?: boolean; onRenamed: (page: WikiPage) => void }) {
  const { data, loading, error } = useApi<WikiPage>(apiPageHref(page.id), revision);
  return <article className="source-preview">
    {loading ? <Loading label="正在展开正文" /> : error || !data ? <Empty>{error || "正文暂时无法读取"}</Empty> : <EditableDocument page={data} variant="preview" startEditing={startEditing} afterContent={<SourceKnowledgeConnections key={data.id} page={data} />} onRenamed={onRenamed} />}
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
    <label>文件名<input name="new-source-title" autoComplete="off" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：今天的观察…" /></label>
    <label>保存到<input name="new-source-folder" autoComplete="off" value={targetFolder} onChange={(event) => setTargetFolder(event.target.value)} placeholder="例如：日记/2026…" /></label>
    <footer><span aria-live="polite">{error || "创建后会直接进入编辑，内容自动保存。"}</span><button disabled={creating}>{creating ? "正在创建…" : "创建文件"}</button></footer>
  </form>;
}

export function OrganizedSources({ revision }: { revision: number }) {
  const { data, loading } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const [params, setParams] = useSearchParams();
  const [creatingSource, setCreatingSource] = useState(false);
  const [createdPageId, setCreatedPageId] = useState<string>();
  const [folderPaneOpen, setFolderPaneOpen] = useState(true);
  const [filePaneOpen, setFilePaneOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [recentJourney, setRecentJourney] = useState<PaymentJourneySummary>();
  if (loading || !data) return <Loading label="正在打开生活记录" />;
  const pages = data;
  const query = params.get("q") || "";
  const folder = params.get("folder") || "";
  const folderCounts = new Map<string, number>();
  for (const page of pages) {
    const parts = cleanSourcePath(page.relativePath).split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const key = parts.slice(0, depth).join("/");
      folderCounts.set(key, (folderCounts.get(key) || 0) + 1);
    }
  }
  const folders = [...folderCounts.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));
  const filtered = pages.filter((page) => {
    const sourcePath = cleanSourcePath(page.relativePath);
    return (!folder || sourcePath.startsWith(`${folder}/`)) && `${page.title} ${sourcePath} ${page.excerpt}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const requestedLimit = Number.parseInt(params.get("limit") || "120", 10);
  const visibleLimit = Number.isFinite(requestedLimit) ? Math.max(120, requestedLimit) : 120;
  const visiblePages = filtered.slice(0, visibleLimit);
  const selected = filtered.find((page) => page.id === params.get("file")) || filtered[0];
  function update(next: Record<string, string | undefined>) {
    setParams((current) => {
      const value = new URLSearchParams(current);
      for (const [key, entry] of Object.entries(next)) entry ? value.set(key, entry) : value.delete(key);
      return value;
    }, { replace: true });
  }
  return <div className="organized-sources-page">
    <header className="source-workspace-intro">
      <div><h1>生活记录</h1><p>日记、笔记、对话和其他原话都留在这里。它们让我记得你的来路，也让每一次理解都能回到真正发生过的生活。</p></div>
      <div className="source-workspace-actions"><span><b>{new Intl.NumberFormat("zh-CN").format(pages.length)}</b> 份记录</span><button className="primary-action" onClick={() => setImportOpen(true)} aria-haspopup="dialog">带进一段记录<Icon name="arrow" size={15} /></button></div>
    </header>
    {importOpen ? <ImportMaterialsModal folders={folders.map(([name]) => name)} currentFolder={folder} onClose={() => setImportOpen(false)} onJourney={setRecentJourney} /> : null}
    <div className={`source-vault${folderPaneOpen ? "" : " folder-pane-collapsed"}${filePaneOpen ? "" : " file-pane-collapsed"}`} aria-label="生活记录工作区">
      <div className={`source-pane-shell source-folder-shell${folderPaneOpen ? "" : " collapsed"}`}>
        <aside className="source-folder-pane"><header><b>文件夹</b><span>{folders.length}</span></header><button className={!folder ? "active" : ""} onClick={() => { setCreatedPageId(undefined); update({ folder: undefined, file: undefined, limit: undefined }); }}><span>全部材料</span><small>{pages.length}</small></button>{folders.map(([name, count]) => <button key={name} className={folder === name ? "active" : ""} style={{ paddingLeft: 14 + Math.min(name.split("/").length - 1, 3) * 13 }} onClick={() => { setCreatedPageId(undefined); update({ folder: name, file: undefined, limit: undefined }); }}><span>{name.split("/").at(-1)}</span><small>{count}</small></button>)}</aside>
        <PaneCollapseButton open={folderPaneOpen} onToggle={() => setFolderPaneOpen((value) => !value)} label="文件夹栏" />
      </div>
      <div className={`source-pane-shell source-file-shell${filePaneOpen ? "" : " collapsed"}`}>
        <section className="source-file-pane"><div className="source-file-tools"><label><Icon name="search" size={16} /><input name="organized-source-search" autoComplete="off" aria-label="搜索生活记录" value={query} onChange={(event) => { setCreatedPageId(undefined); update({ q: event.target.value || undefined, file: undefined, limit: undefined }); }} placeholder="搜索当前文件夹…" /></label><button onClick={() => setCreatingSource((value) => !value)} aria-expanded={creatingSource}>{creatingSource ? "取消" : "新建"}</button></div>{creatingSource ? <NewSourceForm folder={folder} onCancel={() => setCreatingSource(false)} onCreated={(page) => { const nextFolder = cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/"); setCreatingSource(false); setCreatedPageId(page.id); update({ q: undefined, folder: nextFolder || undefined, file: page.id, limit: undefined }); }} /> : null}<div className="source-file-pane-meta"><b>{folder ? folder.split("/").at(-1) : "全部记录"}</b><span>{filtered.length} 份</span></div><div className="source-file-list">{visiblePages.map((page) => { const fileName = documentIdentity(page.relativePath).fileName; return <button key={page.id} aria-label={`${fileName}，${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(page.modifiedAt))}`} className={selected?.id === page.id ? "active" : ""} onClick={() => { setCreatedPageId(undefined); update({ file: page.id }); }}><span><b>{fileName}</b><time>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(page.modifiedAt))}</time></span><small>{page.excerpt || cleanSourcePath(page.relativePath)}</small></button>; })}{visiblePages.length < filtered.length ? <button className="source-file-list-more" onClick={() => update({ limit: String(visibleLimit + 120) })}>继续显示 <b>{Math.min(120, filtered.length - visiblePages.length)}</b> 份</button> : null}</div></section>
        <PaneCollapseButton open={filePaneOpen} onToggle={() => setFilePaneOpen((value) => !value)} label="文件列表" />
      </div>
      {selected ? <SourcePreview page={selected} revision={revision} startEditing={selected.id === createdPageId} onRenamed={(renamed) => { setCreatedPageId(undefined); update({ file: renamed.id }); }} /> : <div className="source-preview-empty"><span>没有匹配的来源</span><p>换一个文件夹或搜索词。</p></div>}
    </div>
    <ContextualAgentDock revision={revision} context={recentJourney ? { scope: "消费旅程", title: recentJourney.title, summary: `${recentJourney.transactionCount} 笔消费被串成 ${recentJourney.clusters.length} 组旅程线索。`, defaultMode: "read", launcherLabel: "聊聊这段旅程", suggestions: [`请从「${recentJourney.title}」里最有画面的一段线索开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来，不要修改知识库。`, "先从最有画面的一次出行、聚会或生活变化开始，邀请我慢慢讲出来。"] } : { scope: "生活记录", title: selected?.title || "生活记录", pageId: selected?.id, summary: selected?.excerpt || `当前有 ${pages.length} 份原始记录。`, defaultMode: "read", launcherLabel: "聊聊这份记录", suggestions: ["这份记录里有哪些还没有真正说清楚、值得我继续补充的地方？", "请概括这份记录，并区分事实、感受和后来的解释。"] }} />
  </div>;
}
