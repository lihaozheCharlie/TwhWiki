import React, { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentApprovalDecision, AgentOutputTarget, AgentReasoningEffort, VaultInfo, WikiRun } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { useReturnContext } from "../../shared/routing";
import { Icon, Loading } from "../../shared/ui";
import { AiConfiguration, reasoningLabels, useAgentSelection } from "./AgentSettings";
import { localWikiHref } from "./local-page-link";
import { collaborationModes, contextPrompt, groupAgentThreads, plainPreview, runConversation, runDisplayPrompt, runFinalAnswer, runTechnicalEvents, shouldSubmitAgentInput, type AgentContext, type AgentThread, type OpenContextAgentRequest } from "./model";

const defaultAgentModel = "gpt-5.6-sol";
const defaultAgentEffort: AgentReasoningEffort = "high";
type DockView = "compose" | "history";

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
  const [runId, setRunId] = useState("");
  const [mode, setMode] = useState<WikiRun["mode"]>(context.defaultMode || "read");
  const [outputTarget, setOutputTarget] = useState<AgentOutputTarget>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const threads = groupAgentThreads(runList || []);

  useEffect(() => {
    const openDock = (event: Event) => {
      const request = (event as CustomEvent<OpenContextAgentRequest>).detail || {};
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
      if (request.prompt !== undefined) setDraft(request.prompt);
      setMode(request.mode || context.defaultMode || "read");
      setOutputTarget(request.outputTarget);
    };
    window.addEventListener("open-context-agent", openDock);
    return () => window.removeEventListener("open-context-agent", openDock);
  }, [context.defaultMode]);

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

  useEffect(() => {
    setDraft("");
    setRunId("");
    setMode(context.defaultMode || "read");
    setOutputTarget(undefined);
    setView("compose");
    setError("");
  }, [context.defaultMode, context.pageId, context.title]);

  function startNewQuestion() {
    setRunId("");
    setView("compose");
    setDraft("");
    setMode(context.defaultMode || "read");
    setOutputTarget(undefined);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode !== "validate" && !draft.trim()) {
      setError("先写下你想从哪里开始。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const selection = mode === "validate" ? undefined : await agent.save();
      const request = mode === "validate" ? draft.trim() || "运行当前知识库的质量检查。" : draft.trim();
      const run = await api<WikiRun>("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          mode,
          prompt: mode === "validate" ? request : contextPrompt(context, request),
          displayPrompt: request,
          runtimeId: selection?.runtimeId,
          model: selection?.model,
          effort: selection?.effort,
          title: mode === "validate" ? "知识健康检查" : `处理：${context.title}`,
          outputTarget,
        }),
      });
      setRunId(run.id);
      setView("history");
      setDraft("");
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    {!open && <button ref={launcherRef} className={`context-agent-launcher${context.compactLauncher ? " compact" : ""}`} title={context.launcherLabel || "找我聊聊"} onClick={() => { openerRef.current = launcherRef.current; setOpen(true); }} aria-label={`${context.launcherLabel || "找我聊聊"}，已带入当前页面`}><Icon name="spark" size={16} />{!context.compactLauncher && <b>{context.launcherLabel || "找我聊聊"}</b>}</button>}
    {open && <div className="context-agent-layer">
      <button className="context-agent-backdrop" aria-label="关闭对话窗口" onClick={() => setOpen(false)} />
      <aside ref={panelRef} className="context-agent-panel" role="dialog" aria-modal="true" aria-labelledby="context-agent-title">
        <header className="context-agent-header"><div><h2 id="context-agent-title">一起往下想</h2><p><span>{vault?.name || context.scope}</span><i aria-hidden="true">·</i>{context.title}</p></div><button className="icon-button" aria-label="关闭对话窗口" onClick={() => setOpen(false)}><Icon name="close" /></button></header>
        <nav className="context-agent-nav" aria-label="对话窗口">
          <button type="button" aria-pressed={!runId && view === "compose"} className={!runId && view === "compose" ? "active" : ""} onClick={startNewQuestion}><Icon name="spark" size={14} />新话题</button>
          <button type="button" aria-pressed={Boolean(runId) || view === "history"} className={runId || view === "history" ? "active" : ""} onClick={() => { setRunId(""); setView("history"); }}><Icon name="library" size={14} />聊过的事<span>{threads.length}</span></button>
        </nav>
        {runId ? <ContextualRunPanel runId={runId} revision={revision} runList={runList || []} onRunId={setRunId} onNew={startNewQuestion} /> : view === "history" ? <AgentHistory threads={threads} loading={runsLoading} error={runsError} knowledgeBaseName={vault?.name} onOpen={setRunId} onNew={startNewQuestion} /> : <form className="context-agent-compose" onSubmit={submit}>
          <section className="context-current-context"><span>已带入当前页面</span><b>{context.title}</b><small>{context.scope}</small>{context.summary && <p>{context.summary}</p>}</section>
          {outputTarget?.kind === "letter-version" && <div className="context-output-target"><Icon name="library" size={15} /><div><b>将保留为「{outputTarget.label}」</b><span>完成后会成为这封回信的最新版本，原始回信仍可随时切换查看。</span></div></div>}
          <label htmlFor={`context-prompt-${context.pageId || context.scope}`}>想从哪里开始？</label>
          {mode === "validate" ? <div className="context-validate-summary"><b>检查当前知识库</b><p>运行既有标签、链接与结构检查，不生成新的知识内容。</p></div> : <>
            <textarea ref={textareaRef} id={`context-prompt-${context.pageId || context.scope}`} name="context-prompt" autoComplete="off" value={draft} onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }} onKeyDown={submitAgentFormOnEnter} placeholder={collaborationModes[mode].placeholder} />
            <div className="context-suggestions"><span>可以这样开始</span>{context.suggestions.slice(0, 2).map((suggestion) => <button key={suggestion} type="button" onClick={() => { setDraft(suggestion); setMode(context.defaultMode || "read"); setOutputTarget(undefined); }}>{suggestion}</button>)}</div>
          </>}
          {mode !== "validate" && <details className="context-agent-options">
            <summary><span>AI 设置</span><b>{agent.runtimeId === "codex" ? "Codex" : agent.providerDisplayName} · {reasoningLabels[agent.effort]}</b><Icon name="down" size={14} /></summary>
            <AiConfiguration id={`context-ai-${context.pageId || context.scope}`} agent={agent} />
          </details>}
          <p className="context-agent-boundary">{collaborationModes[mode].boundary}</p>
          {error && <p className="context-agent-error" role="alert">{error}</p>}
          <button className="primary-action context-agent-submit" disabled={submitting || (mode !== "validate" && !draft.trim()) || vaultLoading || (mode !== "validate" && agent.loading) || !vault?.agentAvailable}>{submitting ? "正在开始…" : vaultLoading || agent.loading ? "正在连接…" : collaborationModes[mode].action}<Icon name="arrow" size={16} /></button>
          {!vaultLoading && !vault?.agentAvailable && <p className="context-agent-offline">暂时无法开始对话；安装 Codex 或配置 Pi 模型后即可使用。</p>}
        </form>}
      </aside>
    </div>}
  </>;
}

