import React, { useState } from "react";
import { NavLink, useParams, useSearchParams } from "react-router-dom";
import type { ConversationPrompt, FocusWorkspaceView, GraphData, PaymentJourneySummary, QuotesView, SectionedPageView, SkillFileContent, SkillTreeNode, SourceImportBatch, StateSignal, StructuredCard, TodayView, VaultInfo, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../api";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent, shouldSubmitAgentInput } from "../collaboration/model";
import { cleanSourcePath, ImportMaterialsModal } from "../sources/Sources";
import { graphCategoryNames } from "../../app/config";
import { PageLink, pageHref, useReturnContext } from "../../shared/routing";
import { Empty, Icon, Loading, PageHeader, PageHero, HeroMetric, ParentBack } from "../../shared/ui";
import { dailyPromptSeed, stablePromptOrder } from "./conversation-prompts";

export function KnowledgeHome({ revision }: { revision: number }) {
  const { data: vault, loading } = useApi<VaultInfo>("/api/vault", revision);
  const { data: today } = useApi<TodayView>("/api/views/today", revision);
  const { data: quotes } = useApi<QuotesView>("/api/views/quotes", revision);
  if (loading || !vault) return <Loading label="正在整理已有理解" />;
  const groups = [
    { to: "/insights", title: "理解自己", description: "个人主线、反复循环、现实系统与思维模型。", meta: `${(vault.categories["personal-lines"] || 0) + (vault.categories.cycles || 0) + (vault.categories.systems || 0) + (vault.categories["mental-models"] || 0)} 个知识页面` },
    { to: "/timeline", title: "回看人生", description: "沿着主线与并行人生线，回到不同阶段的处境、转折与证据。", meta: `${vault.categories["life-stages"] || 0} 个人生阶段` },
    { to: "/letters", title: "近况回信", description: "按写信时间或生命主题，重新听见过去与此刻之间的回应。", meta: `${vault.categories.letters || 0} 封回信` },
    { to: "/relationships", title: "人与世界", description: "人物、关系角色，以及它们和阶段、系统之间的连接。", meta: `${(vault.categories.entities || 0) + (vault.categories["relationship-roles"] || 0)} 个人与关系页面` },
    { to: "/library", title: "全部知识", description: "浏览完整知识页面、金句和真实引用形成的关系网络。", meta: `${vault.pageCount} 条已有理解` },
  ];
  const recentChanges = today?.recentPages.slice(0, 4) || [];
  const repeatedQuotes = quotes?.groups.flatMap((group) => group.entries).filter((entry) => entry.confirmed).slice(0, 3) || [];
  return <div className="knowledge-home">
    <PageHero title="聊过的事，不会轻易散掉" description="我们慢慢形成的理解都留在这里。它们记得自己从哪里来，也随时等着被新的经历补充或纠正。" tone="tinted" aside={<HeroMetric value={vault.pageCount} label="条已有理解" detail={`来自 ${vault.sourceCount} 份生活记录`} />} />
    <section className="knowledge-groups">{groups.map((group) => <NavLink to={group.to} key={group.to}><div><h2>{group.title}</h2><p>{group.description}</p><small>{group.meta}</small></div><Icon name="arrow" size={18} /></NavLink>)}</section>
    {(recentChanges.length > 0 || repeatedQuotes.length > 0) && <section className="knowledge-pulse">
      <div className="knowledge-recent"><h2>最近更新</h2><div>{recentChanges.map((page) => <PageLink page={page} key={page.id}><span>{graphCategoryNames[page.category] || page.category}</span><b>{page.title}</b><time>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(page.modifiedAt))}</time></PageLink>)}</div></div>
      {repeatedQuotes.length > 0 && <aside><span>被反复引用的句子</span>{repeatedQuotes.map((entry) => <blockquote key={entry.title}><p>{entry.quote.replace(/^>\s*/gm, "").replace(/[*_`]/g, "")}</p><cite>{entry.source || entry.title}</cite></blockquote>)}</aside>}
    </section>}
    <section className="knowledge-next"><div><span>如果有哪里不太像你</span><h2>随时回来补充，或者直接纠正我</h2><p>我会分清生活记录、已有理解和新的推测，不把一种解释说成你的事实。</p></div><button type="button" className="primary-action" onClick={() => openContextAgent({ mode: "read" })}><Icon name="spark" size={16} />找我聊聊</button></section>
    <ContextualAgentDock revision={revision} context={{ scope: "已有理解", title: "全部知识", summary: `当前有 ${vault.pageCount} 条已有理解，来自 ${vault.sourceCount} 份生活记录。`, defaultMode: "read", launcherLabel: "一起往下想", suggestions: ["当前哪些理解证据最充分，哪些地方还需要我亲自补充？", "结合最近更新的内容，现在最值得继续聊什么？"] }} />
  </div>;
}

const skillGroupLabels: Record<string, { label: string; description: string }> = {
  build: { label: "构建知识", description: "把原始材料读成知识页面的规则" },
  common: { label: "共用能力", description: "被多条规则复用的判断标准与视角" },
  consume: { label: "读取与问答", description: "只读检索，不写入任何知识" },
};

function flattenSkillFiles(nodes: SkillTreeNode[]): SkillTreeNode[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node] : flattenSkillFiles(node.children || [])));
}

function findSkillNode(nodes: SkillTreeNode[], target: string): SkillTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === target) return node;
    const nested = node.children ? findSkillNode(node.children, target) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function AdvancedBuild({ revision }: { revision: number }) {
  const { data: tree, loading } = useApi<SkillTreeNode[]>("/api/build/skill-tree", revision);
  const { data: vault } = useApi<VaultInfo>("/api/vault", revision);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return window.localStorage.getItem("advanced-guide-dismissed") !== "1";
    } catch {
      return true;
    }
  });
  const requestedDir = params.get("dir") || "";
  const requestedFile = params.get("file") || "";
  const { data: file, loading: fileLoading, error: fileError } = useApi<SkillFileContent>(requestedFile ? `/api/build/skill-file?path=${encodeURIComponent(requestedFile)}` : "", revision);
  if (loading || !tree) return <Loading label="正在读取构建规则文件" />;

  const allFiles = flattenSkillFiles(tree);
  const treeGroups = tree.filter((node) => node.kind === "directory");
  const rootFiles = tree.filter((node) => node.kind === "file");
  const activeDir = findSkillNode(tree, requestedDir);
  const trimmedQuery = query.trim().toLocaleLowerCase();
  const listedFiles = trimmedQuery
    ? allFiles.filter((item) => `${item.path} ${item.skillName || ""}`.toLocaleLowerCase().includes(trimmedQuery))
    : activeDir?.children
      ? flattenSkillFiles(activeDir.children)
      : allFiles;
  const listTitle = trimmedQuery ? "搜索结果" : activeDir ? activeDir.skillName || activeDir.name : "全部规则文件";
  const listHint = trimmedQuery ? `在 ${allFiles.length} 个文件中匹配` : activeDir ? activeDir.path : "先从左侧选择一个规则，或直接搜索";

  function openDir(node: SkillTreeNode) {
    setExpanded((current) => (current.includes(node.path) ? current.filter((item) => item !== node.path) : [...current, node.path]));
    if (node.children?.some((child) => child.kind === "file")) setParams({ dir: node.path }, { replace: true });
    setQuery("");
  }
  function openFile(path: string) {
    setParams(requestedDir && !trimmedQuery ? { dir: requestedDir, file: path } : { file: path }, { replace: true });
  }
  function toggleChecked(path: string) {
    setChecked((current) => (current.includes(path) ? current.filter((item) => item !== path) : [...current, path]));
  }
  function dismissGuide() {
    setGuideOpen(false);
    try {
      window.localStorage.setItem("advanced-guide-dismissed", "1");
    } catch {
      /* ignore storage failures */
    }
  }

  const buildPrompt = checked.length
    ? `我想基于下面这些构建规则文件重新构建知识，请先只读地说明每个文件负责什么、会写入哪些知识页面，然后逐项确认我的目标，得到确认后才执行，并展示文件差异与质量检查结果：\n\n${checked.map((item) => `- ${item}`).join("\n")}`
    : "";
  const explainPrompt = file ? `请以只读方式解释构建规则文件 ${file.path}：它何时触发、读取哪些来源、写入哪些知识页面，以及有哪些安全边界。请用产品语言回答，不要修改任何文件。` : "";
  const adjustPrompt = file ? `我想调整构建规则文件 ${file.path}。请先解释它当前的行为和影响范围，再逐项询问我的目标；得到明确目标后才修改，并展示差异与质量检查结果。` : "";

  return <div className="advanced-page">
    <PageHero title="浏览并调整构建规则" description="这里是 The Way Here 当前使用的真实构建规则。先读懂一条规则做什么，再决定要不要调整它。" tone="tinted" aside={<div className={`advanced-status ${vault?.agentAvailable ? "ready" : "offline"}`}><i />{vault?.agentAvailable ? "Agent 已就绪" : "Agent 暂不可用"}<small>{allFiles.length} 个规则文件</small></div>} />

    {guideOpen
      ? <section className="skill-guide-bar" aria-labelledby="skill-guide-title">
        <div><span>怎么用这一页</span><h2 id="skill-guide-title">读懂规则，再决定改什么</h2></div>
        <ol><li><b>浏览文件</b><span>左侧按规则分组，中间列出文件，右侧显示原文</span></li><li><b>勾选范围</b><span>选中要一起处理的文件，可跨规则组合</span></li><li><b>交给 Agent</b><span>它先解释再确认，改动前会展示差异</span></li></ol>
        <button type="button" onClick={dismissGuide} aria-label="收起使用说明">知道了</button>
      </section>
      : <button type="button" className="skill-guide-reopen" onClick={() => setGuideOpen(true)}>怎么用这一页？</button>}

    <section className="skill-browser" aria-label="构建规则文件浏览器">
      <aside className="skill-tree-pane">
        <header><b>规则目录</b><span>{treeGroups.length} 个分组</span></header>
        <div>{treeGroups.map((group) => {
          const meta = skillGroupLabels[group.name];
          const isOpen = expanded.includes(group.path) || !expanded.length;
          return <section key={group.path}>
            <button type="button" className={`skill-tree-group ${isOpen ? "open" : ""}`} onClick={() => setExpanded((current) => (current.includes(group.path) ? current.filter((item) => item !== group.path) : [...current, group.path]))}>
              <span><b>{meta?.label || group.name}</b><small>{meta?.description || group.path}</small></span><em>{group.fileCount}</em>
            </button>
            {isOpen && <ul>{(group.children || []).filter((child) => child.kind === "directory").map((skill) => <li key={skill.path}>
              <button type="button" className={requestedDir === skill.path ? "active" : ""} onClick={() => openDir(skill)}>
                <span><b>{skill.skillName || skill.name}</b><small>{skill.name}</small></span><em>{skill.fileCount}</em>
              </button>
            </li>)}</ul>}
          </section>;
        })}
        {rootFiles.length > 0 && <ul className="skill-tree-loose">{rootFiles.map((item) => <li key={item.path}>
          <button type="button" className={requestedFile === item.path ? "active" : ""} onClick={() => openFile(item.path)}>
            <span><b>{item.name}</b><small>规则清单</small></span>
          </button>
        </li>)}</ul>}</div>
      </aside>

      <section className="skill-files-pane">
        <label><Icon name="search" size={16} /><input name="skill-file-search" autoComplete="off" aria-label="搜索全部构建规则文件" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索全部规则文件…" /></label>
        <header><div><b>{listTitle}</b><span>{listHint}</span></div><small>{listedFiles.length} 个文件</small></header>
        <div>{listedFiles.length
          ? listedFiles.map((item) => <div key={item.path} className={`skill-file-row ${requestedFile === item.path ? "active" : ""}`}>
            <input type="checkbox" id={`pick-${item.path}`} checked={checked.includes(item.path)} onChange={() => toggleChecked(item.path)} aria-label={`选择 ${item.path}`} />
            <button type="button" onClick={() => openFile(item.path)}>
              <b>{item.name}</b>
              <small>{item.skillName || item.path}</small>
              <time>{formatBytes(item.bytes)}</time>
            </button>
          </div>)
          : <Empty>没有匹配的规则文件。</Empty>}</div>
        {checked.length > 0 && <footer className="skill-files-selection">
          <span>已选 <b>{checked.length}</b> 个文件</span>
          <button type="button" onClick={() => setChecked([])}>清空</button>
          <button type="button" className="primary-action" onClick={() => openContextAgent({ mode: "write", prompt: buildPrompt })}>交给 Agent 处理 <Icon name="arrow" size={15} /></button>
        </footer>}
      </section>

      <article className="skill-preview-pane">
        {!requestedFile
          ? <Empty>选择一个文件，这里会显示它的原文。</Empty>
          : fileLoading
            ? <Loading label="正在读取文件" />
            : fileError || !file
              ? <Empty>{fileError || "无法读取这个文件"}</Empty>
              : <>
                <header>
                  <span>{file.path}</span>
                  <h2>{file.skillName || file.name}</h2>
                  {file.description && <p>{file.description}</p>}
                  <dl><div><dt>大小</dt><dd>{formatBytes(file.bytes)}</dd></div><div><dt>更新于</dt><dd>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(file.modifiedAt))}</dd></div></dl>
                </header>
                <pre>{file.content}</pre>
                <footer>
                  <button type="button" onClick={() => openContextAgent({ mode: "read", prompt: explainPrompt })}>让 Agent 解释</button>
                  <button type="button" className="primary-action" onClick={() => openContextAgent({ mode: "write", prompt: adjustPrompt })}>调整这条规则 <Icon name="arrow" size={15} /></button>
                </footer>
              </>}
      </article>
    </section>

    <section className="advanced-safety"><div><span>不确定规则是否健康？</span><h2>先运行只读检查，不修改任何知识内容</h2></div><button type="button" onClick={() => openContextAgent({ mode: "validate" })}>运行知识健康检查 <Icon name="arrow" size={16} /></button></section>
    <ContextualAgentDock revision={revision} context={{ scope: "高级构建", title: file ? `构建规则 ${file.name}` : "构建规则文件", summary: file ? `正在查看 ${file.path}。` : `共有 ${allFiles.length} 个构建规则文件，分布在 ${tree.length} 个分组中。`, defaultMode: "read", launcherLabel: "询问构建规则", suggestions: ["这些构建规则里，哪一条决定了我的近况回信怎么写？", "如果我想让知识页面更强调证据来源，应该调整哪条规则？"] }} />
  </div>;
}

function signalConversationPrompt(signal: StateSignal): string {
  return `我想从「${signal.name}」说起。现在的阶段性理解是：${signal.judgment}。之所以在此刻提起，是因为：${signal.reason || signal.observation}。请先区分已有证据、当前理解和仍然未知，再从最需要我亲自补充的地方开始，一次只问我一个具体问题。先陪我把事情说清楚，不要修改知识库。`;
}

function wikiConversationPrompt(prompt: ConversationPrompt): string {
  const evidence = prompt.links.map((link) => link.label).join("、");
  return `我想聊聊这个问题：“${prompt.question}”\n\n当前已有理解：${prompt.currentUnderstanding}\n为什么现在值得聊：${prompt.reason}\n仍然未知：${prompt.unknown}${evidence ? `\n相关知识：${evidence}` : ""}\n\n请先让我表达具体经历，再结合相关证据帮我理清线索；一次只问我一个具体问题，不要修改知识库。`;
}

function openLifeConversation(prompt: string): void {
  openContextAgent({ mode: "read", prompt });
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
  sourceHref?: string;
  sourceLabel?: string;
  basis: string[];
  weight?: number;
};

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
      sourceHref: evidence?.resolvedId ? pageHref(evidence.resolvedId) : undefined,
      sourceLabel: evidence?.resolvedId ? "看看依据" : undefined,
      basis: prompt.links.map((link) => link.label).filter(Boolean).slice(0, 2),
      weight: prompt.weight,
    };
  });
  const signalQuestions = data.focusCandidates.map((signal) => ({
    id: `signal:${signal.id}`,
    title: signal.name,
    question: signal.observation || `关于「${signal.name}」，你最想补充或纠正的是什么？`,
    currentUnderstanding: signal.judgment,
    reason: signal.reason || "这是一处仍在验证、需要回到你的真实经历中继续理解的地方。",
    unknown: signal.observation || "还不知道这条理解在你今天的生活里是否仍然成立。",
    agentPrompt: signalConversationPrompt(signal),
    sourceHref: `/focus/${encodeURIComponent(signal.id)}`,
    sourceLabel: "看看它从哪里来",
    basis: [signal.name, signal.kind].filter(Boolean),
    weight: 1,
  }));
  const journeyCluster = recentJourney?.clusters[0];
  const journeyQuestion = recentJourney && journeyCluster ? [{
    id: `journey:${journeyCluster.id}`,
    title: journeyCluster.title,
    question: journeyCluster.question,
    currentUnderstanding: `${recentJourney.transactionCount} 笔账单记录里，出现了 ${recentJourney.clusters.length} 段有时间顺序的生活线索。`,
    reason: "账单已经留下时间、地点与行动，但真正重要的人物、动机和感受只能由你说出来。",
    unknown: "当时和谁在一起、为什么出发，以及这段经历后来改变了什么。",
    agentPrompt: recentJourney.agentPrompt || `请从「${journeyCluster.title}」开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来，不要修改知识库。`,
    sourceHref: "/sources",
    sourceLabel: "看看相关记录",
    basis: ["近期账单", journeyCluster.title],
    weight: 2,
  }] : [];
  const candidates = [...wikiQuestions, ...journeyQuestion, ...(wikiQuestions.length ? [] : signalQuestions)];
  if (candidates.length) return stablePromptOrder(candidates, dailyPromptSeed());
  return [{
    id: "recent-moment",
    title: "从一件小事开始",
    question: "最近哪一件小事，让你觉得自己和平时有一点不一样？",
    currentUnderstanding: "这里还没有足够具体的记录，无法替你判断正在发生什么。",
    reason: "从一个真实片段开始，比先给自己下结论更容易找到线索。",
    unknown: "当时发生了什么、你在意什么，以及它为什么留在了心里。",
    agentPrompt: "我想从最近一件让我觉得自己和平时有一点不一样的小事开始。请一次只问我一个关于人物、处境、感受或判断的具体问题，先陪我说清楚，不要修改知识库。",
    basis: ["从最近发生的小事开始"],
  }];
}

export function Today({ revision }: { revision: number }) {
  const [importOpen, setImportOpen] = useState(false);
  const [importedJourney, setImportedJourney] = useState<PaymentJourneySummary>();
  const [questionOffset, setQuestionOffset] = useState(0);
  const [conversationDraft, setConversationDraft] = useState("");
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找回我们上次聊到的地方" />;
  if (error || !data) return <Empty>{error || "暂无数据"}</Empty>;
  const recentJourney = importedJourney || importBatches?.find((batch) => batch.journey)?.journey;
  const questions = talkingQuestions(data, recentJourney);
  const featuredQuestion = questions[questionOffset % questions.length]!;
  const importFolders = [...new Set((sourcePages || []).map((page) => cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const journeyPrompt = recentJourney
    ? `最近的账单记录里出现了 ${recentJourney.clusters.length} 段可能的生活旅程。交易只能说明时间、地点和发生过什么，不能说明人物、动机和感受。请从最有画面的一条线索开始，一次问我一个问题，先陪我把这段经历说出来，不要修改知识库。`
    : "";

  function beginConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openContextAgent({ mode: "read", prompt: conversationDraft.trim() || undefined });
  }

  function submitConversationOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitAgentInput({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <div className="home-overview">
      {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" initialRoute="files" onClose={() => setImportOpen(false)} onJourney={setImportedJourney} /> : null}
      <section className="home-intro-card" aria-labelledby="home-intro-title">
        <div className="home-intro-main">
          <span className="friend-mark" aria-hidden="true"><Icon name="message" size={22} /></span>
          <div>
            <div className="home-intro-identity"><h1 id="home-intro-title">The Way Here</h1><span>一个会越来越懂你的朋友</span></div>
            <p>我们聊得越多，我就越懂你。<br />你也可以把日记、聊天记录带给我看，帮我更快跟上你。</p>
          </div>
        </div>
        <div className="home-intro-ways">
          <button type="button" onClick={() => openContextAgent({ mode: "read" })}><Icon name="message" size={16} />和你聊天</button>
          <button type="button" aria-haspopup="dialog" onClick={() => setImportOpen(true)}><Icon name="library" size={16} />读你的日记</button>
          <button type="button" aria-haspopup="dialog" onClick={() => setImportOpen(true)}><Icon name="journal" size={16} />看你的记录</button>
        </div>
      </section>

      <section className="home-opener" aria-labelledby="home-opener-title">
        <div className="home-opener-copy">
          <span className="home-memory-label"><Icon name="message" size={17} />{featuredQuestion.title}</span>
          <h2 id="home-opener-title">{featuredQuestion.question}</h2>
        </div>
        <form className="home-opener-form" onSubmit={beginConversation}>
          <div>
            <textarea rows={1} aria-label="接着说" value={conversationDraft} onChange={(event) => setConversationDraft(event.target.value)} onKeyDown={submitConversationOnEnter} placeholder="是的，其实…" />
            <button type="submit" aria-label="发送" disabled={!conversationDraft.trim()}><Icon name="up" size={19} /></button>
          </div>
          {questions.length > 1 ? <button type="button" className="home-opener-cycle" onClick={() => setQuestionOffset((current) => current + 1)}><Icon name="refresh" size={16} />换个话头</button> : null}
        </form>
      </section>
      <ContextualAgentDock revision={revision} context={{ scope: "此刻 · 值得聊聊", title: featuredQuestion.question, summary: "你先说，我会记着相关的来路，也会坦白还有什么不知道。", defaultMode: "read", launcherLabel: "找我聊聊", compactLauncher: true, suggestions: [featuredQuestion.agentPrompt, journeyPrompt || "我想讲一件最近发生、但还没有说清楚的事。请一次问我一个具体问题，先陪我理解。"] }} />
    </div>
  );
}

export function QuestionsHub({ revision }: { revision: number }) {
  const [questionOffset, setQuestionOffset] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importedJourney, setImportedJourney] = useState<PaymentJourneySummary>();
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找出还想听你说的地方" />;
  if (error || !data) return <Empty>{error || "暂时没有可以继续聊的内容"}</Empty>;
  const recentJourney = importedJourney || importBatches?.find((batch) => batch.journey)?.journey;
  const questions = talkingQuestions(data, recentJourney);
  const featuredIndex = questionOffset % questions.length;
  const featuredQuestion = questions[featuredIndex]!;
  const otherQuestions = questions.filter((question) => question.id !== featuredQuestion.id);
  const concernQuestions = otherQuestions.slice(0, 5);
  const importFolders = [...new Set((sourcePages || []).map((page) => cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));

  return <div className="questions-hub">
    {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" initialRoute="files" onClose={() => setImportOpen(false)} onJourney={setImportedJourney} /> : null}
    <header className="questions-intro">
      <span>值得聊聊</span>
      <h1>这段时间你说的话，我都还记得。</h1>
      <p>把散在日记和对话里的几件事拢了拢，先说哪一个都行。</p>
    </header>

    <section className="questions-spotlight" aria-labelledby="questions-featured-title">
      <div className="questions-spotlight-meta">
        <div><span className="friend-mark" aria-hidden="true"><Icon name="message" size={19} /></span><span className="questions-origin">{featuredQuestion.title}</span></div>
        {questions.length > 1 ? <div className="questions-position" aria-label={`第 ${featuredIndex + 1} 个话题，共 ${questions.length} 个`}>
          {questions.length > 6 ? <span className="questions-position-count">{featuredIndex + 1} / {questions.length}</span> : questions.map((question, index) => <button key={question.id} type="button" className={index === featuredIndex ? "active" : ""} aria-label={`查看第 ${index + 1} 个话题`} aria-current={index === featuredIndex ? "true" : undefined} onClick={() => setQuestionOffset(index)} />)}
        </div>
        : null}
      </div>
      <h2 id="questions-featured-title">{featuredQuestion.question}</h2>
      <p>{featuredQuestion.reason}</p>
      <div className="questions-spotlight-actions">
        <button type="button" className="primary-action" onClick={() => openLifeConversation(featuredQuestion.agentPrompt)}>跟你聊聊这个 <Icon name="arrow" size={16} /></button>
        {questions.length > 1 ? <button type="button" onClick={() => setQuestionOffset((current) => current + 1)}><Icon name="refresh" size={16} />换一个话题</button> : null}
        {featuredQuestion.sourceHref ? <NavLink to={featuredQuestion.sourceHref} state={{ returnTo: "/questions", returnLabel: "返回值得聊聊" }}>{featuredQuestion.sourceLabel || "看看依据"}</NavLink> : null}
      </div>
    </section>

    {concernQuestions.length ? <section className="questions-concerns" aria-labelledby="questions-concerns-title">
      <h2 id="questions-concerns-title">你之前有点在意的</h2>
      <div>{concernQuestions.map((question) => <button key={question.id} type="button" onClick={() => openLifeConversation(question.agentPrompt)}>{question.title}</button>)}</div>
    </section> : null}

    <section className="questions-import" aria-labelledby="questions-import-title">
      <div className="questions-import-copy">
        <div className="questions-import-types"><span><Icon name="journal" size={14} />日记</span><span><Icon name="message" size={14} />对话</span><span><Icon name="receipt" size={14} />账单</span></div>
        <div><h2 id="questions-import-title">日记、对话和账单，都可以带进来</h2><p>留下原话，让之后的问题更具体——不用替我总结，原样丢给我就好。</p></div>
      </div>
      <button type="button" className="primary-action" onClick={() => setImportOpen(true)} aria-haspopup="dialog">带进来 <Icon name="arrow" size={16} /></button>
    </section>
    <ContextualAgentDock revision={revision} context={{ scope: "值得聊聊", title: featuredQuestion.question, summary: "我会一次提出一个具体问题，并说明已有理解与仍然未知。", defaultMode: "read", launcherLabel: "继续聊", compactLauncher: true, suggestions: [featuredQuestion.agentPrompt, "我觉得这里有一条理解不符合我。请先让我说明哪里不准确，再帮我找可能的反例。"] }} />
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

export function GrowthHub({ revision }: { revision: number }) {
  const personalLines = useApi<StructuredCard[]>("/api/views/cards/personal-lines", revision);
  const cycles = useApi<StructuredCard[]>("/api/views/cards/cycles", revision);
  const systems = useApi<StructuredCard[]>("/api/views/cards/systems", revision);
  const models = useApi<SectionedPageView>("/api/views/mental-models", revision);
  if (personalLines.loading || cycles.loading || systems.loading || models.loading) return <Loading label="正在把经历整理成可用的理解路径" />;
  const modelSections = models.data?.sections.filter((section) => /^[一二三四五六七]、/.test(section.heading)) || [];
  const routes = [
    { to: "/cards/personal-lines", title: "个人主线", question: "这一生反复在解决什么？", note: "从跨越阶段的长期命题理解选择。", items: personalLines.data || [] },
    { to: "/cards/cycles", title: "反复循环", question: "为什么明明知道，还是会重来？", note: "辨认触发、惯性反应、代价与中断方式。", items: cycles.data || [] },
    { to: "/cards/systems", title: "现实系统", question: "今天的生活是怎样共同运行的？", note: "把职业、家庭、身体、资产和注意力放在一起看。", items: systems.data || [] },
    { to: "/mental-models", title: "思维模型", question: "现在可以借用哪一种判断工具？", note: "用边界、反例和校准来减少误判。", items: modelSections.map((section, index) => ({ id: String(index), title: section.heading.replace(/^[一二三四五六七]、/, ""), excerpt: section.body.slice(0, 90), sections: [] })) },
  ];
  return <div className="growth-hub">
    <PageHeader title="理解自己，不是给自己下结论" description="从眼下的问题出发，选择一种观察角度。每个判断都能继续回到经历、原文和不确定之处。" />
    <div className="growth-route-map">
      {routes.map((route) => <section className="growth-route" key={route.to}>
        <div className="route-sign"><div><h2>{route.question}</h2><p>{route.note}</p></div></div>
        <div className="route-preview">
          <div><b>{route.title}</b><span>{route.items.length} 个入口</span></div>
          <ul>{route.items.slice(0, 3).map((item) => <li key={item.id}>{item.title}</li>)}</ul>
          <NavLink to={route.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>进入这条路径 <Icon name="arrow" size={16} /></NavLink>
        </div>
      </section>)}
    </div>
    <section className="growth-note"><h2>看见之后，不急着变好</h2><p>这个产品不把成长换算成分数、连续天数或完成率。更重要的是：你能否更准确地描述发生了什么，辨认旧模式，并带着一个更好的问题回到生活。</p><button className="inline-agent-hint" onClick={() => openContextAgent()}>帮我寻找问题 <Icon name="arrow" size={16} /></button></section>
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
