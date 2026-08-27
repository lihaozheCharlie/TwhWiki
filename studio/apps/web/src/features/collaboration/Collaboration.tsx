import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentApprovalDecision, AgentReasoningEffort, TodayView, VaultInfo, WikiRun } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { graphCategoryNames, type ReturnContext } from "../../app/config";
import { MarkdownBody } from "../../shared/markdown";
import { pageHref, useReturnContext } from "../../shared/routing";
import { Empty, Icon, Loading, PageHeader } from "../../shared/ui";
import { AiConfiguration, reasoningLabels, useAgentSelection } from "./AgentSettings";
import { collaborationModes, contextPrompt, plainPreview, runConversation, runDisplayPrompt, runFinalAnswer, runTechnicalEvents, type AgentContext } from "./model";

const defaultAgentModel = "gpt-5.6-sol";
const defaultAgentEffort: AgentReasoningEffort = "high";
const workbenchModes = ["read", "write", "validate"] as const;

function localWikiHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("/page/")) return href;
  try {
    const decoded = decodeURIComponent(href);
    const marker = "/vault/wiki/";
    const index = decoded.indexOf(marker);
    if (index < 0 || !decoded.endsWith(".md")) return undefined;
    return pageHref(`wiki/${decoded.slice(index + marker.length, -3)}`);
  } catch {
    return undefined;
  }
}

export function ContextualAgentDock({ revision, context }: { revision: number; context: AgentContext }) {
  const { data: vault, loading: vaultLoading } = useApi<VaultInfo>("/api/vault", revision);
  const agent = useAgentSelection(revision);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [runId, setRunId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const openDock = () => setOpen(true);
    window.addEventListener("open-context-agent", openDock);
    return () => window.removeEventListener("open-context-agent", openDock);
  }, []);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) launcherRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    const manageKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
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
  }, [open, runId]);

  useEffect(() => {
    setDraft("");
    setRunId("");
    setError("");
  }, [context.pageId, context.title]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) {
      setError("先说说你想让 Agent 做什么。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const selection = await agent.save();
      const run = await api<WikiRun>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ mode: "auto", prompt: contextPrompt(context, draft), displayPrompt: draft, runtimeId: selection.runtimeId, model: selection.model, effort: selection.effort, title: `处理：${context.title}` }),
      });
      setRunId(run.id);
      setDraft("");
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    {!open && <button ref={launcherRef} className="context-agent-launcher" onClick={() => setOpen(true)} aria-label={`${context.launcherLabel || "和知识助手处理这里"}，已带入当前页面`}><Icon name="spark" size={16} /><b>{context.launcherLabel || "和知识助手处理这里"}</b></button>}
    {open && <div className="context-agent-layer">
      <button className="context-agent-backdrop" aria-label="关闭页面共创" onClick={() => setOpen(false)} />
      <aside ref={panelRef} className="context-agent-panel" role="dialog" aria-modal="true" aria-labelledby="context-agent-title">
        <header className="context-agent-header"><div><h2 id="context-agent-title">{context.launcherLabel || "询问当前内容"}</h2><p><span>{context.scope}</span><i aria-hidden="true">·</i>{context.title}</p></div><button className="icon-button" aria-label="关闭页面共创" onClick={() => setOpen(false)}><Icon name="close" /></button></header>
        {runId ? <ContextualRunPanel runId={runId} revision={revision} context={context} onRunId={setRunId} /> : <form className="context-agent-compose" onSubmit={submit}>
          <label htmlFor={`context-prompt-${context.pageId || context.scope}`}>想让 Agent 做什么？</label>
          <textarea ref={textareaRef} id={`context-prompt-${context.pageId || context.scope}`} name="context-prompt" autoComplete="off" value={draft} onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }} placeholder="问一个问题，或说说希望补充、整理、更新什么…" />
          <div className="context-suggestions"><span>可以这样开始</span>{context.suggestions.slice(0, 2).map((suggestion) => <button key={suggestion} type="button" onClick={() => setDraft(suggestion)}>{suggestion}</button>)}</div>
          <details className="context-agent-options">
            <summary><span>AI 设置</span><b>{agent.runtimeId === "codex" ? "Codex" : agent.providerDisplayName} · {reasoningLabels[agent.effort]}</b><Icon name="down" size={14} /></summary>
            <AiConfiguration id={`context-ai-${context.pageId || context.scope}`} agent={agent} />
          </details>
          <p className="context-agent-boundary">Agent 会理解你的意图；只有明确要求修改时才会更新知识</p>
          {error && <p className="context-agent-error" role="alert">{error}</p>}
          <button className="primary-action context-agent-submit" disabled={submitting || !draft.trim() || vaultLoading || agent.loading || !vault?.agentAvailable}>{submitting ? "正在开始…" : vaultLoading || agent.loading ? "正在连接 Agent…" : "交给 Agent"}<Icon name="arrow" size={16} /></button>
          {!vaultLoading && !vault?.agentAvailable && <p className="context-agent-offline">没有可用的 Agent；安装 Codex 或配置 Pi 模型后即可使用。</p>}
        </form>}
      </aside>
    </div>}
  </>;
}

