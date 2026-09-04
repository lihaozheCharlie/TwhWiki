import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PaymentJourneySummary, SourceImportBatch, SourceImportChannel, VaultInfo } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { Icon } from "../../shared/ui";
import { preparePhotoFile } from "./photo-compression";
import { PHOTO_LIMIT, photoSelectionError } from "./photo-model";
import "./photo-memory.css";

export type ImportRoute = "files" | "chat" | "bill" | "photos";

type ChatImportProvider = Exclude<SourceImportChannel, "files" | "alipay" | "photos">;

const chatImportProviders: Array<{ id: ChatImportProvider; label: string }> = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "doubao", label: "豆包" },
  { id: "other-ai", label: "其他 AI" },
];

const rememberedImportRouteKey = "the-way-here.import-route";
const rememberedImportProviderKey = "the-way-here.import-provider";

function rememberedImportRoute(fallback: ImportRoute): ImportRoute {
  try {
    const saved = window.localStorage.getItem(rememberedImportRouteKey);
    return saved === "files" || saved === "chat" || saved === "bill" || saved === "photos" ? saved : fallback;
  } catch {
    return fallback;
  }
}

function rememberedImportProvider(): ChatImportProvider {
  try {
    const saved = window.localStorage.getItem(rememberedImportProviderKey);
    return chatImportProviders.some(({ id }) => id === saved) ? saved as ChatImportProvider : "chatgpt";
  } catch {
    return "chatgpt";
  }
}

function formatImportBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}

export function RecordImportTrigger({ onClick, className = "", label = "带一段记录进来" }: { onClick: () => void; className?: string; label?: string }) {
  return <button type="button" className={`record-import-trigger${className ? ` ${className}` : ""}`} aria-haspopup="dialog" onClick={onClick}><Icon name="build" size={15} />{label}</button>;
}

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

