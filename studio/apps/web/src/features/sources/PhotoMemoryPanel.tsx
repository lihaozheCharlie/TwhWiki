import { useEffect, useRef, useState } from "react";
import { photoAssetUrl, type PhotoMemory, type PhotoPerson, type RelationshipsView, type SourceImportBatch, type VaultInfo, type WikiRun } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { Icon } from "../../shared/ui";
import { openContextAgent } from "../collaboration/model";
import { clampPhotoBox } from "./photo-model";
import { parsePhotoDraft, photoDraftKey } from "./photo-draft";
import { PhotoPeopleEditor } from "./PhotoPeopleEditor";
import { detectPhotoBatch, type PhotoDetectionStatus } from "./photo-detection";
import "./photo-memory.css";

// Design contract: extend the supplied archive-paper photo flow, not a separate media app.
// The photograph leads; visible clues, user identities and confirmed narrative remain separate.
// First viewport: batch title and steps, filmstrip, large selected photograph, editable clues.
export function PhotoMemoryPanel({ batch, revision }: { batch: SourceImportBatch; revision: number }) {
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  return vault ? <BoundPhotoMemory key={`${vault.knowledgeBaseId}:${batch.id}`} batch={batch} knowledgeBaseId={vault.knowledgeBaseId} revision={revision} /> : <p>正在打开照片记忆…</p>;
}