function ContextualRunPanel({ runId, revision, context, onRunId }: { runId: string; revision: number; context: AgentContext; onRunId: (id: string) => void }) {
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
  if (error || !run) return <div className="context-run-error"><p>{error || "这次共创没有找到。"}</p><button onClick={() => onRunId("")}>重新开始</button></div>;
  const activeRun = run;
  const answer = runFinalAnswer(activeRun);
  const conversation = runConversation(activeRun);
  const active = ["preparing", "running", "waiting-approval", "validating"].includes(activeRun.status);
  const latest = conversation.at(-1)?.message;

  async function followUp(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setActionError("");
    try {
      if (active && activeRun.status !== "validating") {
        await api(`/api/runs/${activeRun.id}/steer`, { method: "POST", body: JSON.stringify({ prompt: contextPrompt(context, reply) }) });
      } else {
        const next = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({ mode: activeRun.mode, prompt: contextPrompt(context, reply), displayPrompt: reply, runtimeId: activeRun.runtimeId, model: activeRun.model, effort: activeRun.effort, title: `继续：${context.title}`, sessionId: activeRun.runtimeSessionId }) });
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
    <div ref={statusRef} tabIndex={-1} className="context-run-status"><RunStatus status={run.status} /><span>{collaborationModes[run.mode].boundary}</span></div>
    {answer ? <article className="context-run-answer"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => { const local = localWikiHref(href); return local ? <NavLink to={local} state={returnContext}>{children}</NavLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>; } }}>{answer}</ReactMarkdown></article> : <section className="context-run-working" aria-live="polite"><span className="working-mark"><i /><i /><i /></span><div><b>{run.status === "waiting-approval" ? "需要你确认后继续" : "知识助手正在沿着当前上下文工作"}</b><p>{latest || "它会读取对应页面、相关证据和构建规则，再形成结果。你可以关闭面板，任务仍会继续。"}</p></div></section>}
    {run.status === "waiting-approval" && <NavLink className="context-approval-link" to={`/workbench/${run.id}`}>打开完整记录并确认操作 <Icon name="arrow" size={15} /></NavLink>}
    {run.status === "completed" && run.changes.length > 0 && <div className="context-change-summary"><b>{run.changes.length} 个文件变化</b><span>{run.validation ? `${run.validation.filter((item) => item.exitCode === 0).length}/${run.validation.length} 项质量检查通过` : "质量检查结果请在完整记录中查看"}</span></div>}
    <form className="context-run-reply" onSubmit={followUp}><label htmlFor={`context-run-reply-${run.id}`}>{active ? "补充方向" : "沿着结果继续"}</label><textarea id={`context-run-reply-${run.id}`} name="context-run-reply" autoComplete="off" value={reply} onChange={(event) => setReply(event.target.value)} placeholder={active ? "补充范围、证据或希望避免的方向…" : "继续追问，或补充一段新材料…"} /><button className="primary-action" disabled={sending || !reply.trim()}>{sending ? "正在发送…" : active ? "补充给知识助手" : run.mode === "auto" ? "继续交给 Agent" : run.mode === "write" ? "再次授权并继续" : "继续询问"}</button></form>
    {actionError && <p className="context-agent-error" role="alert">{actionError}</p>}
    <div className="context-run-foot"><button onClick={() => onRunId("")}>开始新的问题</button><NavLink to={`/workbench/${run.id}`}>打开完整共创记录</NavLink></div>
  </div>;
}