export function ImportMaterialsModal({ folders, currentFolder, initialRoute, onClose, onImported, onJourney }: { folders: string[]; currentFolder: string; initialRoute?: ImportRoute; onClose: () => void; onImported: (batch: SourceImportBatch) => void; onJourney: (journey: PaymentJourneySummary) => void }) {
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  const [memoryTitle, setMemoryTitle] = useState("");
  const preparation = useRef<AbortController | undefined>(undefined);
  const [preparing, setPreparing] = useState("");
  const [photoPreparationNote, setPhotoPreparationNote] = useState("");
  useEffect(() => () => preparation.current?.abort(), []);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [route, setRoute] = useState<ImportRoute>(() => initialRoute || rememberedImportRoute("files"));
  const [provider, setProvider] = useState<ChatImportProvider>(rememberedImportProvider);
  const [step, setStep] = useState<1 | 2>(1);
  const [files, setFiles] = useState<SelectedImportFile[]>([]);
  const [folderMode, setFolderMode] = useState<"existing" | "new">("existing");
  const [targetFolder, setTargetFolder] = useState(() => { const initial = initialRoute || rememberedImportRoute("files"); return initial === "photos" ? "照片记忆" : initial === "bill" ? "消费账单" : currentFolder; });
  const [newFolder, setNewFolder] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [draggingMaterials, setDraggingMaterials] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const importingRef = useRef(importing);
  const totalBytes = files.reduce((total, item) => total + item.file.size, 0);
  const channel: SourceImportChannel = route === "photos" ? "photos" : route === "chat" ? provider : route === "bill" ? "alipay" : "files";
  const acceptedPattern = route === "photos" ? /\.(jpe?g|png|webp)$/i : route === "bill" ? /\.csv$/i : route === "files" ? /\.(md|txt|zip)$/i : /\.(md|txt|zip|json|html?)$/i;
  const accept = route === "photos" ? ".jpg,.jpeg,.png,.webp" : route === "bill" ? ".csv,text/csv" : route === "files" ? ".md,.txt,.zip,text/markdown,text/plain,application/zip" : ".md,.txt,.zip,.json,.html,.htm,text/markdown,text/plain,application/json,text/html,application/zip";
  const destination = folderMode === "new" ? newFolder.trim() : targetFolder;
  const destinationFolders = [...new Set([...(route === "photos" ? ["照片记忆"] : route === "bill" ? ["消费账单"] : []), ...folders])];
  const routeLabel = route === "photos" ? "照片与影像" : route === "files" ? "日记与笔记" : route === "chat" ? "聊天记录" : "消费账单";

  useEffect(() => {
    const urls = route === "photos" ? files.map(({ file }) => URL.createObjectURL(file)) : [];
    setThumbnails(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files, route]);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { importingRef.current = importing; }, [importing]);
  useEffect(() => {
    try {
      window.localStorage.setItem(rememberedImportRouteKey, route);
      if (route === "chat") window.localStorage.setItem(rememberedImportProviderKey, provider);
    } catch {
      // Import still works when browser storage is unavailable.
    }
  }, [provider, route]);

  useEffect(() => {
    const focusStep = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>(step === 1 ? "[data-autofocus]" : ".import-destination-options > button")?.focus(), 0);
    return () => window.clearTimeout(focusStep);
  }, [step]);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const obscuredElements: Array<{ element: HTMLElement; hadInert: boolean; ariaHidden: string | null }> = [];
    let visibleBranch = dialogRef.current?.parentElement;
    while (visibleBranch && visibleBranch !== document.body) {
      const parent = visibleBranch.parentElement;
      if (!parent) break;
      [...parent.children].forEach((sibling) => {
        if (sibling === visibleBranch || !(sibling instanceof HTMLElement)) return;
        obscuredElements.push({ element: sibling, hadInert: sibling.hasAttribute("inert"), ariaHidden: sibling.getAttribute("aria-hidden") });
        sibling.setAttribute("inert", "");
        sibling.setAttribute("aria-hidden", "true");
      });
      visibleBranch = parent;
    }
    document.body.style.overflow = "hidden";
    const focusDialog = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus(), 0);
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
      obscuredElements.forEach(({ element, hadInert, ariaHidden }) => {
        if (!hadInert) element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.clearTimeout(focusDialog);
      window.removeEventListener("keydown", manageKeyboard);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

  function changeRoute(next: ImportRoute) {
    preparation.current?.abort(); setPreparing(""); setPhotoPreparationNote("");
    setRoute(next);
    setStep(1);
    setFiles([]);
    setError("");
    setDraggingMaterials(false);
    setTargetFolder(next === "photos" ? "照片记忆" : next === "bill" ? "消费账单" : currentFolder);
    setFolderMode("existing");
    setNewFolder("");
    dragDepthRef.current = 0;
  }

  async function selectFiles(candidates: SelectedImportFile[]) {
    if (importing || preparing) return;
    if (route === "photos") {
      const controller = new AbortController();
      preparation.current = controller;
      const combined = [...files];
      const warnings: string[] = [];
      let compressed = 0;
      try {
        for (const [index, item] of candidates.entries()) {
          if (controller.signal.aborted) return;
          const invalid = photoSelectionError(item.file);
          if (invalid) { warnings.push(invalid); continue; }
          if (combined.some((p) => p.relativePath === item.relativePath && p.file.lastModified === item.file.lastModified)) continue;
          if (combined.length >= PHOTO_LIMIT) { warnings.push(`每批最多 ${PHOTO_LIMIT} 张，超出的照片未添加`); break; }
          setPreparing(`正在准备第 ${index + 1} / ${candidates.length} 张照片${item.file.size > 20 * 1024 * 1024 ? "，压缩大图中…" : "…"}`);
          try {
            const file = await preparePhotoFile(item.file, controller.signal);
            if (controller.signal.aborted) return;
            if (file !== item.file) compressed += 1;
            combined.push({ file, relativePath: item.relativePath });
          } catch (reason) {
            if (controller.signal.aborted) return;
            warnings.push(`${item.file.name}：${reason instanceof Error ? reason.message : "图片处理失败"}`);
          }
        }
        if (!controller.signal.aborted) {
          setFiles(combined);
          setError(warnings.join("；"));
          setPhotoPreparationNote(compressed ? `本次已压缩 ${compressed} 张大图，将保存压缩副本；电脑上的原文件不变。` : "");
        }
      } finally { if (!controller.signal.aborted) setPreparing(""); }
      return;
    }
    const selected = candidates.filter(({ file }) => acceptedPattern.test(file.name)).slice(0, route === "bill" ? 1 : undefined);
    setFiles(selected);
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
    if (preparing || importing) return;
    if (step === 1) {
      if (!files.length) {
        setError("请先选择需要带进来的材料。");
        return;
      }
      if (totalBytes > 100 * 1024 * 1024) {
        setError("这批材料超过 100 MB，请拆分后再导入。");
        return;
      }
      setError("");
      setStep(2);
      return;
    }
    if (!files.length) {
      setError("请先选择需要带进来的材料。");
      return;
    }
    if (totalBytes > 100 * 1024 * 1024) {
      setError("这批材料超过 100 MB，请拆分后再导入。");
      return;
    }
    if (folderMode === "new" && !destination) {
      setError("请输入新文件夹名称。");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const payload = [];
      for (const { file, relativePath } of files) payload.push({
        name: file.name,
        relativePath,
        content: /\.zip$/i.test(file.name) || route === "bill" || route === "photos" ? await fileToBase64(file) : await file.text(),
        encoding: /\.zip$/i.test(file.name) || route === "bill" || route === "photos" ? "base64" as const : "utf8" as const,
        mimeType: file.type || undefined,
      });
      const batch = await api<SourceImportBatch>(route === "photos" ? "/api/imports/photos" : "/api/imports/files", { method: "POST", ...(route === "photos" ? { signal: AbortSignal.timeout(120_000) } : {}), body: JSON.stringify({ files: payload, channel, targetFolder: destination, ...(route === "photos" ? { title: memoryTitle.trim() || "照片记忆", knowledgeBaseId: vault?.knowledgeBaseId } : {}) }) });
      if (batch.journey) onJourney(batch.journey);
      onClose();
      onImported(batch);
    } catch (reason: any) {
      setError(reason.name === "TimeoutError" ? "导入超时，请检查生活记录中是否已保存，再重试。" : reason.message);
    } finally {
      setImporting(false);
    }
  }

  return createPortal(<div className="import-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) onClose(); }}>
    <section ref={dialogRef} className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <header className="import-modal-header"><div><h2 id="import-modal-title">带一段记录进来</h2><p>{step === 1 ? "先说说材料来自哪里，再把它放进来。" : "确认这些记录要保留到哪里。"}</p></div><button type="button" onClick={onClose} disabled={importing} aria-label="关闭记录导入窗口"><Icon name="close" size={18} /></button></header>
      <form onSubmit={submit}>
        <ol className="import-stepper" aria-label="导入进度">
          <li className={step === 1 ? "active" : "done"} aria-current={step === 1 ? "step" : undefined}><span>{step === 2 ? <Icon name="check" size={12} /> : "1"}</span><b>{step === 2 ? `${routeLabel} · ${files.length} 个文件` : "选类型 + 加材料"}</b></li>
          <li className="import-stepper-line" aria-hidden="true" />
          <li className={step === 2 ? "active" : ""} aria-current={step === 2 ? "step" : undefined}><span>2</span><b>确认位置</b></li>
        </ol>
        <div className="import-modal-body">
          {step === 1 ? <section className="import-step-panel" aria-label="选择记录类型并添加材料">
            <div className="import-type-grid" role="group" aria-label="记录类型">
              <button type="button" data-autofocus={route === "files" ? "true" : undefined} aria-pressed={route === "files"} className={route === "files" ? "active" : ""} onClick={() => changeRoute("files")}><span className="import-type-icon"><Icon name="journal" size={18} /></span><b>日记与笔记</b><p>Markdown、TXT、ZIP，保留文件夹层级</p><small><Icon name="down" size={12} />下方可选文件或文件夹</small></button>
              <button type="button" data-autofocus={route === "chat" ? "true" : undefined} aria-pressed={route === "chat"} className={route === "chat" ? "active" : ""} onClick={() => changeRoute("chat")}><span className="import-type-icon"><Icon name="message" size={18} /></span><b>聊天记录</b><p>Claude、ChatGPT、Gemini、DeepSeek、豆包</p><small><Icon name="down" size={12} />下方先选平台，再加材料</small></button>
              <button type="button" data-autofocus={route === "bill" ? "true" : undefined} aria-pressed={route === "bill"} className={route === "bill" ? "active" : ""} onClick={() => changeRoute("bill")}><span className="import-type-icon"><Icon name="receipt" size={18} /></span><b>消费账单</b><p>支付宝导出 CSV，自动串成旅程线索</p><small><Icon name="down" size={12} />下方只接收一份 CSV</small></button>
              <button type="button" data-autofocus={route === "photos" ? "true" : undefined} aria-pressed={route === "photos"} className={route === "photos" ? "active import-photo-type" : "import-photo-type"} onClick={() => changeRoute("photos")}><span className="import-type-icon"><Icon name="image" size={18} /></span><b>照片与影像</b><p>几张照片，找出人物、场景与回忆线索</p><small><Icon name="down" size={12} />下方选照片，最多 10 张</small></button>
            </div>
            <div className="import-material-zone">
              <header><div><Icon name="down" size={14} /><b>加材料</b></div><span>随上方记录类型自动切换</span></header>
              {route === "chat" ? <div className="import-provider-list" role="group" aria-label="聊天平台">{chatImportProviders.map((item) => <button type="button" key={item.id} aria-pressed={provider === item.id} className={provider === item.id ? "active" : ""} onClick={() => { setProvider(item.id); setFiles([]); setError(""); }}>{item.label}</button>)}</div> : null}
              <div
                className={`import-file-picker is-dropzone${draggingMaterials ? " is-dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDraggingMaterials(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDraggingMaterials(false); }}
                onDrop={(event) => { event.preventDefault(); dragDepthRef.current = 0; setDraggingMaterials(false); void selectDroppedFiles(event.dataTransfer); }}
              >
                <span className="import-drop-icon"><Icon name="up" size={20} /></span>
                <b>{draggingMaterials ? "放在这里" : "选择或拖入材料"}</b>
                <span>{route === "photos" ? "JPG / PNG / WebP · 最多 10 张 · 超过 20 MB 自动压缩，单张上限 100 MB · HEIC 请先导出 JPG" : route === "bill" ? "支付宝导出的 CSV · 单次一份，最多 100 MB" : route === "files" ? "文件、文件夹或 ZIP，自动识别并保留层级 · 单次最多 100 MB" : "官方导出包、文件夹或常见文本格式 · 单次最多 100 MB"}</span>
                <div className="import-file-picker-controls">
                  <button type="button" disabled={Boolean(preparing) || importing} onClick={() => fileInputRef.current?.click()}><Icon name="journal" size={14} />{route === "photos" ? files.length ? "继续添加照片" : "选择照片" : route === "bill" ? "选择 CSV" : "选择文件"}</button>
                  {route !== "bill" ? <button type="button" disabled={Boolean(preparing) || importing} onClick={() => folderInputRef.current?.click()}><Icon name="source" size={14} />选择文件夹</button> : null}
                </div>
                <input ref={fileInputRef} key={`${route}-${provider}-files`} name="import-files" type="file" accept={accept} multiple={route !== "bill"} tabIndex={-1} aria-hidden="true" onChange={selectInputFiles} />
                {route !== "bill" ? <input ref={(node) => { folderInputRef.current = node; if (node) node.webkitdirectory = true; }} key={`${route}-${provider}-folder`} name="import-folder" type="file" accept={accept} multiple tabIndex={-1} aria-hidden="true" onChange={selectInputFiles} /> : null}
              </div>
              {route === "photos" ? <div className="import-photo-selection" aria-label="已选择的照片">{files.map((item, index) => <figure key={item.relativePath}><img src={thumbnails[index]} alt={item.file.name} /><button type="button" disabled={Boolean(preparing) || importing} aria-label={`移除 ${item.file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}><Icon name="close" size={12} /></button><figcaption>{item.file.name}</figcaption></figure>)}</div> : files.length ? <div className="import-selection-list" aria-label="已选择的材料">
                {files.slice(0, 3).map((item) => <div key={item.relativePath}><span><Icon name="journal" size={13} /></span><b>{item.relativePath}</b><small>{formatImportBytes(item.file.size)}</small></div>)}
                {files.length > 3 ? <div><span><Icon name="source" size={13} /></span><b>另有 {files.length - 3} 个文件</b><small>{formatImportBytes(files.slice(3).reduce((sum, item) => sum + item.file.size, 0))}</small></div> : null}
              </div> : null}
            </div>
          </section> : <section className="import-destination-step" aria-label="确认保存位置">
            {route === "photos" ? <label className="import-folder-field"><span>给这段记忆起个名字</span><input value={memoryTitle} maxLength={100} onChange={(event) => setMemoryTitle(event.target.value)} placeholder="例如：毕业前的那个夏天" /></label> : null}
            <div className="import-destination-options">
              <button type="button" className={folderMode === "existing" ? "active" : ""} aria-pressed={folderMode === "existing"} onClick={() => setFolderMode("existing")}><span className="import-radio" /><b>放进已有文件夹</b></button>
              {folderMode === "existing" ? <label className="import-folder-field"><span>目标文件夹</span><select name="target-folder" value={targetFolder} onChange={(event) => setTargetFolder(event.target.value)}><option value="">生活记录根目录</option>{destinationFolders.map((name) => <option value={name} key={name}>{name}</option>)}</select></label> : null}
              <button type="button" className={folderMode === "new" ? "active" : ""} aria-pressed={folderMode === "new"} onClick={() => setFolderMode("new")}><span className="import-radio" /><b>新建一个文件夹</b></button>
              {folderMode === "new" ? <label className="import-folder-field"><span>新文件夹名称</span><input name="new-import-folder" autoComplete="off" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder={route === "chat" ? `AI聊天记录/${chatImportProviders.find((item) => item.id === provider)?.label}` : route === "bill" ? "消费账单/2026" : "导入记录/2026"} /></label> : null}
            </div>
            <aside className="import-summary" aria-label="这批材料摘要"><h3>确认这批材料</h3><dl><div><dt>类型</dt><dd>{routeLabel}</dd></div>{route === "chat" ? <div><dt>平台</dt><dd>{chatImportProviders.find((item) => item.id === provider)?.label}</dd></div> : null}<div><dt>文件数</dt><dd>{files.length} 个</dd></div><div><dt>大小</dt><dd>{formatImportBytes(totalBytes)}</dd></div><div><dt>保存到</dt><dd>{destination || "生活记录根目录"}</dd></div></dl></aside>
            {route === "photos" ? <aside className="import-photo-privacy">照片保留在当前知识库；超过 20 MB 的图片在本地压缩后保存。点击看图时使用当前 AI 模型，确认人物后默认用裁剪图作头像。</aside> : null}
          </section>}
        </div>
        <footer className="import-modal-footer"><div aria-live="polite">{preparing ? <span role="status">{preparing}</span> : error ? <span role="alert">{error}</span> : photoPreparationNote || (step === 1 ? files.length ? `已选 ${files.length} 个文件 · 共 ${formatImportBytes(totalBytes)}` : route === "photos" ? "照片保留在本地，最多 10 张。大图会在本地压缩。" : route === "bill" ? "仅支持支付宝导出的 CSV；单次选择一份。" : "支持文件、文件夹和 ZIP；只会保留支持的记录格式。" : "带进来后即可在生活记录中查看，并保留原始来源。")}</div><div>{step === 1 ? <><button type="button" className="secondary-action" onClick={onClose}>取消</button><button className="primary-action" disabled={!files.length || Boolean(preparing)}>下一步<Icon name="arrow" size={14} /></button></> : <><button type="button" className="secondary-action" onClick={() => { setStep(1); setError(""); }} disabled={importing}><Icon name="back" size={14} />上一步</button><button className="primary-action" disabled={importing || (route === "photos" && !vault) || (folderMode === "new" && !destination)}>{importing ? "正在带进来…" : <>{route === "photos" ? "保留照片，看看线索" : "带进来"}<Icon name="arrow" size={14} /></>}</button></>}</div></footer>
      </form>
    </section>
  </div>, document.body);
}
