import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentApprovalDecision, AgentOutputTarget, AgentReasoningEffort, SourceRunContext, VaultInfo, WikiRun } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { useReturnContext } from "../../shared/routing";
import { resizeComposerTextarea } from "../../shared/composer-input";
import { Icon, Loading } from "../../shared/ui";
import { AiConfiguration, reasoningLabels, useAgentSelection } from "./AgentSettings";
import { localWikiHref } from "./local-page-link";
import { agentContextIdentity, attachedContextPrompt, collaborationModes, contextPrompt, groupAgentThreads, plainPreview, resolveAgentAutoSubmission, resolveComposerMode, runConversation, runDisplayPrompt, runFinalAnswer, runTechnicalEvents, shouldSubmitAgentInput, type AgentAttachedContext, type AgentAutoSubmission, type AgentContext, type AgentThread, type OpenContextAgentRequest } from "./model";

const defaultAgentModel = "gpt-5.6-sol";
const defaultAgentEffort: AgentReasoningEffort = "high";
type DockView = "compose" | "history";
type RunDetailView = "changes" | "validation" | "technical";

function submitAgentFormOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
  if (!shouldSubmitAgentInput({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

export function ContextualAgentDock({ revision, context }: { revision: number; context: AgentContext }) {
  const { data: vault, loading: vaultLoading } = useApi<VaultInfo>("/api/vault", revision);
  const { data: runList, loading: runsLoading, error: runsError } = useApi<WikiRun[]>("/api/runs", revision);
  const agent = useAgentSelection(revision);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DockView>("compose");
  const [draft, setDraft] = useState("");
  const [attachedContext, setAttachedContext] = useState<AgentAttachedContext>();
  const [runId, setRunId] = useState("");
  const [historyReturnRunId, setHistoryReturnRunId] = useState("");
  const [mode, setMode] = useState<WikiRun["mode"]>(() => resolveComposerMode(context.defaultMode, context.defaultOutputTarget));
  const [outputTarget, setOutputTarget] = useState<AgentOutputTarget | undefined>(() => context.defaultOutputTarget);
  const [sourceContext, setSourceContext] = useState<SourceRunContext | undefined>(() => context.defaultSourceContext);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const submittingRef = useRef(false);
  const pendingAutoSubmissionRef = useRef<AgentAutoSubmission | undefined>(undefined);
  const threads = groupAgentThreads(runList || []);
  const contextIdentity = agentContextIdentity(context);

  useEffect(() => {
    const openDock = (event: Event) => {
      const request = (event as CustomEvent<OpenContextAgentRequest>).detail || {};
      pendingAutoSubmissionRef.current = undefined;
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
      setError("");
      if (request.runId) {
        setRunId(request.runId);
        setView("history");
        return;
      }
      setRunId("");
      setView(request.view || "compose");
      const requestedOutputTarget = request.outputTarget || (!request.autoSubmit ? context.defaultOutputTarget : undefined);
      const requestedSourceContext = request.sourceContext || (!request.autoSubmit ? context.defaultSourceContext : undefined);
      const resolvedRequest = { ...request, outputTarget: requestedOutputTarget, sourceContext: requestedSourceContext };
      const autoSubmission = request.view === "history" ? undefined : resolveAgentAutoSubmission(resolvedRequest, context.defaultMode);
      setDraft(request.prompt !== undefined ? autoSubmission?.displayPrompt || request.prompt : "");
      setAttachedContext(request.attachedContext);
      setMode(resolveComposerMode(request.mode || context.defaultMode, requestedOutputTarget, request.lockMode));
      setOutputTarget(requestedOutputTarget);
      setSourceContext(requestedSourceContext);
      pendingAutoSubmissionRef.current = autoSubmission;
    };
    window.addEventListener("open-context-agent", openDock);
    return () => window.removeEventListener("open-context-agent", openDock);
  }, [context.defaultMode, context.defaultOutputTarget, context.defaultSourceContext]);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        const opener = openerRef.current;
        if (opener?.isConnected) opener.focus();
        else launcherRef.current?.focus();
      }
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      if (view === "compose" && !runId) textareaRef.current?.focus();
    }, 80);
    const manageKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!panelRef.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", manageKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", manageKeyboard);
    };
  }, [open, runId, view]);

  useLayoutEffect(() => {
    if (open && view === "compose" && !runId) resizeComposerTextarea(textareaRef.current);
  }, [draft, open, runId, view]);

  useEffect(() => {
    setDraft("");
    setAttachedContext(undefined);
    setRunId("");
    setMode(resolveComposerMode(context.defaultMode, context.defaultOutputTarget));
    setOutputTarget(context.defaultOutputTarget);
    setSourceContext(context.defaultSourceContext);
    setView("compose");
    setError("");
    pendingAutoSubmissionRef.current = undefined;
  }, [contextIdentity]);

  useEffect(() => {
    const pending = pendingAutoSubmissionRef.current;
    if (!pending || !open || view !== "compose" || runId || submitting || vaultLoading || agent.loading || !vault?.agentAvailable) return;
    pendingAutoSubmissionRef.current = undefined;
    void startRun(pending.prompt, pending.mode, pending.outputTarget, pending.displayPrompt, pending.sourceContext);
  }, [agent.loading, open, runId, submitting, vault?.agentAvailable, vaultLoading, view]);

  function startNewQuestion() {
    setRunId("");
    setHistoryReturnRunId("");
    setView("compose");
    setDraft("");
    setAttachedContext(undefined);
    setMode(resolveComposerMode(context.defaultMode, context.defaultOutputTarget));
    setOutputTarget(context.defaultOutputTarget);
    setSourceContext(context.defaultSourceContext);
    setError("");
    pendingAutoSubmissionRef.current = undefined;
  }

  function showHistory(returnToRunId = "") {
    setHistoryReturnRunId(returnToRunId);
    setRunId("");
    setView("history");
  }

  function leaveHistory() {
    if (historyReturnRunId) {
      setRunId(historyReturnRunId);
      setHistoryReturnRunId("");
      return;
    }
    startNewQuestion();
  }

  async function startRun(requestText: string, requestedMode = mode, requestedOutputTarget = outputTarget, displayPrompt = requestText, requestedSourceContext = sourceContext) {
    const request = requestText.trim();
    if (requestedMode !== "validate" && !request) {
      setError("先写下你想从哪里开始。");
      return;
    }
    if (submittingRef.current || vaultLoading || agent.loading || !vault?.agentAvailable) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const selection = requestedMode === "validate" ? undefined : await agent.save();
      const normalizedRequest = requestedMode === "validate" ? request || "运行当前知识库的质量检查。" : request;
      const runContext = attachedContext ? {
        ...context,
        title: attachedContext.title,
        summary: `已有理解：${attachedContext.currentUnderstanding}\n为什么值得聊：${attachedContext.reason}`,
      } : context;
      const run = await api<WikiRun>("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          mode: requestedMode,
          prompt: requestedMode === "validate" ? normalizedRequest : contextPrompt(runContext, attachedContext ? attachedContextPrompt(attachedContext, normalizedRequest) : normalizedRequest),
          displayPrompt: displayPrompt.trim() || normalizedRequest,
          runtimeId: selection?.runtimeId,
          model: selection?.model,
          effort: selection?.effort,
          title: requestedMode === "validate" ? "知识健康检查" : `处理：${runContext.title}`,
          outputTarget: requestedOutputTarget,
          sourceContext: requestedSourceContext,
        }),
      });
      setRunId(run.id);
      setView("history");
      setDraft("");
      setAttachedContext(undefined);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await startRun(draft);
  }

  const selectedRun = runList?.find((candidate) => candidate.id === runId);
  const panelTitle = runId ? selectedRun?.title || `处理：${context.title}` : view === "history" ? "聊过的事" : "一起往下想";
  const closeDock = () => setOpen(false);
  const submitDisabled = submitting || (mode !== "validate" && !draft.trim()) || vaultLoading || (mode !== "validate" && agent.loading) || !vault?.agentAvailable;

  return <>
    {!open && <button ref={launcherRef} className={`context-agent-launcher${context.compactLauncher ? " compact" : ""}`} title={context.launcherLabel || "找我聊聊"} onClick={() => { openerRef.current = launcherRef.current; setOpen(true); }} aria-label={`${context.launcherLabel || "找我聊聊"}，已带入当前页面`}><Icon name="spark" size={16} />{!context.compactLauncher && <b>{context.launcherLabel || "找我聊聊"}</b>}</button>}
    {open && <div className="context-agent-layer">
      <button className="context-agent-backdrop" aria-label="关闭对话窗口" onClick={closeDock} />
      <aside ref={panelRef} className="context-agent-panel" role="dialog" aria-modal="true" aria-labelledby="context-agent-title">
        <header className="context-agent-header">
          <div className="context-agent-title">
            {runId || view === "history" ? <button type="button" className="context-agent-icon-button" aria-label={runId ? "返回对话历史" : "返回对话"} onClick={() => runId ? showHistory(runId) : leaveHistory()}><Icon name="back" size={17} /></button> : <span className="context-agent-spark"><Icon name="spark" size={14} /></span>}
            <h2 id="context-agent-title">{panelTitle}</h2>
          </div>
          <div className="context-agent-header-actions">
            {!runId && view === "compose" && <button type="button" className="context-agent-icon-button" aria-label={`聊过的事，${threads.length} 个话题`} title="聊过的事" onClick={() => showHistory()}><Icon name="history" size={17} /></button>}
            {!runId && view === "history" && <button type="button" className="context-agent-icon-button" aria-label="开始新话题" title="开始新话题" onClick={startNewQuestion}><Icon name="plus" size={18} /></button>}
            <button type="button" className="context-agent-icon-button" aria-label="关闭对话窗口" onClick={closeDock}><Icon name="close" size={17} /></button>
          </div>
        </header>
        {!runId && view === "compose" && <div className="context-agent-context-chip"><span>{mode === "validate" ? "检查" : collaborationModes[mode].short}</span><b>{attachedContext ? attachedContext.title : context.title}</b><i aria-hidden="true" /><small>{vault?.name || context.scope}</small></div>}
        {runId ? <ContextualRunPanel runId={runId} revision={revision} runList={runList || []} onRunId={setRunId} onNew={startNewQuestion} /> : view === "history" ? <AgentHistory threads={threads} loading={runsLoading} error={runsError} knowledgeBaseName={vault?.name} onOpen={setRunId} onNew={startNewQuestion} /> : <form className="context-agent-compose" onSubmit={submit}>
          <div className={`context-agent-compose-body${draft ? " has-draft" : ""}`}>
            {outputTarget?.kind === "letter-version" && <div className="context-output-target"><Icon name="library" size={15} /><div><b>将保留为「{outputTarget.label}」</b><span>完成后会成为这封回信的最新版本，原始回信仍可随时切换查看。</span></div></div>}
            {outputTarget?.kind === "journey-report" && <div className="context-output-target is-journey"><Icon name="receipt" size={15} /><div><b>只更新「{outputTarget.label}」</b><span>会查阅已有 Wiki 帮你理解线索，但这段对话不会构建或修改 Wiki。</span></div></div>}
            {mode === "validate" ? <div className="context-validate-summary"><span className="context-agent-empty-glyph"><Icon name="check" size={20} /></span><b>检查当前知识库</b><p>运行既有标签、链接与结构检查，不生成新的知识内容。</p></div> : <>
              <div className="context-agent-empty-state"><span className="context-agent-empty-glyph"><Icon name="spark" size={19} /></span><b>从这页真正想说的事开始</b><p>我已经带上了这页的上下文。说说你想聊、补充或整理什么，我会判断接下来怎么做。</p></div>
              {!attachedContext && context.suggestions.length > 0 && <div className="context-suggestions" aria-label="建议问题">{context.suggestions.slice(0, 3).map((suggestion) => <button key={suggestion} type="button" onClick={() => { setDraft(suggestion); setMode(resolveComposerMode(context.defaultMode, context.defaultOutputTarget)); setOutputTarget(context.defaultOutputTarget); setSourceContext(context.defaultSourceContext); window.setTimeout(() => textareaRef.current?.focus(), 0); }}>{suggestion}</button>)}</div>}
            </>}
          </div>
          <div className="context-agent-composer">
            {attachedContext && <details className="context-agent-attached-context">
              <summary><span>{attachedContext.title}</span><Icon name="down" size={15} /></summary>
              <div>
                <p><b>已有理解</b><span>{attachedContext.currentUnderstanding}</span></p>
                <p><b>为什么值得聊</b><span>{attachedContext.reason}</span></p>
              </div>
            </details>}
            <div className={`context-composer-shell${mode === "validate" ? " validate" : ""}`}>
              {mode === "validate" ? <span>运行标签、链接与结构检查</span> : <textarea ref={textareaRef} id={`context-prompt-${context.pageId || context.scope}`} name="context-prompt" autoComplete="off" value={draft} onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }} onKeyDown={submitAgentFormOnEnter} placeholder={attachedContext ? "我已经带上了这页的上下文，说说你想聊、补充或整理什么" : "想从哪里开始？"} rows={1} />}
              {mode !== "validate" && <details className="context-agent-options">
                <summary aria-label="AI 设置" title="AI 设置"><Icon name="controls" size={16} /></summary>
                <div className="context-agent-settings-popover"><AiConfiguration id={`context-ai-${context.pageId || context.scope}`} agent={agent} /></div>
              </details>}
              <button type="submit" className="context-agent-send" disabled={submitDisabled} aria-label={submitting ? "正在开始" : collaborationModes[mode].action} title={submitting ? "正在开始…" : collaborationModes[mode].action}><Icon name="up" size={16} /></button>
            </div>
            <p className="context-agent-boundary">{outputTarget?.kind === "journey-report" ? "Wiki 仅检索；本轮只更新消费旅程报告" : collaborationModes[mode].boundary}</p>
            {error && <p className="context-agent-error" role="alert">{error}</p>}
            {!vaultLoading && !vault?.agentAvailable && <p className="context-agent-offline">暂时无法开始对话；安装 Codex 或配置 Pi 模型后即可使用。</p>}
          </div>
        </form>}
      </aside>
    </div>}
  </>;
}