export function Workbench({ revision }: { revision: number }) {
  const { data: runList, loading: runsLoading } = useApi<WikiRun[]>("/api/runs", revision);
  const { data: today } = useApi<TodayView>("/api/views/today", revision);
  const { data: vault } = useApi<VaultInfo>("/api/vault", revision);
  const agent = useAgentSelection(revision);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedMode = params.get("mode");
  const normalizedMode: WikiRun["mode"] = requestedMode === "write" || requestedMode === "validate" ? requestedMode : "read";
  const [mode, setMode] = useState<WikiRun["mode"]>(normalizedMode);
  const [prompt, setPrompt] = useState(params.get("prompt") || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const modeCopy = collaborationModes[mode];
  const activeRuns = (runList || []).filter((run) => ["preparing", "running", "waiting-approval", "validating"].includes(run.status));
  const history = (runList || []).filter((run) => !activeRuns.includes(run));
  const suggestions = mode === "read"
    ? [today?.guidingQuestion, "最近哪些旧模式又出现了？它们正在保护我什么？", "结合我的当前状态，我现在最值得继续追问的是什么？"].filter(Boolean) as string[]
    : ["摄取今天新增的日记，更新相关知识，并生成一封近况回信。", "把下面这段新想法沉淀到最合适的页面，并保留我的原话："];

  useEffect(() => {
    setMode(normalizedMode);
    setPrompt(params.get("prompt") || "");
    setError("");
  }, [normalizedMode, params]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode !== "validate" && !prompt.trim()) {
      setError(mode === "read" ? "先写下你真正想弄明白的问题。" : "请先提供要沉淀的材料或更新要求。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const selection = mode === "validate" ? undefined : await agent.save();
      const run = await api<WikiRun>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ mode, prompt, displayPrompt: prompt, runtimeId: selection?.runtimeId, model: selection?.model, effort: selection?.effort, title: mode === "write" ? "沉淀到知识" : mode === "read" ? "理解一个问题" : "知识健康检查" }),
      });
      navigate(`/workbench/${run.id}`);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  }

  function chooseMode(nextMode: WikiRun["mode"]) {
    setMode(nextMode);
    setPrompt("");
    setError("");
  }

  return (
    <div className="collaboration-home">
      <header className="collaboration-hero">
        <div>
          <h1>今天想和知识助手<br />一起做什么？</h1>
          <p>不是向一个陌生 AI 聊天，而是让 Agent 沿着你的真实材料与已有知识工作。你可以使用 Codex，也可以用自己配置的模型。</p>
        </div>
        <div className={`codex-presence ${vault?.agentAvailable ? "ready" : "offline"}`}><span />{vault?.agentAvailable ? `${vault.runtimes.filter((entry) => entry.available).map((entry) => entry.displayName).join(" / ")} 已就绪` : "Agent 暂不可用"}</div>
      </header>

      {activeRuns.length > 0 && <section className="active-collaborations" aria-label="正在进行的共创">
        <span>正在进行</span>
        {activeRuns.map((run) => <NavLink key={run.id} to={`/workbench/${run.id}`}><RunStatus status={run.status} /><b>{run.title}</b><Icon name="arrow" size={16} /></NavLink>)}
      </section>}

      <form className="collaboration-station" onSubmit={submit}>
        <div className="intent-selector" role="tablist" aria-label="选择共创目的">
          {workbenchModes.map((candidate) => {
            const item = collaborationModes[candidate];
            return <button key={candidate} type="button" role="tab" aria-selected={mode === candidate} className={mode === candidate ? "active" : ""} onClick={() => chooseMode(candidate)}><span>{item.short}</span><b>{item.title}</b><small>{item.boundary}</small></button>;
          })}
        </div>
        <section className={`collaboration-compose mode-${mode}`}>
          <div className="compose-heading"><div><h2>{modeCopy.title}</h2><p>{modeCopy.description}</p></div><span className="permission-badge">{mode === "write" ? "本次可写入" : "只读"}</span></div>
          {mode === "validate" ? (
            <div className="health-explainer"><div><b>链接与引用</b><span>检查缺失和歧义链接</span></div><div><b>标签与结构</b><span>确认自动标签已经稳定</span></div><div><b>结果可追溯</b><span>保留每项检查的完整输出</span></div></div>
          ) : <>
            <label htmlFor="collaboration-prompt">{mode === "read" ? "我想弄明白" : "这次要沉淀"}</label>
            <textarea id="collaboration-prompt" name="collaboration-prompt" autoComplete="off" value={prompt} onChange={(event) => { setPrompt(event.target.value); if (error) setError(""); }} placeholder={modeCopy.placeholder.replace(/[。.]$/, "…")} aria-describedby={error ? "collaboration-error" : "collaboration-boundary"} />
            <div className="prompt-suggestions" aria-label="可直接使用的开场"><span>不知道怎么开口？</span>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}</div>
            <AiConfiguration id="workbench-ai" agent={agent} />
          </>}
          <div className="collaboration-submit">
            <div><b id="collaboration-boundary">{modeCopy.boundary}</b><span>{mode === "write" ? "完成后会展示实际文件变化与质量检查。" : mode === "read" ? "回答会区分已有证据、已有判断与进一步推断。" : "检查失败时会说明问题和恢复方式。"}</span>{error && <em id="collaboration-error" role="alert">{error}</em>}</div>
            <button className="primary-action" disabled={submitting || (mode !== "validate" && (agent.loading || !vault?.agentAvailable))}>{submitting ? "正在建立共创…" : modeCopy.action}<Icon name="arrow" size={16} /></button>
          </div>
        </section>
      </form>

      <section className="collaboration-history">
        <div className="history-heading"><h2>最近共创</h2><p>重新打开回答、改动与检查结果，不必翻找技术日志。</p></div>
        {runsLoading ? <Loading label="正在整理共创记录" /> : history.length ? <div className="run-list">{history.map((run) => {
          const answer = runFinalAnswer(run);
          return <NavLink to={`/workbench/${run.id}`} key={run.id} className="run-row"><div className="run-kind">{collaborationModes[run.mode].short}</div><div><b>{runDisplayPrompt(run)}</b><p>{plainPreview(answer, run.error || (run.status === "completed" ? "已完成，打开查看结果" : "任务没有完成"))}</p></div><div><RunStatus status={run.status} /><time>{new Date(run.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div></NavLink>;
        })}</div> : <div className="collaboration-empty"><b>这里会留下你和知识助手共同完成的工作</b><p>从一个真实问题开始，会比从目录开始更容易看见这些知识的价值。</p></div>}
      </section>
    </div>
  );
}