function AgentHistory({ threads, loading, error, knowledgeBaseName, onOpen, onNew }: { threads: AgentThread[]; loading: boolean; error?: string; knowledgeBaseName?: string; onOpen: (id: string) => void; onNew: () => void }) {
  return <section className="context-agent-history">
    <header><h3>我们聊过的事</h3><p>{knowledgeBaseName ? `这些对话只留在「${knowledgeBaseName}」。` : "这里只显示当前个人空间里的对话。"}</p></header>
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
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && run) statusRef.current?.focus();
  }, [runId, loading]);
  if (loading && !run) return <Loading label="正在接入知识上下文" />;
  if (error || !run) return <div className="context-run-error"><p>{error || "这次对话没有找到。"}</p><button onClick={() => onRunId("")}>返回对话历史</button></div>;
  const activeRun = run;
  const conversation = runConversation(activeRun);
  const technicalEvents = runTechnicalEvents(activeRun);
  const active = ["preparing", "running", "waiting-approval", "validating"].includes(activeRun.status);
  const hasFailed = activeRun.status === "failed" || activeRun.status === "interrupted";
  const mayWrite = activeRun.mode === "write" || activeRun.mode === "auto";
  const latest = conversation.at(-1)?.message;
  const storedThreadRuns = activeRun.runtimeSessionId ? runList.filter((candidate) => candidate.runtimeSessionId === activeRun.runtimeSessionId) : [];
  const threadRuns = [...storedThreadRuns.filter((candidate) => candidate.id !== activeRun.id), activeRun]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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
    setSending(true);
    setActionError("");
    try {
      if (active && activeRun.status !== "validating") {
        await api(`/api/runs/${activeRun.id}/steer`, { method: "POST", body: JSON.stringify({ prompt: reply }) });
      } else {
        const next = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({ mode: activeRun.mode, prompt: reply, displayPrompt: reply, runtimeId: activeRun.runtimeId, model: activeRun.model, effort: activeRun.effort, title: `继续${collaborationModes[activeRun.mode].short}`, sessionId: activeRun.runtimeSessionId }) });
        onRunId(next.id);
      }
      setReply("");
    } catch (reason: any) {
      setActionError(reason.message);
    } finally {
      setSending(false);
    }
  }

  return <div className="context-run">
    <button type="button" className="context-run-back" onClick={() => onRunId("")}><Icon name="back" size={14} />返回对话历史</button>
    <div ref={statusRef} tabIndex={-1} className="context-run-status"><RunStatus status={run.status} /><span>{collaborationModes[run.mode].boundary}</span></div>
    {activeRun.outputTarget?.kind === "letter-version" && <div className={`context-run-artifact ${activeRun.status === "completed" ? "saved" : "pending"}`}><Icon name={activeRun.status === "completed" ? "library" : "spark"} size={15} /><div><b>{activeRun.status === "completed" ? `已保留为「${activeRun.outputTarget.label}」` : `完成后将保留为「${activeRun.outputTarget.label}」`}</b><span>{activeRun.status === "completed" ? "关闭窗口后，回信页会默认显示这个最新版本。" : "原始回信不会被覆盖，完成后可在回信页切换版本。"}</span></div></div>}
    <div className="context-thread" aria-label="对话内容">{threadRuns.map((threadRun) => {
      const answer = runFinalAnswer(threadRun);
      const isCurrent = threadRun.id === activeRun.id;
      return <section className="context-thread-turn" key={threadRun.id}>
        <div className="context-user-message"><span>你</span><p>{runDisplayPrompt(threadRun)}</p><time>{new Date(threadRun.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
        {answer ? <article className="context-run-answer"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => { const local = localWikiHref(href); return local ? <NavLink to={local} state={returnContext}>{children}</NavLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>; } }}>{answer}</ReactMarkdown></article> : isCurrent && active ? <section className="context-run-working" aria-live="polite"><span className="working-mark"><i /><i /><i /></span><div><b>{run.status === "waiting-approval" ? "需要你确认后继续" : run.status === "validating" ? "正在检查知识库" : "正在沿着你的来路慢慢梳理"}</b><p>{latest || "你可以关闭窗口，我会继续；稍后从聊过的事里回来即可。"}</p></div></section> : <div className="context-run-missing"><b>{threadRun.error ? "这次没有顺利完成" : "这轮没有留下可读回答"}</b><p>{threadRun.error || "可以在下方继续聊，或者把范围说得更具体一些。"}</p></div>}
      </section>;
    })}</div>
    {activeRun.approvals.map((approval) => <section className="context-approval-box" key={String(approval.requestId)} aria-live="polite"><span>需要你决定</span><h3>{approval.title}</h3><p>{approval.detail || String(approval.params?.reason || approval.params?.command || approval.method || approval.operation)}</p><small>允许只对这一次请求生效；拒绝后会保留现状。</small><div><button type="button" onClick={() => approve(approval.requestId, "deny")}>拒绝这一步</button><button type="button" className="primary-action" onClick={() => approve(approval.requestId, "allow-once")}>允许一次</button></div></section>)}
    {(mayWrite || activeRun.validation || technicalEvents.length > 0) && <details className="context-run-details">
      <summary>任务详情 <span>{activeRun.changes.length ? `${activeRun.changes.length} 个文件变化` : activeRun.validation ? `${activeRun.validation.filter((item) => item.exitCode === 0).length}/${activeRun.validation.length} 项检查通过` : `${technicalEvents.length} 条技术记录`}</span><Icon name="down" size={14} /></summary>
      <dl><div><dt>目的</dt><dd>{collaborationModes[activeRun.mode].short}</dd></div><div><dt>模型</dt><dd>{activeRun.model || defaultAgentModel} · {reasoningLabels[activeRun.effort || defaultAgentEffort]}</dd></div><div><dt>开始</dt><dd>{new Date(activeRun.createdAt).toLocaleString("zh-CN")}</dd></div></dl>
      {mayWrite && <section><h3>实际改动</h3>{activeRun.recoveredFromLegacyWorkspace ? <p>这条历史记录已从旧工作区恢复，旧快照差异不再重新计算。</p> : activeRun.changes.length ? <div className="context-change-list">{activeRun.changes.map((change) => <details key={change.path}><summary><span className={`change-kind ${change.kind}`}>{change.kind === "added" ? "新增" : change.kind === "modified" ? "修改" : "删除"}</span>{change.path}</summary><pre>{change.diff || "无文本差异"}</pre></details>)}</div> : <p>{active ? "完成后会列出本次独立差异。" : "这次没有产生文件变化。"}</p>}</section>}
      {activeRun.validation && <section><h3>质量检查</h3><div className="context-validation-list">{activeRun.validation.map((item, index) => <details key={index}><summary className={item.exitCode === 0 ? "passed" : "failed"}>{item.exitCode === 0 ? "通过" : "失败"} · {item.command.at(-1)}</summary><pre>{item.output}</pre></details>)}</div></section>}
      <section><h3>技术记录</h3>{technicalEvents.length ? <div className="context-technical-list">{technicalEvents.map((event) => <div key={event.id}><time>{new Date(event.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time><p>{event.message || event.method || event.kind}</p></div>)}</div> : <p>暂无技术记录。</p>}</section>
    </details>}
    {active && activeRun.status !== "validating" && <button type="button" className="context-stop-run" onClick={interrupt}>停止这次任务</button>}
    {activeRun.mode !== "validate" && <form className="context-run-reply" onSubmit={followUp}><label htmlFor={`context-run-reply-${run.id}`}>{active ? "再补充一句" : "沿着这件事继续聊"}</label><textarea id={`context-run-reply-${run.id}`} name="context-run-reply" autoComplete="off" value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={submitAgentFormOnEnter} placeholder={active ? "补充范围、来路，或者告诉我希望避开什么…" : "继续说说，或者补充一段新的经历…"} /><button className="primary-action" disabled={sending || !reply.trim()}>{sending ? "正在发送…" : active ? "补充一句" : activeRun.mode === "write" ? "再次授权并继续" : "继续聊聊"}</button></form>}
    {actionError && <p className="context-agent-error" role="alert">{actionError}</p>}
    {hasFailed && <button type="button" className="context-retry-run" onClick={onNew}>带着新问题重新开始</button>}
  </div>;
}

function RunStatus({ status }: { status: WikiRun["status"] }) {
  const labels: Record<WikiRun["status"], string> = {
    preparing: "准备中", running: "运行中", "waiting-approval": "等待确认", validating: "正在验证", completed: "已完成", failed: "失败", interrupted: "已停止",
  };
  return <span className={`run-status ${status}`}><i />{labels[status]}</span>;
}