function AgentHistory({ threads, loading, error, knowledgeBaseName, onOpen, onNew }: { threads: AgentThread[]; loading: boolean; error?: string; knowledgeBaseName?: string; onOpen: (id: string) => void; onNew: () => void }) {
  return <section className="context-agent-history">
    <p className="context-history-scope">{knowledgeBaseName ? `这些对话只留在「${knowledgeBaseName}」。` : "这里只显示当前个人空间里的对话。"}</p>
    {loading ? <Loading label="正在整理对话历史" /> : error ? <div className="context-history-empty"><b>暂时无法读取对话历史</b><p>{error}</p></div> : threads.length ? <div className="context-history-list">{threads.map((thread) => {
      const answer = runFinalAnswer(thread.latest);
      return <button type="button" key={thread.id} onClick={() => onOpen(thread.latest.id)}>
        <span className="context-history-meta"><RunStatus status={thread.latest.status} /><time>{new Date(thread.latest.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span>
        <b>{runDisplayPrompt(thread.runs[0]!)}</b>
        <p>{plainPreview(answer, thread.latest.error || (thread.latest.status === "completed" ? "已完成，打开查看回答" : "任务仍在进行"))}</p>
        <small>{thread.latest.outputTarget?.kind === "letter-version" ? thread.latest.outputTarget.label : collaborationModes[thread.latest.mode].short}{thread.runs.length > 1 ? ` · ${thread.runs.length} 轮对话` : ""}</small>
      </button>;
    })}</div> : <div className="context-history-empty"><b>我们还没有聊过</b><p>从现在真正想说的事开始，这段对话会留在这里。</p><button type="button" onClick={onNew}>开始聊聊</button></div>}
  </section>;
}

function ContextualRunPanel({ runId, revision, runList, onRunId, onNew }: { runId: string; revision: number; runList: WikiRun[]; onRunId: (id: string) => void; onNew: () => void }) {
  const { data: run, loading, error } = useApi<WikiRun>(`/api/runs/${runId}`, revision);
  const returnContext = useReturnContext();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [detailView, setDetailView] = useState<RunDetailView>("changes");
  const statusRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (loading || !run) return;
    const frame = window.requestAnimationFrame(() => {
      statusRef.current?.focus({ preventScroll: true });
      statusRef.current?.scrollTo({ top: statusRef.current.scrollHeight });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [runId, loading]);
  useLayoutEffect(() => resizeComposerTextarea(replyTextareaRef.current), [reply]);
  if (loading && !run) return <Loading label="正在接入知识上下文" />;
  if (error || !run) return <div className="context-run-error"><p>{error || "这次对话没有找到。"}</p><button onClick={() => onRunId("")}>返回对话历史</button></div>;
  const activeRun = run;
  const conversation = runConversation(activeRun);
  const technicalEvents = runTechnicalEvents(activeRun);
  const active = ["preparing", "running", "waiting-approval", "validating"].includes(activeRun.status);
  const hasFailed = activeRun.status === "failed" || activeRun.status === "interrupted";
  const isJourneyConversation = activeRun.outputTarget?.kind === "journey-report" || activeRun.sourceContext?.flow === "dialogue";
  const legacyJourneyConversation = isJourneyConversation && activeRun.outputTarget?.kind !== "journey-report";
  const mayWrite = activeRun.mode === "write" || activeRun.mode === "auto";
  const latest = conversation.at(-1)?.message;
  const storedThreadRuns = activeRun.runtimeSessionId ? runList.filter((candidate) => candidate.runtimeSessionId === activeRun.runtimeSessionId) : [];
  const threadRuns = [...storedThreadRuns.filter((candidate) => candidate.id !== activeRun.id), activeRun]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const detailViews: RunDetailView[] = [mayWrite ? "changes" : undefined, activeRun.validation ? "validation" : undefined, "technical"].filter((value): value is RunDetailView => Boolean(value));
  const visibleDetailView = detailViews.includes(detailView) ? detailView : detailViews[0]!;

  async function approve(requestId: string | number, decision: AgentApprovalDecision) {
    setActionError("");
    try {
      await api(`/api/runs/${activeRun.id}/approval`, { method: "POST", body: JSON.stringify({ requestId, decision }) });
    } catch (reason: any) {
      setActionError(reason.message);
    }
  }

  async function interrupt() {
    setActionError("");
    try {
      await api(`/api/runs/${activeRun.id}/interrupt`, { method: "POST" });
    } catch (reason: any) {
      setActionError(reason.message);
    }
  }

  async function followUp(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    if (active && legacyJourneyConversation) {
      setActionError("这段旧对话仍在按原流程运行；等本轮结束后再继续，下一轮就会切换为只更新消费旅程报告。");
      return;
    }
    setSending(true);
    setActionError("");
    try {
      if (active && activeRun.status !== "validating") {
        await api(`/api/runs/${activeRun.id}/steer`, { method: "POST", body: JSON.stringify({ prompt: reply }) });
      } else {
        const legacyJourneyTarget = activeRun.sourceContext?.flow === "dialogue" && activeRun.outputTarget?.kind !== "journey-report"
          ? { kind: "journey-report" as const, importId: activeRun.sourceContext.importId, storedPath: activeRun.sourceContext.storedPath, label: "消费旅程报告" }
          : undefined;
        const next = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({
          mode: legacyJourneyTarget ? "read" : activeRun.mode,
          prompt: reply,
          displayPrompt: reply,
          runtimeId: activeRun.runtimeId,
          model: activeRun.model,
          effort: activeRun.effort,
          title: legacyJourneyTarget ? "继续丰富消费旅程" : `继续${collaborationModes[activeRun.mode].short}`,
          sessionId: activeRun.runtimeSessionId,
          outputTarget: legacyJourneyTarget,
          sourceContext: legacyJourneyTarget ? { ...activeRun.sourceContext, operation: "enrich" } : undefined,
        }) });
        onRunId(next.id);
      }
      setReply("");
    } catch (reason: any) {
      setActionError(reason.message);
    } finally {
      setSending(false);
    }
  }

  const taskDetails = (mayWrite || activeRun.validation || technicalEvents.length > 0) && <details className="context-run-details">
    <summary><span><b>任务详情</b> · {activeRun.changes.length ? `${activeRun.changes.length} 个文件变化` : activeRun.validation ? `${activeRun.validation.filter((item) => item.exitCode === 0).length}/${activeRun.validation.length} 项检查通过` : `${technicalEvents.length} 条技术记录`}</span><span>展开</span><Icon name="down" size={14} /></summary>
    <div className="context-run-detail-body">
      <div className="context-run-detail-tabs" aria-label="任务详情分类">{detailViews.map((item) => <button key={item} type="button" className={visibleDetailView === item ? "active" : ""} aria-pressed={visibleDetailView === item} onClick={() => setDetailView(item)}>{item === "changes" ? "改动" : item === "validation" ? "检查" : "技术记录"}</button>)}</div>
      <dl><div><dt>目的</dt><dd>{collaborationModes[activeRun.mode].short}</dd></div><div><dt>模型</dt><dd>{activeRun.model || defaultAgentModel} · {reasoningLabels[activeRun.effort || defaultAgentEffort]}</dd></div><div><dt>开始</dt><dd>{new Date(activeRun.createdAt).toLocaleString("zh-CN")}</dd></div></dl>
      {visibleDetailView === "changes" && <section><h3>实际改动</h3>{activeRun.recoveredFromLegacyWorkspace ? <p>这条历史记录已从旧工作区恢复，旧快照差异不再重新计算。</p> : activeRun.changes.length ? <div className="context-change-list">{activeRun.changes.map((change) => <details key={change.path}><summary><span className={`change-kind ${change.kind}`}>{change.kind === "added" ? "新增" : change.kind === "modified" ? "修改" : "删除"}</span>{change.path}</summary><pre>{change.diff || "无文本差异"}</pre></details>)}</div> : <p>{active ? "完成后会列出本次独立差异。" : "这次没有产生文件变化。"}</p>}</section>}
      {visibleDetailView === "validation" && activeRun.validation && <section><h3>质量检查</h3><div className="context-validation-list">{activeRun.validation.map((item, index) => <details key={index}><summary className={item.exitCode === 0 ? "passed" : "failed"}>{item.exitCode === 0 ? "通过" : "失败"} · {item.command.at(-1)}</summary><pre>{item.output}</pre></details>)}</div></section>}
      {visibleDetailView === "technical" && <section><h3>技术记录</h3>{technicalEvents.length ? <div className="context-technical-list">{technicalEvents.map((event) => <div key={event.id}><time>{new Date(event.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time><p>{event.message || event.method || event.kind}</p></div>)}</div> : <p>暂无技术记录。</p>}</section>}
    </div>
  </details>;

  return <div className="context-run">
    <div ref={statusRef} tabIndex={-1} className="context-run-body">
      {activeRun.outputTarget?.kind === "letter-version" && <div className={`context-run-artifact ${activeRun.status === "completed" ? "saved" : "pending"}`}><Icon name={activeRun.status === "completed" ? "library" : "spark"} size={15} /><div><b>{activeRun.status === "completed" ? `已保留为「${activeRun.outputTarget.label}」` : `完成后将保留为「${activeRun.outputTarget.label}」`}</b><span>{activeRun.status === "completed" ? "关闭窗口后，回信页会默认显示这个最新版本。" : "原始回信不会被覆盖，完成后可在回信页切换版本。"}</span></div></div>}
      {legacyJourneyConversation && <div className="context-run-artifact journey pending"><Icon name="receipt" size={15} /><div><b>继续聊聊会先丰富消费旅程报告</b><span>这是一段旧对话。下一段讲述开始只查阅 Wiki、更新报告；需要构建时再由你明确选择。</span></div></div>}
      <div className="context-thread" aria-label="对话内容">{threadRuns.map((threadRun) => {
      const answer = runFinalAnswer(threadRun);
      const isCurrent = threadRun.id === activeRun.id;
      return <section className="context-thread-turn" key={threadRun.id}>
        <div className="context-user-message"><p>{runDisplayPrompt(threadRun)}</p></div>
        <div className="context-message-meta"><RunStatus status={threadRun.status} /><time>{new Date(threadRun.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
        {isCurrent && taskDetails}
        {answer ? <article className="context-run-answer"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => { const local = localWikiHref(href); return local ? <NavLink to={local} state={returnContext}>{children}</NavLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>; } }}>{answer}</ReactMarkdown></article> : isCurrent && active ? <section className="context-run-working" aria-live="polite"><span className="working-mark"><i /><i /><i /></span><div><b>{run.status === "waiting-approval" ? "需要你确认后继续" : run.status === "validating" ? "正在检查知识库" : "正在沿着你的来路慢慢梳理"}</b><p>{latest || "你可以关闭窗口，我会继续；稍后从聊过的事里回来即可。"}</p></div></section> : <div className="context-run-missing"><b>{threadRun.error ? "这次没有顺利完成" : "这轮没有留下可读回答"}</b><p>{threadRun.error || "可以在下方继续聊，或者把范围说得更具体一些。"}</p></div>}
      </section>;
      })}</div>
      {activeRun.approvals.map((approval) => <section className="context-approval-box" key={String(approval.requestId)} aria-live="polite"><span>需要你确认</span><h3>{approval.title}</h3><p>{approval.detail || String(approval.params?.reason || approval.params?.command || approval.method || approval.operation)}</p><small>允许只对这一次请求生效；拒绝后会保留现状。</small><div><button type="button" onClick={() => approve(approval.requestId, "deny")}>先不要</button><button type="button" className="primary-action" onClick={() => approve(approval.requestId, "allow-once")}>允许一次</button></div></section>)}
      {active && activeRun.status !== "validating" && <button type="button" className="context-stop-run" onClick={interrupt}>停止这次任务</button>}
      {actionError && <p className="context-agent-error" role="alert">{actionError}</p>}
      {hasFailed && <button type="button" className="context-retry-run" onClick={onNew}>带着新问题重新开始</button>}
    </div>
    {activeRun.mode !== "validate" && <form className={`context-run-reply${isJourneyConversation ? " is-journey" : ""}`} onSubmit={followUp}>{isJourneyConversation ? <header className="context-journey-reply-heading"><b>继续聊聊，丰富旅程</b><span>你的下一段讲述只会更新报告，不会构建 Wiki。</span></header> : null}<label className="sr-only" htmlFor={`context-run-reply-${run.id}`}>{active ? "再补充一句" : "沿着这件事继续聊"}</label><div className="context-composer-shell"><textarea ref={replyTextareaRef} id={`context-run-reply-${run.id}`} name="context-run-reply" autoComplete="off" value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={submitAgentFormOnEnter} placeholder={active && legacyJourneyConversation ? "本轮结束后即可按新流程继续…" : isJourneyConversation ? "补充人物、动机、当时的感受，或告诉我哪里需要修正…" : active ? "补充范围、来路，或者告诉我希望避开什么…" : "接着说，或者提出新的要求"} rows={1} disabled={active && legacyJourneyConversation} /><button type="submit" className="context-agent-send" disabled={sending || !reply.trim() || active && legacyJourneyConversation} aria-label={sending ? "正在发送" : active ? "补充一句" : "继续聊聊"}><Icon name="up" size={16} /></button></div></form>}
  </div>;
}

function RunStatus({ status }: { status: WikiRun["status"] }) {
  const labels: Record<WikiRun["status"], string> = {
    preparing: "准备中", running: "运行中", "waiting-approval": "等待确认", validating: "正在验证", completed: "已完成", failed: "失败", interrupted: "已停止",
  };
  return <span className={`run-status ${status}`}><i />{labels[status]}</span>;
}