export function RunDetail({ revision }: { revision: number }) {
  const { runId = "" } = useParams();
  const { data: run, loading, error: loadError } = useApi<WikiRun>(`/api/runs/${runId}`, revision);
  const navigate = useNavigate();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  if (loading) return <Loading label="正在打开共创记录" />;
  if (loadError || !run) return <div className="run-missing"><h1>这次共创没有找到</h1><p>{loadError || "记录可能已被移动。"}</p><NavLink to="/workbench">返回与知识共创</NavLink></div>;
  const activeRun = run;
  const modeCopy = collaborationModes[run.mode];
  const answer = runFinalAnswer(run);
  const conversation = runConversation(run);
  const technicalEvents = runTechnicalEvents(run);
  const isActive = ["preparing", "running", "waiting-approval", "validating"].includes(run.status);
  const hasFailed = run.status === "failed" || run.status === "interrupted";
  const mayWrite = run.mode === "write" || run.mode === "auto";
  const changedKnowledge = run.changes.length > 0;
  const step = run.status === "completed" ? 4 : run.status === "validating" ? 3 : run.status === "preparing" ? 1 : hasFailed ? (run.validation ? 3 : run.events.some((event) => event.method === "turn/started") ? 2 : 1) : 2;
  const steps = run.mode === "auto"
    ? ["收到请求", "理解并处理", "确认结果", "交付给你"]
    : ["收到问题", run.mode === "read" ? "寻找证据" : run.mode === "write" ? "整理与更新" : "运行检查", run.mode === "write" ? "质量确认" : "形成结果", "交付给你"];
  const returnContext: ReturnContext = { returnTo: `/workbench/${run.id}`, returnLabel: "返回共创记录" };

  async function approve(requestId: string | number, decision: AgentApprovalDecision) {
    setActionError("");
    try {
      await api(`/api/runs/${activeRun.id}/approval`, { method: "POST", body: JSON.stringify({ requestId, decision }) });
    } catch (reason: any) {
      setActionError(reason.message);
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setActionError("");
    try {
      if (isActive && activeRun.status !== "validating") {
        await api(`/api/runs/${activeRun.id}/steer`, { method: "POST", body: JSON.stringify({ prompt: reply }) });
      } else {
        const next = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({ mode: activeRun.mode, prompt: reply, displayPrompt: reply, runtimeId: activeRun.runtimeId, model: activeRun.model, effort: activeRun.effort, title: `继续${modeCopy.short}`, sessionId: activeRun.runtimeSessionId }) });
        navigate(`/workbench/${next.id}`);
      }
      setReply("");
    } catch (reason: any) {
      setActionError(reason.message);
    } finally {
      setSending(false);
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

  return (
    <div className="collaboration-session">
      <NavLink className="context-back" to="/workbench"><Icon name="back" size={16} />返回与知识共创</NavLink>
      <header className="session-header">
        <div className="session-title"><h1>{runDisplayPrompt(run)}</h1></div>
        <div className="session-state"><RunStatus status={run.status} /><small>{modeCopy.boundary}</small></div>
      </header>

      <ol className="session-steps" aria-label="共创进度">
        {steps.map((label, index) => <li key={label} className={step > index ? "done" : step === index + 1 ? "current" : ""}><span>{index + 1}</span><b>{label}</b></li>)}
      </ol>

      {run.approvals.map((approval) => (
        <section className="approval-box" key={String(approval.requestId)} aria-live="polite">
          <div><span>需要你决定</span><h2>{approval.title}</h2><p>{approval.detail || String(approval.params?.reason || approval.params?.command || approval.method || approval.operation)}</p><small>允许只对这一次请求生效；拒绝后任务会保留现状并继续报告结果。</small></div>
          <div className="approval-actions"><button onClick={() => approve(approval.requestId, "deny")}>拒绝这一步</button><button className="primary-action" onClick={() => approve(approval.requestId, "allow-once")}>允许一次</button></div>
        </section>
      ))}

      <div className="session-layout">
        <main className="session-conversation">
          {answer ? <article className="wiki-answer">
            <div className="answer-heading"><div><h2>{run.mode === "auto" ? changedKnowledge ? "这次已经处理并更新" : "沿着你的知识库，我看到这些" : run.mode === "read" ? "沿着你的知识库，我看到这些" : run.mode === "write" ? "这次已经沉淀完成" : "检查已经完成"}</h2></div><time>{new Date(run.updatedAt).toLocaleString("zh-CN")}</time></div>
            <div className="answer-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => { const local = localWikiHref(href); return local ? <NavLink to={local} state={returnContext}>{children}</NavLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>; } }}>{answer}</ReactMarkdown></div>
          </article> : isActive ? <section className="agent-working" aria-live="polite"><span className="working-mark"><i /><i /><i /></span><div><h2>{run.status === "waiting-approval" ? "等你确认后继续" : run.status === "validating" ? "正在确认这次结果" : "知识助手正在沿着证据工作"}</h2><p>{conversation.at(-1)?.message || "它会先理解构建规则与相关页面，再把过程整理成一份可读结果。你可以离开这个页面，任务仍会继续。"}</p></div></section> : <section className="run-result-missing"><h2>{hasFailed ? "这次没有顺利完成" : "这次任务没有留下可读回答"}</h2><p>{run.error || "技术过程仍然保留，你可以重新发起并补充更具体的要求。"}</p><NavLink to={`/workbench?mode=${run.mode}&prompt=${encodeURIComponent(runDisplayPrompt(run))}`}>带着原问题重新开始</NavLink></section>}

          {conversation.length > 0 && <section className="conversation-notes"><h2>共同工作的过程</h2>{conversation.map((event) => <div key={event.id} className={event.kind === "user" ? "conversation-note user" : "conversation-note agent"}><span>{event.kind === "user" ? "你补充" : "知识助手"}</span><p>{event.message}</p><time>{new Date(event.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div>)}</section>}

          {run.mode !== "validate" && <form className="session-reply" onSubmit={sendReply}>
            <label htmlFor="session-reply">{isActive ? "补充方向" : "沿着这次结果继续"}</label>
            <textarea id="session-reply" name="session-reply" autoComplete="off" value={reply} onChange={(event) => setReply(event.target.value)} placeholder={isActive ? "例如：先聚焦最近半年的证据，不要给行动建议…" : "写下新的追问或补充，它会沿用这次对话的上下文…"} />
            <div><span>{run.mode === "auto" ? "Agent 会继续根据你的表达判断是否需要更新知识。" : run.mode === "write" ? "发送后会开启一次新的写入任务，并再次记录改动。" : "发送后会开启同一对话里的新一轮只读理解。"}</span><button className="primary-action" disabled={sending || !reply.trim()}>{sending ? "正在继续…" : isActive ? "补充给知识助手" : run.mode === "auto" ? "继续交给 Agent" : run.mode === "write" ? "再次授权并继续" : "继续共创"}</button></div>
          </form>}
          {actionError && <p className="session-error" role="alert">{actionError}</p>}
        </main>

        <aside className="session-evidence">
          <section><h2>这次任务</h2><dl><div><dt>目的</dt><dd>{modeCopy.short}</dd></div><div><dt>权限</dt><dd>{run.mode === "auto" ? "按请求判断" : run.mode === "write" ? "本次可写入" : "只读"}</dd></div><div><dt>运行方式</dt><dd>{run.runtimeId === "pi" ? "自定义模型（Pi）" : "Codex"}</dd></div><div><dt>模型</dt><dd>{run.model || defaultAgentModel} · {reasoningLabels[run.effort || defaultAgentEffort]}</dd></div><div><dt>开始</dt><dd>{new Date(run.createdAt).toLocaleString("zh-CN")}</dd></div></dl>{isActive && run.status !== "validating" && <button className="stop-run" onClick={interrupt}>停止这次任务</button>}</section>

          {mayWrite && <section><h2>实际改动 <span>{run.changes.length}</span></h2>{run.recoveredFromLegacyWorkspace ? <p className="aside-empty">这条历史记录已从旧工作区恢复；回答与检查结果完整保留，旧快照差异不再重新计算。</p> : run.changes.length ? <div className="change-list">{run.changes.map((change) => <details key={change.path}><summary><span className={`change-kind ${change.kind}`}>{change.kind === "added" ? "新增" : change.kind === "modified" ? "修改" : "删除"}</span>{change.path}</summary><pre>{change.diff || "无文本差异"}</pre></details>)}</div> : <p className="aside-empty">{isActive ? "完成后会列出本次独立差异。" : "这次没有产生文件变化。"}</p>}</section>}

          {run.validation && <section><h2>质量检查</h2><div className="validation-summary">{run.validation.filter((item) => item.exitCode === 0).length}/{run.validation.length} 项通过</div><div className="validation-list">{run.validation.map((item, index) => <details key={index}><summary className={item.exitCode === 0 ? "passed" : "failed"}>{item.exitCode === 0 ? "通过" : "失败"} · {item.command.at(-1)}</summary><pre>{item.output}</pre></details>)}</div></section>}

          <details className="technical-trace"><summary>查看技术记录 <span>{technicalEvents.length}</span></summary><div>{technicalEvents.length ? technicalEvents.map((event) => <div key={event.id}><time>{new Date(event.at).toLocaleTimeString("zh-CN")}</time><p>{event.message || event.method || event.kind}</p></div>) : <p>暂无技术记录</p>}</div></details>
        </aside>
      </div>
    </div>
  );
}

function RunStatus({ status }: { status: WikiRun["status"] }) {
  const labels: Record<WikiRun["status"], string> = {
    preparing: "准备中", running: "运行中", "waiting-approval": "等待确认", validating: "正在验证", completed: "已完成", failed: "失败", interrupted: "已停止",
  };
  return <span className={`run-status ${status}`}><i />{labels[status]}</span>;
}
