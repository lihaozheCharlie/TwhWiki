import React, { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import type { ConversationPrompt, FocusWorkspaceView, GraphData, PaymentJourneySummary, SectionedPageView, SourceImportBatch, StateSignal, StructuredCard, TodayView, VaultInfo, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../api";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent, shouldSubmitAgentInput } from "../collaboration/model";
import { ImportMaterialsModal, RecordImportTrigger } from "../sources/Sources";
import { cleanSourcePath, importedFolderForBatch, pendingSourceBuildRecords } from "../sources/source-model";
import { graphCategoryNames } from "../../app/config";
import { PageLink, pageHref, useReturnContext } from "../../shared/routing";
import { resizeComposerTextarea } from "../../shared/composer-input";
import { Empty, Icon, Loading, PageHero, ParentBack } from "../../shared/ui";
import { dailyPromptSeed, groundedConversationReplyPrompt, stablePromptOrder } from "./conversation-prompts";
import { UnderstandingGlyph } from "../knowledge/UnderstandingLayout";
import { insightCardDetail, insightCoreJudgment, insightExcerpt, insightSectionText, mentalModelPanels } from "./insights-model";

export function KnowledgeHome({ revision }: { revision: number }) {
  const { data: vault, loading } = useApi<VaultInfo>("/api/vault", revision);
  if (loading || !vault) return <Loading label="正在整理已有理解" />;
  const selfCount = (vault.categories["personal-lines"] || 0) + (vault.categories.cycles || 0) + (vault.categories.systems || 0) + (vault.categories["mental-models"] || 0);
  const lifeCount = (vault.categories["life-stages"] || 0) + (vault.categories.events || 0) + (vault.categories.letters || 0);
  const peopleCount = (vault.categories.entities || 0) + (vault.categories["relationship-roles"] || 0);
  const groups = [
    { to: "/insights", tone: "self" as const, title: "理解自己", description: "把个人主线、反复循环、现实系统与思维模型放在同一张判断地图里。", count: selfCount, label: "条自我理解" },
    { to: "/timeline", tone: "life" as const, title: "人生轨迹", description: "沿着阶段、转折和近况回信，回到一段经历当时真实的处境。", count: lifeCount, label: "个阶段与片段" },
    { to: "/relationships", tone: "people" as const, title: "人与世界", description: "看见具体的人，也看见一段关系在生命中长期承担的功能。", count: peopleCount, label: "个人与关系页面" },
  ];
  return <div className="knowledge-home understanding-overview">
    <header className="understanding-overview-lede">
      <h1>已有理解</h1>
      <p>这里汇总系统从你的生活记录中持续读出的三类内容：关于你自己的判断、关于人生的轨迹，以及关于身边人与关系的记录。</p>
      <span>{vault.pageCount} 条理解 · 来自 {vault.sourceCount} 份生活记录</span>
    </header>
    <section className="understanding-entry-grid" aria-label="已有理解分类">
      {groups.map((group) => <NavLink className={`understanding-entry understanding-entry--${group.tone}`} to={group.to} key={group.to}>
        <UnderstandingGlyph tone={group.tone} size="small" />
        <div><h2>{group.title}</h2><p>{group.description}</p><span><b>{group.count}</b> {group.label}</span></div>
        <Icon name="arrow" size={17} />
      </NavLink>)}
    </section>
    <section className="understanding-overview-foot">
      <div><h2>这些理解会继续变化</h2><p>新的生活记录可能补充证据，也可能让旧判断失效。你随时可以打开一条理解，说明哪里不像你。</p></div>
      <button type="button" onClick={() => openContextAgent({ mode: "read" })}><Icon name="spark" size={16} />一起核对</button>
    </section>
    <ContextualAgentDock revision={revision} context={{ scope: "已有理解", title: "已有理解总览", summary: `当前有 ${vault.pageCount} 条已有理解，来自 ${vault.sourceCount} 份生活记录。`, defaultMode: "read", launcherLabel: "一起往下想", suggestions: ["当前哪些理解证据最充分，哪些地方还需要我亲自补充？", "结合最近更新的内容，现在最值得继续聊什么？"] }} />
  </div>;
}

function signalConversationPrompt(signal: StateSignal): string {
  return `我想从「${signal.name}」说起。现在的阶段性理解是：${signal.judgment}。之所以在此刻提起，是因为：${signal.reason || signal.observation}。请先区分已有证据、当前理解和仍然未知，再从最需要我亲自补充的地方开始，一次只问我一个具体问题。`;
}

function wikiConversationPrompt(prompt: ConversationPrompt): string {
  const evidence = prompt.links.map((link) => link.label).join("、");
  return `我想聊聊这个问题：“${prompt.question}”\n\n当前已有理解：${prompt.currentUnderstanding}\n为什么现在值得聊：${prompt.reason}\n仍然未知：${prompt.unknown}${evidence ? `\n相关知识：${evidence}` : ""}\n\n请先让我表达具体经历，再结合相关证据帮我理清线索；一次只问我一个具体问题。`;
}

function openLifeConversation(question: TalkingQuestion): void {
  openContextAgent({
    mode: "read",
    attachedContext: {
      title: question.question,
      currentUnderstanding: question.currentUnderstanding,
      reason: question.reason,
    },
  });
}

function updateLabel(value?: string): string {
  if (!value) return "等待更多记录";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "今天更新";
  if (days < 7) return `${days} 天前更新`;
  if (days < 30) return `${Math.floor(days / 7)} 周前更新`;
  return `${Math.floor(days / 30)} 个月前更新`;
}

type TalkingQuestion = {
  id: string;
  title: string;
  question: string;
  currentUnderstanding: string;
  reason: string;
  unknown: string;
  agentPrompt: string;
  pageId?: string;
  sourceHref?: string;
  sourceLabel?: string;
  basis: string[];
  kind: ConversationTopicKind;
  evidenceCount: number;
  weight?: number;
};

type ConversationTopicKind = "understanding" | "state" | "ledger" | "casual";

const conversationTopicKinds: Record<ConversationTopicKind, { label: string; description: string }> = {
  understanding: { label: "已有理解", description: "从已有判断里留下的待确认问题" },
  state: { label: "状态线索", description: "最近反复出现、还没有说清楚的状态" },
  ledger: { label: "账单线索", description: "从时间、地点和行动里找回真实经历" },
  casual: { label: "随口话头", description: "没有足够材料时，从一件小事开始" },
};

const todayOpeners = [
  { id: "noticed-small-thing", question: "最近有没有哪件小事，让你比平时更在意？", agentPrompt: "我想从最近一件让我比平时更在意的小事开始。请接着我的回答，一次只问一个关于人物、处境或感受的具体问题。" },
  { id: "stayed-in-mind", question: "今天过去以后，哪一个瞬间还留在你心里？", agentPrompt: "我想说说今天过去以后还留在心里的一个瞬间。请接着我的回答问细节。" },
  { id: "almost-said", question: "最近有没有一句差点说出口、最后又收回去的话？", agentPrompt: "我想从最近一句差点说出口、最后又收回去的话开始。请一次只问一个问题，陪我把当时的处境和顾虑说清楚。" },
  { id: "unexpected-ease", question: "这两天有没有什么时刻，让你意外地松了一口气？", agentPrompt: "我想说说这两天一个让我意外松了口气的时刻。请顺着我的回答继续问具体细节。" },
  { id: "keep-returning", question: "最近脑子里反复回来的一件事，是什么？", agentPrompt: "我想说说最近脑子里反复回来的一件事。请先陪我还原发生了什么，一次只问一个问题。" },
] as const;

const todayStarterPhrases = ["是的，其实…", "还好，但…", "说不好，可能是…"] as const;

function talkingQuestions(data: TodayView, recentJourney?: PaymentJourneySummary): TalkingQuestion[] {
  const wikiQuestions = data.conversationPrompts.map((prompt) => {
    const evidence = prompt.links.find((link) => link.resolvedId);
    return {
      id: `wiki:${prompt.id}`,
      title: prompt.title,
      question: prompt.question,
      currentUnderstanding: prompt.currentUnderstanding,
      reason: prompt.reason,
      unknown: prompt.unknown,
      agentPrompt: wikiConversationPrompt(prompt),
      pageId: evidence?.resolvedId,
      sourceHref: evidence?.resolvedId ? pageHref(evidence.resolvedId) : undefined,
      sourceLabel: evidence?.resolvedId ? "看看依据" : undefined,
      basis: prompt.links.map((link) => link.label).filter(Boolean).slice(0, 2),
      kind: "understanding" as const,
      evidenceCount: prompt.links.filter((link) => link.resolvedId).length || prompt.links.length,
      weight: prompt.weight,
    };
  });
  const signalQuestions = data.focusCandidates.map((signal) => {
    const evidence = signal.links.find((link) => link.resolvedId);
    return {
      id: `signal:${signal.id}`,
      title: signal.name,
      question: `最近哪一个具体时刻，让你觉得「${signal.name}」正在变好或变坏？`,
      currentUnderstanding: signal.judgment,
      reason: signal.reason || "这是一处仍在验证、需要回到你的真实经历中继续理解的地方。",
      unknown: signal.observation || "还不知道这条理解在你今天的生活里是否仍然成立。",
      agentPrompt: signalConversationPrompt(signal),
      pageId: evidence?.resolvedId,
      sourceHref: `/focus/${encodeURIComponent(signal.id)}`,
      sourceLabel: "看看它从哪里来",
      basis: [signal.name, signal.kind].filter(Boolean),
      kind: "state" as const,
      evidenceCount: signal.links.filter((link) => link.resolvedId).length || signal.links.length,
      weight: 1,
    };
  });
  const journeyCluster = recentJourney?.clusters[0];
  const journeyQuestion = recentJourney && journeyCluster ? [{
    id: `journey:${journeyCluster.id}`,
    title: journeyCluster.title,
    question: journeyCluster.question,
    currentUnderstanding: `${recentJourney.transactionCount} 笔账单记录里，出现了 ${recentJourney.clusters.length} 段有时间顺序的生活线索。`,
    reason: "账单已经留下时间、地点与行动，但真正重要的人物、动机和感受只能由你说出来。",
    unknown: "当时和谁在一起、为什么出发，以及这段经历后来改变了什么。",
    agentPrompt: recentJourney.agentPrompt || `请从「${journeyCluster.title}」开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来。`,
    sourceHref: "/sources",
    sourceLabel: "看看相关记录",
    basis: ["近期账单", journeyCluster.title],
    kind: "ledger" as const,
    evidenceCount: recentJourney.transactionCount,
    weight: 2,
  }] : [];
  const candidates = [...wikiQuestions, ...journeyQuestion, ...signalQuestions];
  if (candidates.length) return stablePromptOrder(candidates, dailyPromptSeed());
  return [{
    id: "recent-moment",
    title: "从一件小事开始",
    question: "最近哪一件小事，让你觉得自己和平时有一点不一样？",
    currentUnderstanding: "这里还没有足够具体的记录，无法替你判断正在发生什么。",
    reason: "从一个真实片段开始，比先给自己下结论更容易找到线索。",
    unknown: "当时发生了什么、你在意什么，以及它为什么留在了心里。",
    agentPrompt: "我想从最近一件让我觉得自己和平时有一点不一样的小事开始。请一次只问我一个关于人物、处境、感受或判断的具体问题，先陪我说清楚。",
    basis: ["从最近发生的小事开始"],
    kind: "casual",
    evidenceCount: 0,
  }];
}

export function Today({ revision }: { revision: number }) {
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [importedJourney, setImportedJourney] = useState<PaymentJourneySummary>();
  const [questionOffset, setQuestionOffset] = useState(0);
  const [conversationDraft, setConversationDraft] = useState("");
  const conversationInputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => resizeComposerTextarea(conversationInputRef.current), [conversationDraft]);
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找回我们上次聊到的地方" />;
  if (error || !data) return <Empty>{error || "暂无数据"}</Empty>;
  const recentJourney = importedJourney || importBatches?.find((batch) => batch.journey)?.journey;
  const pendingBuilds = pendingSourceBuildRecords(importBatches || []);
  const pendingDialogueCount = pendingBuilds.filter(({ file }) => file.buildKind === "dialogue").length;
  const openers = stablePromptOrder([...todayOpeners], dailyPromptSeed());
  const featuredQuestion = openers[questionOffset % openers.length]!;
  const importFolders = [...new Set((sourcePages || []).map((page) => cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const journeyPrompt = recentJourney
    ? `最近的账单记录里出现了 ${recentJourney.clusters.length} 段可能的生活旅程。交易只能说明时间、地点和发生过什么，不能说明人物、动机和感受。请从最有画面的一条线索开始，一次问我一个问题，先陪我把这段经历说出来。`
    : "";

  function beginConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = conversationDraft.trim();
    if (!answer) return;
    openContextAgent({ mode: "read", prompt: groundedConversationReplyPrompt(featuredQuestion.agentPrompt, answer), displayPrompt: answer, autoSubmit: true });
    setConversationDraft("");
  }

  function submitConversationOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitAgentInput({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function beginWith(phrase: string) {
    setConversationDraft(phrase);
    window.setTimeout(() => conversationInputRef.current?.focus(), 0);
  }

  function cycleOpener() {
    setQuestionOffset((current) => current + 1);
    setConversationDraft("");
    window.setTimeout(() => conversationInputRef.current?.focus(), 0);
  }

  function openImportedFolder(batch: SourceImportBatch) {
    const importedFolder = importedFolderForBatch(batch);
    navigate({ pathname: "/sources", search: `?${new URLSearchParams({ ...(importedFolder ? { folder: importedFolder } : {}), batch: batch.id })}` });
  }

  return (
    <div className="home-overview">
      {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" onClose={() => setImportOpen(false)} onImported={openImportedFolder} onJourney={setImportedJourney} /> : null}
      <section className="home-intro-card" aria-labelledby="home-intro-title">
        <div className="home-intro-main">
          <span className="friend-mark" aria-hidden="true"><Icon name="message" size={22} /></span>
          <div>
            <div className="home-intro-identity"><h1 id="home-intro-title">The Way Here</h1><span>一个会越来越懂你的朋友</span></div>
            <p>我们聊得越多，我就越懂你。<br />你也可以把日记、聊天记录或账单带给我看，帮我更快跟上你。</p>
          </div>
        </div>
        <div className="home-intro-ways">
          <button type="button" onClick={() => openContextAgent({ mode: "read" })}><Icon name="message" size={16} />和你聊天</button>
          <RecordImportTrigger onClick={() => setImportOpen(true)} />
        </div>
      </section>

      {pendingBuilds.length ? <NavLink className="home-pending-build" to="/sources?type=pending"><i aria-hidden="true" /><span><b>{pendingBuilds.length} 份新带进来的记录还没聊透</b>{pendingDialogueCount ? ` · ${pendingDialogueCount} 份在等一次对话` : " · 随时可以收进已有理解"}</span><Icon name="arrow" size={15} /></NavLink> : null}

      <section className="home-opener" aria-labelledby="home-opener-title">
        <div className="home-opener-copy">
          <span className="home-memory-label"><i aria-hidden="true" />此刻的话头</span>
          <h2 id="home-opener-title">{featuredQuestion.question}</h2>
        </div>
        <div className="home-opener-starters" aria-label="帮我起个头">
          {todayStarterPhrases.map((phrase) => <button type="button" key={phrase} onClick={() => beginWith(phrase)}>{phrase}</button>)}
        </div>
        <form className="home-opener-form" onSubmit={beginConversation}>
          <div>
            <textarea ref={conversationInputRef} rows={1} aria-label="接着说" value={conversationDraft} onChange={(event) => setConversationDraft(event.target.value)} onKeyDown={submitConversationOnEnter} placeholder="接着说，先说一句就行" />
            <button type="submit" aria-label="发送" disabled={!conversationDraft.trim()}><Icon name="up" size={19} /></button>
          </div>
          <div className="home-opener-foot">
            <button type="button" className="home-opener-cycle" onClick={cycleOpener}><Icon name="refresh" size={16} />换一个随口话头</button>
            <span>我会先看看你的来路</span>
          </div>
        </form>
      </section>
      <ContextualAgentDock revision={revision} context={{ scope: "此刻 · 随口话头", title: featuredQuestion.question, summary: "从一个新近发生的具体片段开始；收到回答后，再沿相关 Wiki 和原始记录理解它的来路。", defaultMode: "read", launcherLabel: "找我聊聊", compactLauncher: true, suggestions: [featuredQuestion.agentPrompt, journeyPrompt || "我想讲一件最近发生、但还没有说清楚的事。请一次问我一个具体问题，先陪我理解。"] }} />
    </div>
  );
}

export function QuestionsHub({ revision }: { revision: number }) {
  const navigate = useNavigate();
  const [topicKind, setTopicKind] = useState<ConversationTopicKind | "all">("all");
  const [topicLimit, setTopicLimit] = useState(6);
  const [importOpen, setImportOpen] = useState(false);
  const [importedJourney, setImportedJourney] = useState<PaymentJourneySummary>();
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找出还想听你说的地方" />;
  if (error || !data) return <Empty>{error || "暂时没有可以继续聊的内容"}</Empty>;
  const recentJourney = importedJourney || importBatches?.find((batch) => batch.journey)?.journey;
  const questions = talkingQuestions(data, recentJourney);
  const availableKinds = (Object.keys(conversationTopicKinds) as ConversationTopicKind[]).filter((kind) => questions.some((question) => question.kind === kind));
  const filteredQuestions = topicKind === "all" ? questions : questions.filter((question) => question.kind === topicKind);
  const concernQuestions = topicKind === "all" ? questions.filter((question) => question.kind === "state").slice(0, 3) : [];
  const concernIds = new Set(concernQuestions.map((question) => question.id));
  const wallQuestions = topicKind === "all" ? filteredQuestions.filter((question) => !concernIds.has(question.id)) : filteredQuestions;
  const topicCards = wallQuestions.slice(0, topicLimit);
  const importFolders = [...new Set((sourcePages || []).map((page) => cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));

  function openImportedFolder(batch: SourceImportBatch) {
    const importedFolder = importedFolderForBatch(batch);
    navigate({ pathname: "/sources", search: `?${new URLSearchParams({ ...(importedFolder ? { folder: importedFolder } : {}), batch: batch.id })}` });
  }

  return <div className="questions-hub">
    {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" onClose={() => setImportOpen(false)} onImported={openImportedFolder} onJourney={setImportedJourney} /> : null}
    <header className="questions-intro">
      <h1>这段时间你说的话，我都还记得。</h1>
    </header>

    <section className="questions-wall" aria-labelledby="questions-wall-title">
      <div className="questions-wall-head">
        <div><h2 id="questions-wall-title">挑一个话题</h2><p>从你现在想说的开始，或者看看我留意到的几条还没有说完的线索。</p></div>
        <div className="questions-filters" aria-label="筛选话题">
          <button type="button" className={topicKind === "all" ? "active" : ""} aria-pressed={topicKind === "all"} onClick={() => { setTopicKind("all"); setTopicLimit(6); }}>全部</button>
          {availableKinds.map((kind) => <button type="button" key={kind} className={topicKind === kind ? "active" : ""} aria-pressed={topicKind === kind} title={conversationTopicKinds[kind].description} onClick={() => { setTopicKind(kind); setTopicLimit(6); }}>{conversationTopicKinds[kind].label}</button>)}
        </div>
      </div>
      {topicCards.length ? <div className="questions-topic-grid">
        {topicCards.map((question, index) => {
          const kind = conversationTopicKinds[question.kind];
          const evidenceStrength = Math.min(question.evidenceCount, 3);
          const headingId = `question-topic-${index}`;
          return <article className={`questions-topic-card is-${question.kind}`} key={question.id} aria-labelledby={headingId}>
            <span className="questions-topic-kind">{kind.label}</span>
            <h3 id={headingId}>{question.question}</h3>
            <p>{question.reason}</p>
            <div className="questions-topic-evidence">
              <span aria-hidden="true">{[0, 1, 2].map((index) => <i className={index < evidenceStrength ? "on" : ""} key={index} />)}</span>
              <small>{question.evidenceCount ? `${question.evidenceCount} 条相关记录` : "等你补充第一条记录"}</small>
            </div>
            <footer>
              <button type="button" onClick={() => openLifeConversation(question)}>聊聊这个 <Icon name="arrow" size={15} /></button>
              {question.sourceHref ? <NavLink to={question.sourceHref} state={{ returnTo: "/questions", returnLabel: "返回值得聊聊" }}>{question.sourceLabel || "查看依据"}</NavLink> : null}
            </footer>
          </article>;
        })}
      </div> : <div className="questions-wall-empty"><b>这一类还没有话题</b><p>换个分类看看，或者带进一份新的生活记录。</p></div>}
      {wallQuestions.length > topicCards.length ? <button type="button" className="questions-wall-more" onClick={() => setTopicLimit((current) => current + 6)}>再看 {Math.min(6, wallQuestions.length - topicCards.length)} 个话题 <Icon name="down" size={15} /></button> : null}
    </section>

    {concernQuestions.length ? <section className="questions-concerns" aria-labelledby="questions-concerns-title">
      <div className="questions-concerns-head"><h2 id="questions-concerns-title">你之前有点在意的</h2><i aria-hidden="true" /></div>
      <div>{concernQuestions.map((question) => <button key={question.id} type="button" onClick={() => openLifeConversation(question)}>{question.title}</button>)}</div>
    </section> : null}

    <section className="questions-import" aria-labelledby="questions-import-title">
      <div className="questions-import-copy">
        <div className="questions-import-types"><span><Icon name="journal" size={14} />日记</span><span><Icon name="message" size={14} />对话</span><span><Icon name="receipt" size={14} />账单</span></div>
        <div><h2 id="questions-import-title">日记、对话和账单，都可以带进来</h2><p>留下原话，让之后的问题更具体——不用替我总结，原样丢给我就好。</p></div>
      </div>
      <RecordImportTrigger onClick={() => setImportOpen(true)} />
    </section>
    <ContextualAgentDock revision={revision} context={{ scope: "值得聊聊", title: topicCards[0]?.question || "最近值得聊的话题", summary: "从具体线索里挑一个想说的，我会沿着它继续问。", defaultMode: "read", launcherLabel: "继续聊", compactLauncher: true, suggestions: [topicCards[0]?.agentPrompt || "我想从最近一件还没有说清楚的事开始。", "我觉得这里有一条理解不符合我。请先让我说明哪里不准确，再帮我找可能的反例。"] }} />
  </div>;
}

const evidenceKindLabels = { source: "原始证据", letter: "回信回应", event: "事件记录", wiki: "已有判断" } as const;

function ContextGraph({ data }: { data: GraphData }) {
  const returnContext = useReturnContext();
  const focus = data.nodes.find((node) => node.id === data.focusId) || data.nodes[0];
  const others = data.nodes.filter((node) => node.id !== focus?.id).slice(0, 28);
  const positions = new Map<string, { x: number; y: number }>();
  if (focus) positions.set(focus.id, { x: 320, y: 210 });
  others.forEach((node, index) => {
    const ring = index < 10 ? 1 : 2;
    const ringItems = ring === 1 ? Math.min(10, others.length) : Math.max(others.length - 10, 1);
    const ringIndex = ring === 1 ? index : index - 10;
    const angle = (Math.PI * 2 * ringIndex) / ringItems - Math.PI / 2;
    const radius = ring === 1 ? 108 : 178;
    positions.set(node.id, { x: 320 + Math.cos(angle) * radius, y: 210 + Math.sin(angle) * radius });
  });
  const shown = new Set([focus?.id, ...others.map((node) => node.id)].filter(Boolean));
  return <div className="context-graph">
    <svg viewBox="0 0 640 420" role="img" aria-labelledby="context-graph-title">
      <title id="context-graph-title">当前问题与相关知识页面之间的局部关系</title>
      <g className="graph-links">{data.links.filter((link) => shown.has(link.source) && shown.has(link.target)).map((link) => {
        const source = positions.get(link.source); const target = positions.get(link.target);
        return source && target ? <line key={`${link.source}-${link.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} /> : null;
      })}</g>
      <g>{[focus, ...others].filter(Boolean).map((node) => {
        const position = positions.get(node!.id)!;
        const isFocus = node!.id === focus?.id;
        return <g key={node!.id} className={`context-graph-node ${isFocus ? "focus" : ""}`} transform={`translate(${position.x} ${position.y})`}>
          <circle r={isFocus ? 27 : 8} />
          <text textAnchor="middle" y={isFocus ? 45 : 22}>{node!.title.slice(0, isFocus ? 12 : 8)}</text>
        </g>;
      })}</g>
    </svg>
    <div className="context-graph-list" aria-label="局部关系的可访问列表">{others.slice(0, 12).map((node) => <NavLink key={node.id} to={pageHref(node.id)} state={returnContext}><span>{graphCategoryNames[node.category] || node.category}</span><b>{node.title}</b></NavLink>)}</div>
  </div>;
}

export function FocusWorkspace({ revision }: { revision: number }) {
  const { signalId = "" } = useParams();
  const { data, loading, error } = useApi<FocusWorkspaceView>(`/api/views/focus/${encodeURIComponent(signalId)}`, revision);
  if (loading) return <Loading label="正在把当前问题与证据放到一起" />;
  if (error || !data) return <Empty>{error || "当前没有可展开的问题"}</Empty>;
  const sourceEvents = data.evidenceTimeline.filter((item) => item.kind === "source" || item.kind === "event");
  return <div className="focus-workspace">
    <ParentBack to="/questions" label="返回值得聊聊" />
    <PageHero title={data.signal.name} description={data.signal.judgment} tone="tinted" className="focus-page-hero" aside={<div className="page-hero-rationale"><b>为什么是现在</b><p>{data.signal.reason}</p><span>{data.signal.kind}</span></div>} />
    <nav className="focus-switcher" aria-label="切换当前问题">{data.candidates.map((candidate) => <NavLink key={candidate.id} className={candidate.id === data.signal.id ? "active" : ""} to={`/focus/${encodeURIComponent(candidate.id)}`}><b>{candidate.name}</b><small>{candidate.kind}</small></NavLink>)}</nav>
    <section className="epistemic-board" aria-label="证据、当前理解与仍然未知">
      <article className="evidence"><span>事实证据</span><b>{sourceEvents.length ? `${sourceEvents.length} 条可追溯材料` : "暂未找到直接原始材料"}</b><p>{sourceEvents[0]?.excerpt || "这不等于没有发生，只表示当前知识系统还缺少可追溯证据。"}</p></article>
      <article className="judgment"><span>现在的理解</span><b>{data.signal.judgment}</b><p>这只是一个仍在验证的观察，可以被新的经历和反例修正。</p></article>
      <article className="unknown"><span>还不知道</span><b>{data.signal.observation || "还没有找到最值得继续观察的地方"}</b><p>它需要回到生活里继续看，不是已经成立的结论。</p></article>
    </section>
    <div className="focus-workspace-grid">
      <section className="evidence-history"><SectionHeading title="证据怎样变化" />{data.evidenceTimeline.length ? <ol>{data.evidenceTimeline.map((item) => <li key={`${item.page.id}-${item.kind}`}><time>{item.date.slice(0, 10)}</time><i /><div><span>{evidenceKindLabels[item.kind]}</span><PageLink page={item.page}>{item.label}</PageLink><p>{item.excerpt}</p></div></li>)}</ol> : <Empty>相关页面已经找到，但还没有可排序的证据切片。</Empty>}</section>
      <aside className="focus-relations"><SectionHeading title="它连接到什么" />{data.related.map((group) => <section key={group.category}><h3>{group.label}<span>{group.pages.length}</span></h3>{group.pages.map((page) => <PageLink key={page.id} page={page}><b>{page.title}</b><small>{page.excerpt}</small></PageLink>)}</section>)}</aside>
    </div>
    <section className="local-graph-section"><SectionHeading title="这件事在知识系统里的位置" /><p>只显示与当前问题相距两步以内的页面；下方列表是同一关系的可访问入口。</p><ContextGraph data={data.graph} /></section>
    <ContextualAgentDock revision={revision} context={{ scope: `值得聊聊 · ${data.signal.name}`, title: data.signal.judgment, summary: `仍在观察：${data.signal.observation}。相关上下文：${data.related.map((group) => `${group.label} ${group.pages.map((page) => page.title).join("、")}`).join("；")}`, defaultMode: "read", launcherLabel: "一起往下想", suggestions: [signalConversationPrompt(data.signal), `我觉得关于“${data.signal.name}”的理解不完全符合我。请先让我说明哪里不准确，再一起找反例。`, "基于当前证据，给我设计一个未来两周可观察、但不会制造额外压力的验证方式。"] }} />
  </div>;
}

type InsightSectionKind = "line" | "cycle" | "system" | "model";

function InsightSectionMark({ kind }: { kind: InsightSectionKind }) {
  return <span className={`insights-section-mark insights-section-mark--${kind}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none">
      {kind === "line" ? <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>
        : kind === "cycle" ? <><path d="M17 4h4v4" /><path d="M20 8a8 8 0 0 0-14-2M7 20H3v-4" /><path d="M4 16a8 8 0 0 0 14 2" /></>
          : kind === "system" ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>
            : <><path d="M9.5 3a4 4 0 0 0-3.8 5.2A4 4 0 0 0 5 15v1.5A3.5 3.5 0 0 0 8.5 20h1" /><path d="M14.5 3a4 4 0 0 1 3.8 5.2A4 4 0 0 1 19 15v1.5a3.5 3.5 0 0 1-3.5 3.5h-1M9.5 20h5" /></>}
    </svg>
  </span>;
}

function insightItemHref(route: { to: string; key: string }, item: { id: string }): string {
  return route.key === "mental-models" ? route.to : `${route.to}?item=${encodeURIComponent(item.id)}`;
}

export function GrowthHub({ revision }: { revision: number }) {
  const personalLines = useApi<StructuredCard[]>("/api/views/cards/personal-lines", revision);
  const cycles = useApi<StructuredCard[]>("/api/views/cards/cycles", revision);
  const systems = useApi<StructuredCard[]>("/api/views/cards/systems", revision);
  const models = useApi<SectionedPageView>("/api/views/mental-models", revision);
  const [expandedLines, setExpandedLines] = useState<Set<string>>(() => new Set());
  const [expandedCycles, setExpandedCycles] = useState<Set<string>>(() => new Set());
  const [selectedSystemId, setSelectedSystemId] = useState("");
  const [modelViews, setModelViews] = useState<Record<string, "summary" | "calibration">>({});
  if (personalLines.loading || cycles.loading || systems.loading || models.loading) return <Loading label="正在把经历整理成可用的理解路径" />;
  const modelSections = models.data?.sections.filter((section) => /^[一二三四五六七]、/.test(section.heading)) || [];
  const routes: Array<{ to: string; key: string; title: string; note: string; items: StructuredCard[] }> = [
    { to: "/cards/personal-lines", key: "personal-lines", title: "个人主线", note: "这一生反复在解决什么，以及它怎样穿过不同阶段", items: personalLines.data || [] },
    { to: "/cards/cycles", key: "cycles", title: "反复循环", note: "看见触发、惯性反应、代价与真实有效的中断方式", items: cycles.data || [] },
    { to: "/cards/systems", key: "systems", title: "现实系统", note: "职业、家庭、身体、资产、注意力与表达怎样共同运行", items: systems.data || [] },
    { to: "/mental-models", key: "mental-models", title: "思维模型", note: "带着边界、反例和校准使用的判断工具", items: modelSections.map((section, index) => ({ id: String(index), title: section.heading.replace(/^[一二三四五六七]、/, ""), excerpt: insightExcerpt(section.body, 120), sections: [{ heading: "模型说明", body: section.body }] })) },
  ];
  const total = routes.reduce((sum, route) => sum + route.items.length, 0);
  const datedItems = routes.flatMap((route) => route.items.map((item) => ({ ...item, route }))).filter((item) => item.updatedAt).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const focus = datedItems[0] || routes.flatMap((route) => route.items.map((item) => ({ ...item, route })))[0];
  const focusHref = focus ? insightItemHref(focus.route, focus) : "/insights";
  const lineRoute = routes[0]!;
  const cycleRoute = routes[1]!;
  const systemRoute = routes[2]!;
  const modelRoute = routes[3]!;
  const selectedSystem = systemRoute.items.find((item) => item.id === selectedSystemId);
  const leadingCycle = cycleRoute.items[0];
  const cycleStages = leadingCycle ? [
    { heading: "常见触发", label: "触发" },
    { heading: "惯性反应", label: "惯性反应" },
    { heading: "代价", label: "代价" },
    { heading: "中断点", label: "有效中断" },
  ].map((stage) => ({ ...stage, text: insightExcerpt(insightSectionText(leadingCycle, stage.heading) || leadingCycle.excerpt, 42) })) : [];
  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => setter((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <div className="growth-hub understanding-self-page">
    <header className="insights-page-head">
      <div><h1>理解自己</h1><p>这里不是一组给你下结论的标签，而是能够回到经历、证据与反例继续修正的判断。先看结论，再决定要不要展开证据。</p></div>
      <div className="insights-head-stat"><b>{new Intl.NumberFormat("zh-CN").format(total)}</b><span>条判断与模型</span></div>
    </header>

    <nav className="insights-quick-jump" aria-label="快速跳转到理解分类">
      {[
        { href: "#insights-lines", kind: "line" as const, route: lineRoute },
        { href: "#insights-cycles", kind: "cycle" as const, route: cycleRoute },
        { href: "#insights-systems", kind: "system" as const, route: systemRoute },
        { href: "#insights-models", kind: "model" as const, route: modelRoute },
      ].map(({ href, kind, route }) => <a href={href} className={`is-${kind}`} key={href}><InsightSectionMark kind={kind} />{route.title} · {route.items.length}</a>)}
    </nav>

    {focus ? <section className="insights-spotlight" aria-labelledby="insights-spotlight-title">
      <div className="insights-spotlight-glyph" aria-hidden="true"><svg viewBox="0 0 168 168" fill="none"><circle cx="84" cy="84" r="78" stroke="currentColor" strokeDasharray="3 6" /><circle cx="84" cy="84" r="56" stroke="currentColor" /><circle cx="84" cy="84" r="32" /><path d="M84 84V51M84 84l28 12" /><circle cx="84" cy="84" r="4" /><circle cx="84" cy="51" r="4" /><circle cx="112" cy="96" r="4" /></svg></div>
      <div className="insights-spotlight-copy"><span>最近变化 · {focus.route.title}</span><h2 id="insights-spotlight-title">{focus.title}</h2><p>{insightExcerpt(insightCardDetail(focus, ["核心判断", "系统目标", "循环定义", "模型说明"]), 150)}</p><div>{focus.sections.slice(0, 3).map((section) => <span key={section.heading}>{section.heading}</span>)}{!focus.sections.length ? <span>可继续核对证据</span> : null}</div></div>
      <NavLink className="insights-spotlight-action" to={focusHref} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看完整推理 <Icon name="arrow" size={15} /></NavLink>
    </section> : null}

    <section className="insights-section insights-section--line" id="insights-lines" aria-labelledby="insights-lines-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="line" /><div><h2 id="insights-lines-title">{lineRoute.title}</h2><p>{lineRoute.note}</p></div></div><NavLink to={lineRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {lineRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {lineRoute.items.length ? <div className="insights-line-scroller" aria-label="个人主线摘要">
        {lineRoute.items.slice(0, 4).map((item) => {
          const open = expandedLines.has(item.id);
          const detailId = `line-detail-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          return <article className={`insights-line-card${open ? " is-open" : ""}`} key={item.id}>
            <span>{item.sections.length ? `${item.sections.length} 个证据切面` : "待继续补充"}</span><h3>{item.title}</h3><small>{item.updatedAt ? `更新于 ${item.updatedAt}` : "可以回到原文继续核对"}</small>
            <button type="button" onClick={() => toggleInSet(setExpandedLines, item.id)} aria-expanded={open} aria-controls={detailId}>{open ? "收起判断" : "看核心判断"}<Icon name="arrow" size={12} /></button>
            <p className="insights-card-detail" id={detailId}>{insightExcerpt(insightCoreJudgment(item), 220)}</p>
            {open ? <NavLink to={insightItemHref(lineRoute, item)} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>打开完整主线</NavLink> : null}
          </article>;
        })}
      </div> : <Empty>还没有形成个人主线。</Empty>}
    </section>

    <section className="insights-section insights-section--cycle" id="insights-cycles" aria-labelledby="insights-cycles-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="cycle" /><div><h2 id="insights-cycles-title">{cycleRoute.title}</h2><p>{cycleRoute.note}</p></div></div><NavLink to={cycleRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {cycleRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {cycleStages.length ? <div className="insights-cycle-flow" aria-label={`以“${leadingCycle?.title}”为例的循环路径`}>
        {cycleStages.map((stage, index) => <React.Fragment key={stage.label}><div><span><InsightSectionMark kind="cycle" /></span><b>{stage.label}</b><small>{stage.text}</small></div>{index < cycleStages.length - 1 ? <Icon name="arrow" size={17} /> : null}</React.Fragment>)}
      </div> : null}
      {cycleRoute.items.length ? <div className="insights-loop-grid">
        {cycleRoute.items.slice(0, 3).map((item) => {
          const open = expandedCycles.has(item.id);
          const detailId = `cycle-detail-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const trigger = insightSectionText(item, "常见触发");
          const cost = insightSectionText(item, "代价");
          return <article className={`insights-loop-card${open ? " is-open" : ""}`} key={item.id}>
            <div><InsightSectionMark kind="cycle" /><h3>{item.title}</h3></div><p>{insightExcerpt(insightCardDetail(item, ["循环定义"]), 130)}</p>
            <div className="insights-loop-tags">{trigger ? <span>触发 · {insightExcerpt(trigger, 22)}</span> : null}{cost ? <span>代价 · {insightExcerpt(cost, 22)}</span> : null}</div>
            <button type="button" onClick={() => toggleInSet(setExpandedCycles, item.id)} aria-expanded={open} aria-controls={detailId}>{open ? "收起详情" : "展开详情"}</button>
            <div className="insights-card-detail" id={detailId}>{insightExcerpt(insightCardDetail(item, ["中断点", "有效部分", "新证据"]), 250)} <NavLink to={insightItemHref(cycleRoute, item)} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看完整循环</NavLink></div>
          </article>;
        })}
      </div> : <Empty>还没有形成反复循环。</Empty>}
    </section>

    <section className="insights-section insights-section--system" id="insights-systems" aria-labelledby="insights-systems-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="system" /><div><h2 id="insights-systems-title">{systemRoute.title}</h2><p>{systemRoute.note}</p></div></div><NavLink to={systemRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {systemRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {systemRoute.items.length ? <div className="insights-system-grid">
        {systemRoute.items.slice(0, 6).map((item) => {
          const selected = selectedSystemId === item.id;
          return <button type="button" className={selected ? "is-selected" : ""} key={item.id} onClick={() => setSelectedSystemId(selected ? "" : item.id)} aria-expanded={selected} aria-controls="insights-system-detail"><InsightSectionMark kind="system" /><b>{item.title}</b><span><i />{item.sections.length} 个切面</span></button>;
        })}
        {selectedSystem ? <article className="insights-system-detail" id="insights-system-detail"><div><h3>{selectedSystem.title} · 关键要点</h3><NavLink to={insightItemHref(systemRoute, selectedSystem)} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>打开完整系统 <Icon name="arrow" size={13} /></NavLink></div><ul>{selectedSystem.sections.slice(0, 3).map((section) => <li key={section.heading}><b>{section.heading}</b><span>{insightExcerpt(section.body, 150)}</span></li>)}</ul>{!selectedSystem.sections.length ? <p>{insightExcerpt(selectedSystem.excerpt, 220)}</p> : null}</article> : null}
      </div> : <Empty>还没有形成现实系统。</Empty>}
    </section>

    <section className="insights-section insights-section--model" id="insights-models" aria-labelledby="insights-models-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="model" /><div><h2 id="insights-models-title">{modelRoute.title}</h2><p>{modelRoute.note}</p></div></div><NavLink to={modelRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {modelRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {modelSections.length ? <div className="insights-model-grid">
        {modelSections.slice(0, 3).map((section, index) => {
          const id = `model-${index}`;
          const view = modelViews[id] || "summary";
          const panels = mentalModelPanels(section.body);
          return <article className="insights-model-card" key={section.heading}><div><InsightSectionMark kind="model" /><h3><NavLink to="/mental-models" state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>{section.heading.replace(/^[一二三四五六七]、/, "")}</NavLink></h3></div><p>{insightExcerpt(panels.summary, 145)}</p>
            <div className="insights-model-toggles" role="group" aria-label={`${section.heading}的查看方式`}><button type="button" className={view === "summary" ? "is-active" : ""} aria-pressed={view === "summary"} onClick={() => setModelViews((current) => ({ ...current, [id]: "summary" }))}>核心要点</button><button type="button" className={view === "calibration" ? "is-active" : ""} aria-pressed={view === "calibration"} onClick={() => setModelViews((current) => ({ ...current, [id]: "calibration" }))}>边界与反例</button></div>
            <div className="insights-model-panel" aria-live="polite">{insightExcerpt(view === "summary" ? panels.summary : panels.calibration, 240)}</div>
          </article>;
        })}
      </div> : <Empty>还没有形成思维模型。</Empty>}
    </section>

    <section className="insights-foot-cta"><div><h2>这些理解会继续变化</h2><p>新的生活记录可能补充证据，也可能让旧判断失效。你随时可以打开一条理解，说明哪里不像你。</p></div><button type="button" onClick={() => openContextAgent({ mode: "read", prompt: "我想一起核对这页已有的理解。请先问我哪一条最不像我，再结合证据和反例继续聊。" })}><Icon name="spark" size={15} />一起核对</button></section>
    <ContextualAgentDock revision={revision} context={{ scope: "理解自己", title: "个人主线、反复循环、现实系统与思维模型", summary: "从当前问题出发，结合已有的长期命题、循环、系统和判断工具。", defaultMode: "read", launcherLabel: "一起理解", suggestions: ["结合我的个人主线、反复循环和近期状态，现在最值得理解的一个问题是什么？", "最近发生的事更像哪一种旧模式？请给出证据和竞争解释。", "我有一个新的自我观察，帮我判断它应该补充到哪条路径。"] }} />
  </div>;
}

function Signal({ signal }: { signal: StateSignal }) {
  const tone = signal.kind.includes("做得好") ? "good" : signal.kind.includes("关注") ? "watch" : "neutral";
  return (
    <div className="signal-item">
      <span className={`signal-dot ${tone}`} />
      <div><b>{signal.name}</b><p>{signal.judgment}</p></div>
      <em>{signal.kind}</em>
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="section-heading"><h2>{title}</h2>{action}</div>;
}