function BoundPhotoMemory({ batch, knowledgeBaseId, revision }: { batch: SourceImportBatch; knowledgeBaseId: string; revision: number }) {
  const draftKey = photoDraftKey(knowledgeBaseId, batch.id);
  const [recovery, setRecovery] = useState(() => { try { return parsePhotoDraft(localStorage.getItem(draftKey)); } catch { return undefined; } });
  const [draftSaved, setDraftSaved] = useState(false);
  const base = `/api/photo-memories/${encodeURIComponent(batch.id)}`;
  const { data, error: loadError } = useApi<PhotoMemory>(`${base}?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`, revision);
  const { data: relationships } = useApi<RelationshipsView>("/api/views/relationships", revision);
  const people = relationships?.groups.flatMap((group) => group.people) || [];
  const { data: runs = [] } = useApi<WikiRun[]>("/api/runs", revision);
  const [memory, setMemory] = useState<PhotoMemory>();
  const [selectedId, setSelectedId] = useState("");
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, PhotoPerson[]>>({});
  const [story, setStory] = useState("");
  const [storyDirty, setStoryDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<Record<string, string>>({});
  const [detection, setDetection] = useState<Record<string, PhotoDetectionStatus>>({});
  const [detectionRetry, setDetectionRetry] = useState(0);
  const completedDetections = useRef(new Set<string>());
  const latestAnnotations = useRef({ memory, photoDrafts });
  latestAnnotations.current = { memory, photoDrafts };
  const photoIds = memory?.photos.map((p) => p.id).join(",") ?? "";
  useEffect(() => {
    if (!memory || recovery) return;
    const controller = new AbortController();
    const hasAnnotations = (id: string) => Object.hasOwn(latestAnnotations.current.photoDrafts, id) || Boolean(latestAnnotations.current.memory?.photos.find((p) => p.id === id)?.people.length);
    void detectPhotoBatch(memory.photos.map((p) => ({ id: p.id, url: photoAssetUrl(knowledgeBaseId, batch.id, p.id) })), {
      signal: controller.signal,
      shouldSkip: (id) => completedDetections.current.has(id) || hasAnnotations(id),
      onStatus: (id, status) => {
        if (status.state !== "detecting") completedDetections.current.add(id);
        setDetection((current) => ({ ...current, [id]: status }));
      },
      onDetected: (id, boxes) => setPhotoDrafts((current) => Object.hasOwn(current, id) ? current : { ...current, [id]: boxes.map((box) => ({ id: crypto.randomUUID(), name: "", useAsAvatar: true, box: clampPhotoBox(box) })) }),
    });
    return () => controller.abort();
  }, [photoIds, Boolean(recovery), detectionRetry, knowledgeBaseId, batch.id]);
  useEffect(() => { if (data) setMemory(data); }, [data]);
  const photo = memory?.photos.find((p) => p.id === selectedId) || memory?.photos[0];
  const editing = photo ? photoDrafts[photo.id] ?? photo.people : [];
  const dirty = Boolean(photo && Object.hasOwn(photoDrafts, photo.id));
  const selectedPerson = editing.find((p) => p.id === selectedPeople[photo?.id ?? ""]) || editing[0];
  const detectionStatus = photo ? detection[photo.id] : undefined;
  function selectPerson(id: string) { if (photo) setSelectedPeople((current) => ({ ...current, [photo.id]: id })); }
  const anyDirty = Object.keys(photoDrafts).length > 0;
  function setEditing(update: PhotoPerson[] | ((current: PhotoPerson[]) => PhotoPerson[])) {
    if (!photo) return;
    setPhotoDrafts((drafts) => ({ ...drafts, [photo.id]: typeof update === "function" ? update(drafts[photo.id] ?? photo.people) : update }));
  }
  function discardPeople() {
    if (!photo) return;
    setPhotoDrafts(({ [photo.id]: removed, ...rest }) => rest);
  }
  useEffect(() => { if (memory && !storyDirty) setStory(memory.draft || memory.confirmedStory); }, [memory?.revision, storyDirty]);
  useEffect(() => {
    if (!memory || !photo || recovery) return;
    try {
      if (anyDirty || storyDirty) localStorage.setItem(draftKey, JSON.stringify({ revision: memory.revision, photoId: photo.id, people: editing, peopleDirty: dirty, story, storyDirty, photoDrafts }));
      else localStorage.removeItem(draftKey);
      setDraftSaved(anyDirty || storyDirty);
    } catch { setDraftSaved(false); setError("本机暂时无法保存草稿。离开前请确认保存，或复制保留讲述。"); }
  }, [draftKey, memory?.revision, photo?.id, dirty, anyDirty, storyDirty, editing, story, recovery, photoDrafts]);
  useEffect(() => {
    if ((!anyDirty && !storyDirty) || draftSaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty, storyDirty, draftSaved]);
  function recoverDraft(restore: boolean) {
    if (restore && recovery && memory) {
      if (memory.photos.some((p) => p.id === recovery.photoId)) {
        setSelectedId(recovery.photoId);
      }
      setPhotoDrafts(Object.fromEntries(Object.entries(recovery.photoDrafts ?? (recovery.peopleDirty ? { [recovery.photoId]: recovery.people } : {})).filter(([id]) => memory.photos.some((p) => p.id === id))));
      if (recovery.storyDirty) { setStory(recovery.story); setStoryDirty(true); }
      setNotice("已恢复本机未确认草稿。请核对人物与讲述，再决定是否确认。");
    }
    try { localStorage.removeItem(draftKey); } catch { /* Keep the visible recovery choice usable when storage is unavailable. */ }
    setRecovery(undefined);
  }
  const related = runs.filter((r) => r.knowledgeBaseId === knowledgeBaseId && (r.outputTarget?.kind === "photo-memory" && r.outputTarget.importId === batch.id || r.sourceContext?.importId === batch.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = related.find((r) => !["completed", "failed", "interrupted"].includes(r.status));
  const latestDialogue = related.find((r) => r.outputTarget?.kind === "photo-memory" && r.outputTarget.phase === "enrich");
  const newest = related[0];
  const locked = Boolean(busy || active || recovery);
  const imageUrl = photo ? photoAssetUrl(knowledgeBaseId, batch.id, photo.id) : "";
  const analyzed = memory?.photos.some((p) => p.observation);
  const published = Boolean(memory?.builtAt && memory.confirmedAt && memory.builtAt >= memory.confirmedAt);

  async function save(payload: object) {
    if (!memory) return;
    setBusy("保存中"); setError(""); setNotice("");
    try {
      const saved = await api<PhotoMemory>(base, { method: "PATCH", body: JSON.stringify({ ...payload, knowledgeBaseId, revision: memory.revision }) });
      setMemory(saved); if ("people" in payload) discardPeople(); if ("story" in payload) setStoryDirty(false); setNotice("已保存。核对故事后，再构建进知识库。");
    } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  }
  async function start(phase: "analyze" | "enrich" | "build") {
    if (!memory) return;
    setError(""); setBusy("正在开始");
    try {
      const isBuild = phase === "build";
      const run = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({
        knowledgeBaseId, mode: isBuild ? "write" : "read", title: `${isBuild ? "构建" : phase === "analyze" ? "看一看" : "聊聊"} · ${memory.title}`,
        displayPrompt: isBuild ? "构建这段记忆" : phase === "analyze" ? "看看照片里的场景，找一些可以聊的线索" : "从这批照片里的一处具体线索开始，一次问我一件事。",
        prompt: isBuild ? `请按 build-wiki 的导入后冷启构建入口读取「${memory.reportPath}」。只摄取“用户确认的讲述”和用户明确指定的人物；保留来源不变，不猜测未命名者、关系或情绪。新人物须按规则处理，同名且无法核实时不要合并。完成派生内容和质量门，并说明更新或跳过的内容。` : phase === "analyze" ? "请看这批照片，只整理可见线索和可供讲述的具体问题，暂不写人生故事。" : "围绕当前照片记忆和用户指定的人物，选择一处具体线索邀请我讲述。一次只问一个问题，允许跳过，不把照片表情当成真实心情。",
        ...(!isBuild ? { outputTarget: { kind: "photo-memory", importId: batch.id, storedPath: memory.reportPath, label: memory.title, phase } } : { sourceContext: { importId: batch.id, storedPath: memory.reportPath, flow: "dialogue", operation: "build" } }),
      }) });
      openContextAgent({ runId: run.id });
    } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  }
  function editPerson(id: string, patch: Partial<PhotoPerson>) { setEditing((current) => current.map((p) => p.id === id ? { ...p, ...patch } : p)); }
  function choosePhoto(id: string) {
    if (id === photo?.id) return;
    setSelectedId(id); setNotice(""); setError("");
  }

  if (loadError) return <section className="photo-memory"><p role="alert">{loadError}</p></section>;
  if (!memory || !photo) return <section className="photo-memory"><p>正在打开这段记忆…</p></section>;
  return <section className="photo-memory" aria-label="照片记忆工作区">
    <header className="photo-memory-head"><div><h2>{memory.title}</h2><p>{memory.photos.length} 张照片 · 原图保留在本地 · 只把你确认的故事收进理解</p></div><span className={`photo-state${published && !anyDirty && !storyDirty && !recovery ? " is-built" : ""}`}>{anyDirty || storyDirty ? draftSaved ? "本机草稿 · 尚未确认" : "有未保存修改" : recovery ? "有可恢复的草稿" : active ? "正在整理" : published ? "已构建" : memory.confirmedAt ? "已确认 · 可构建" : "草稿 · 尚未构建"}</span></header>
    {recovery ? <aside className="photo-draft-recovery" aria-label="恢复未确认草稿"><div><b>这段记忆还有一份本机草稿</b><p>{recovery.revision !== memory.revision ? "知识库内容也已更新。恢复后请对照核对，再确认保存。" : "离开前的讲述和人物标注仍在，尚未提交，也不会自动构建。"}</p></div><div><button type="button" className="secondary-action" onClick={() => recoverDraft(true)}>恢复未确认草稿</button><button type="button" className="secondary-action" onClick={() => recoverDraft(false)}>丢弃本机草稿</button></div></aside> : null}
    <ol className="photo-steps" aria-label="照片记忆进度"><li>1 选好照片</li><li className={!memory.draft ? "active" : ""}>2 看线索、认人物</li><li className={memory.draft && !published ? "active" : ""}>3 讲述与确认</li><li className={published ? "active" : ""}>4 收进理解</li></ol>
    <div className="photo-analysis-bar"><div><b>{analyzed ? "画面线索已就绪，可以纠正，也可以跳过。" : "先看照片，再慢慢讲出里面的故事。"}</b><p>点击后由当前 AI 模型分析画面线索。</p></div><button type="button" className="secondary-action" disabled={locked} onClick={() => start("analyze")}><Icon name="spark" size={14} />{analyzed ? "重新看图" : "让 AI 看看照片"}</button></div>
    {active ? <p className="photo-feedback" role="status">正在处理「{active.title}」。可以离开，结果会保留。<button type="button" onClick={() => openContextAgent({ runId: active.id })}>查看进度</button></p> : newest?.status === "failed" ? <p className="photo-feedback" role="alert">{newest.error || "上一步没有完成，可以重试或手动讲述。"}</p> : null}
    <nav className="photo-filmstrip" aria-label="选择照片">{memory.photos.map((p, index) => <button type="button" key={p.id} disabled={Boolean(busy)} aria-pressed={p.id === photo.id} className={p.id === photo.id ? "active" : ""} onClick={() => choosePhoto(p.id)}><img src={photoAssetUrl(knowledgeBaseId, memory.id, p.id)} alt={p.name} loading="lazy" /><span>{index + 1} · {Object.hasOwn(photoDrafts, p.id) ? "标注待确认" : p.people.length ? `已指定 ${p.people.length} 人` : "待看一看"}</span></button>)}</nav>
    <div className="photo-clue-workspace">
      <div className="photo-evidence"><div className="photo-canvas" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}><img src={imageUrl} alt={photo.name} />{editing.map((p, index) => <button type="button" key={p.id} aria-label={`选择${p.name || `人物 ${index + 1}`}`} aria-pressed={p.id === selectedPerson?.id} onClick={() => selectPerson(p.id)} className={`photo-face-box${p.id === selectedPerson?.id ? " is-selected" : ""}`} style={{ left: `${p.box.x * 100}%`, top: `${p.box.y * 100}%`, width: `${p.box.width * 100}%`, height: `${p.box.height * 100}%` }}><span>{p.name || `人物 ${index + 1}`}</span></button>)}</div><p className="photo-caption">{photo.name} · {photo.width} × {photo.height} 分析副本<a href={photoAssetUrl(knowledgeBaseId, memory.id, photo.id, "original")} download={photo.name}>保存原图</a></p></div>
      <div className="photo-clues"><h3>这张照片留下的线索</h3><section><h4>画面里有什么 <small>AI 候选，不是人生事实</small></h4><p>{photo.observation || "还没有分析。你也可以不调用模型，直接认人、讲述。"}</p>{photo.question ? <blockquote>{photo.question}</blockquote> : null}</section>
        <section><h4>照片里的人 <small>本地自动圈选，身份由你指定</small></h4>
          {!editing.length ? <div className="photo-detection-status" role={detectionStatus?.state === "failed" ? "alert" : "status"}>
            <p className="photo-help">{recovery ? "恢复草稿后继续查看人物。" : detectionStatus?.state === "failed" ? detectionStatus.error : detectionStatus?.state === "done" || dirty ? "没有需要标注的人脸，可以直接讲故事。" : "正在本地自动找人脸…可以先看其他照片。"}</p>
            {detectionStatus?.state === "failed" || detectionStatus?.state === "done" && !dirty ? <button type="button" className="secondary-action" disabled={locked} onClick={() => { completedDetections.current.delete(photo.id); setDetectionRetry((value) => value + 1); }}>重新检测人脸</button> : null}
          </div> : <PhotoPeopleEditor people={people} editing={editing} selectedId={selectedPerson!.id} locked={locked} onSelect={selectPerson} onChange={editPerson} onRemove={(id) => setEditing(editing.filter((p) => p.id !== id))} />}
          {dirty ? <div className="photo-inline-actions"><button type="button" disabled={locked} onClick={() => save({ photoId: photo.id, people: editing.map((person) => ({ ...person, useAsAvatar: true })) })}>确认人物标注</button><button type="button" disabled={locked} onClick={() => { discardPeople(); }}>放弃更改</button></div> : null}
        </section>
      </div>
    </div>
    <section className="photo-story"><header><div><h3>把画面之外的故事留下来</h3><p>时间、人物、发生的事，以及只有你知道的感受。不想讲的部分可以留白。</p></div><button type="button" className="secondary-action" disabled={locked || anyDirty || storyDirty} onClick={() => latestDialogue ? openContextAgent({ runId: latestDialogue.id }) : start("enrich")}><Icon name="message" size={14} />{latestDialogue ? "继续聊聊，丰富这段记忆" : "从这张照片开始聊"}</button></header><label htmlFor={`photo-story-${memory.id}`}>记忆报告 · 请核对或直接填写</label><textarea id={`photo-story-${memory.id}`} rows={7} value={story} disabled={locked} onChange={(e) => { setStory(e.target.value); setStoryDirty(true); }} placeholder="可以先聊聊，草稿会出现在这里；也可以直接写下这段记忆。" /><footer><p>{memory.confirmedAt && !storyDirty && !anyDirty ? "这份讲述已经由你确认。构建只读取确认稿。" : "AI 草稿不等于事实。确认前不会进入 Wiki；对话文本会发送给当前模型。"}</p><div><button type="button" disabled={locked || anyDirty || !story.trim()} className="secondary-action" onClick={() => save({ story })}>确认这份讲述</button><button type="button" className="primary-action" disabled={locked || anyDirty || storyDirty || !memory.confirmedAt || published} onClick={() => start("build")}>{published ? "已收进理解" : "构建这段记忆"}<Icon name="arrow" size={14} /></button></div></footer></section>
    {anyDirty && !dirty ? <p className="photo-feedback" role="status">其他照片还有待确认标注，切回对应照片即可继续。</p> : null}
    {draftSaved ? <p className="photo-feedback" role="status">未确认的修改已暂存在本机浏览器，离开或刷新后可以恢复；尚未提交知识库。</p> : null}
    <p className="photo-feedback" aria-live="polite">{busy || notice}</p>{error ? <p className="photo-error" role="alert">{error}</p> : null}
  </section>;
}
