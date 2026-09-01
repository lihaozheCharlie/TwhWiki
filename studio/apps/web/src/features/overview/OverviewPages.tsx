import React, { useRef, useState } from "react";
import { NavLink, useParams, useSearchParams } from "react-router-dom";
import type { ConversationPrompt, FocusWorkspaceView, GraphData, PaymentJourneySummary, SectionedPageView, SkillFileContent, SkillTreeNode, SourceImportBatch, StateSignal, StructuredCard, TodayView, VaultInfo, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../api";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent, shouldSubmitAgentInput } from "../collaboration/model";
import { cleanSourcePath, ImportMaterialsModal } from "../sources/Sources";
import { graphCategoryNames } from "../../app/config";
import { PageLink, pageHref, useReturnContext } from "../../shared/routing";
import { Empty, Icon, Loading, PageHeader, PageHero, ParentBack } from "../../shared/ui";
import { dailyPromptSeed, stablePromptOrder } from "./conversation-prompts";
import { UnderstandingBanner, UnderstandingGlyph } from "../knowledge/UnderstandingLayout";

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
    { to: "/library", tone: "all" as const, title: "全部资料", description: "一起检索已有知识与构建规则，随时回到结论的来源和形成方式。", count: vault.pageCount, label: "条已有理解" },
  ];
  return <div className="knowledge-home understanding-overview">
    <header className="understanding-overview-lede">
      <h1>已有理解</h1>
      <p>这里汇总系统从你的生活记录中持续读出的四类内容：关于你自己的判断、关于人生的轨迹、关于身边人的记录，以及支撑这些理解的知识与构建规则。</p>
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
    <ContextualAgentDock revision={revision} context={{ scope: "已有理解", title: "全部资料", summary: `当前有 ${vault.pageCount} 条已有理解，来自 ${vault.sourceCount} 份生活记录。`, defaultMode: "read", launcherLabel: "一起往下想", suggestions: ["当前哪些理解证据最充分，哪些地方还需要我亲自补充？", "结合最近更新的内容，现在最值得继续聊什么？"] }} />
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

  return <div className="advanced-page understanding-advanced-page">
    <UnderstandingBanner tone="all" title="构建规则" description="这里是 The Way Here 当前使用的真实规则。先读懂一条规则会读取什么、写入哪里，再决定是否调整。" count={allFiles.length} countLabel="个规则文件">
      <span className={`understanding-agent-status ${vault?.agentAvailable ? "ready" : "offline"}`}><i />{vault?.agentAvailable ? "Agent 已就绪" : "Agent 暂不可用"}</span>
    </UnderstandingBanner>

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
  { id: "stayed-in-mind", question: "今天过去以后，哪一个瞬间还留在你心里？", agentPrompt: "我想说说今天过去以后还留在心里的一个瞬间。请接着我的回答问细节，不要急着分析或总结。" },
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
      sourceHref: evidence?.resolvedId ? pageHref(evidence.resolvedId) : undefined,
      sourceLabel: evidence?.resolvedId ? "看看依据" : undefined,
      basis: prompt.links.map((link) => link.label).filter(Boolean).slice(0, 2),
      kind: "understanding" as const,
      evidenceCount: prompt.links.filter((link) => link.resolvedId).length || prompt.links.length,
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
    kind: "state" as const,
    evidenceCount: signal.links.filter((link) => link.resolvedId).length || signal.links.length,
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
    agentPrompt: "我想从最近一件让我觉得自己和平时有一点不一样的小事开始。请一次只问我一个关于人物、处境、感受或判断的具体问题，先陪我说清楚，不要修改知识库。",
    basis: ["从最近发生的小事开始"],
    kind: "casual",
    evidenceCount: 0,
  }];
}

export function Today({ revision }: { revision: number }) {
  const [importOpen, setImportOpen] = useState(false);
  const [importedJourney, setImportedJourney] = useState<PaymentJourneySummary>();
  const [questionOffset, setQuestionOffset] = useState(0);
  const [conversationDraft, setConversationDraft] = useState("");
  const conversationInputRef = useRef<HTMLTextAreaElement>(null);
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找回我们上次聊到的地方" />;
  if (error || !data) return <Empty>{error || "暂无数据"}</Empty>;
  const recentJourney = importedJourney || importBatches?.find((batch) => batch.journey)?.journey;
  const openers = stablePromptOrder([...todayOpeners], dailyPromptSeed());
  const featuredQuestion = openers[questionOffset % openers.length]!;
  const importFolders = [...new Set((sourcePages || []).map((page) => cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const journeyPrompt = recentJourney
    ? `最近的账单记录里出现了 ${recentJourney.clusters.length} 段可能的生活旅程。交易只能说明时间、地点和发生过什么，不能说明人物、动机和感受。请从最有画面的一条线索开始，一次问我一个问题，先陪我把这段经历说出来，不要修改知识库。`
    : "";

  function beginConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = conversationDraft.trim();
    if (!answer) return;
    openContextAgent({ mode: "read", prompt: `${featuredQuestion.agentPrompt}\n\n我先说：${answer}` });
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
            <button type="button" className="home-opener-cycle" onClick={cycleOpener}><Icon name="refresh" size={16} />换一个随口的话头</button>
            <span>我会接着问细节</span>
          </div>
        </form>
      </section>
      <ContextualAgentDock revision={revision} context={{ scope: "此刻 · 值得聊聊", title: featuredQuestion.question, summary: "你先说，我会记着相关的来路，也会坦白还有什么不知道。", defaultMode: "read", launcherLabel: "找我聊聊", compactLauncher: true, suggestions: [featuredQuestion.agentPrompt, journeyPrompt || "我想讲一件最近发生、但还没有说清楚的事。请一次问我一个具体问题，先陪我理解。"] }} />
    </div>
  );
}

export function QuestionsHub({ revision }: { revision: number }) {
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

  return <div className="questions-hub">
    {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" initialRoute="files" onClose={() => setImportOpen(false)} onJourney={setImportedJourney} /> : null}
    <header className="questions-intro">
      <span>值得聊聊</span>
      <h1>这段时间你说的话，我都还记得。</h1>
      <p>挑一个你现在想说的，或者看看我留意到的几条线索。</p>
    </header>

    <section className="questions-wall" aria-labelledby="questions-wall-title">
      <div className="questions-wall-head">
        <div><h2 id="questions-wall-title">挑一个话题</h2><p>每个问题都来自一条还没有说完的线索。</p></div>
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
              <button type="button" onClick={() => openLifeConversation(question.agentPrompt)}>聊聊这个 <Icon name="arrow" size={15} /></button>
              {question.sourceHref ? <NavLink to={question.sourceHref} state={{ returnTo: "/questions", returnLabel: "返回值得聊聊" }}>{question.sourceLabel || "查看依据"}</NavLink> : null}
            </footer>
          </article>;
        })}
      </div> : <div className="questions-wall-empty"><b>这一类还没有话题</b><p>换个分类看看，或者带进一份新的生活记录。</p></div>}
      {wallQuestions.length > topicCards.length ? <button type="button" className="questions-wall-more" onClick={() => setTopicLimit((current) => current + 6)}>再看 {Math.min(6, wallQuestions.length - topicCards.length)} 个话题 <Icon name="down" size={15} /></button> : null}
    </section>

    {concernQuestions.length ? <section className="questions-concerns" aria-labelledby="questions-concerns-title">
      <div className="questions-concerns-head"><h2 id="questions-concerns-title">你之前有点在意的</h2><i aria-hidden="true" /></div>
      <div>{concernQuestions.map((question) => <button key={question.id} type="button" onClick={() => openLifeConversation(question.agentPrompt)}>{question.title}</button>)}</div>
    </section> : null}

    <section className="questions-import" aria-labelledby="questions-import-title">
      <div className="questions-import-copy">
        <div className="questions-import-types"><span><Icon name="journal" size={14} />日记</span><span><Icon name="message" size={14} />对话</span><span><Icon name="receipt" size={14} />账单</span></div>
        <div><h2 id="questions-import-title">日记、对话和账单，都可以带进来</h2><p>留下原话，让之后的问题更具体——不用替我总结，原样丢给我就好。</p></div>
      </div>
      <button type="button" className="primary-action" onClick={() => setImportOpen(true)} aria-haspopup="dialog">带进来 <Icon name="arrow" size={16} /></button>
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

export function GrowthHub({ revision }: { revision: number }) {
  const personalLines = useApi<StructuredCard[]>("/api/views/cards/personal-lines", revision);
  const cycles = useApi<StructuredCard[]>("/api/views/cards/cycles", revision);
  const systems = useApi<StructuredCard[]>("/api/views/cards/systems", revision);
  const models = useApi<SectionedPageView>("/api/views/mental-models", revision);
  if (personalLines.loading || cycles.loading || systems.loading || models.loading) return <Loading label="正在把经历整理成可用的理解路径" />;
  const modelSections = models.data?.sections.filter((section) => /^[一二三四五六七]、/.test(section.heading)) || [];
  const routes: Array<{ to: string; key: string; title: string; note: string; items: StructuredCard[] }> = [
    { to: "/cards/personal-lines", key: "personal-lines", title: "个人主线", note: "跨越不同阶段，反复出现的长期命题。", items: personalLines.data || [] },
    { to: "/cards/cycles", key: "cycles", title: "反复循环", note: "触发、惯性反应、代价与有效的中断方式。", items: cycles.data || [] },
    { to: "/cards/systems", key: "systems", title: "现实系统", note: "职业、家庭、身体、资产和注意力如何共同运行。", items: systems.data || [] },
    { to: "/mental-models", key: "mental-models", title: "思维模型", note: "带着边界、反例和校准使用的判断工具。", items: modelSections.map((section, index) => ({ id: String(index), title: section.heading.replace(/^[一二三四五六七]、/, ""), excerpt: section.body.slice(0, 120), sections: [] })) },
  ];
  const total = routes.reduce((sum, route) => sum + route.items.length, 0);
  const datedItems = routes.flatMap((route) => route.items.map((item) => ({ ...item, route }))).filter((item) => item.updatedAt).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const focus = datedItems[0] || routes.flatMap((route) => route.items.map((item) => ({ ...item, route })))[0];
  const focusHref = focus ? `${focus.route.to}${focus.route.key === "mental-models" ? "" : `?item=${encodeURIComponent(focus.id)}`}` : "/insights";
  return <div className="growth-hub understanding-self-page">
    <UnderstandingBanner tone="self" title="理解自己" description="这里不是一组给你下结论的标签，而是能够回到经历、证据与反例继续修正的判断。" count={total} countLabel="条判断与模型" />
    {focus ? <section className="understanding-focus">
      <div className="understanding-focus-main">
        <span>最近变化</span>
        <h2><NavLink to={focusHref} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>{focus.title}</NavLink></h2>
        <p>{focus.excerpt}</p>
        <div>{focus.sections.slice(0, 3).map((section) => <span key={section.heading}>{section.heading}</span>)}<span>{focus.route.title}</span></div>
      </div>
      <aside><b>这条理解怎样形成</b><ol>{focus.sections.slice(0, 3).map((section) => <li key={section.heading}><span>{section.heading}</span><p>{section.body.slice(0, 72)}</p></li>)}</ol>{!focus.sections.length ? <p>打开原文，可以继续核对它的来源、边界与反例。</p> : null}</aside>
    </section> : null}
    <div className="understanding-row-groups">
      {routes.map((route) => <section className="understanding-row-group" key={route.to}>
        <header><div><h2>{route.title}</h2><p>{route.note}</p></div><NavLink to={route.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {route.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
        <div>{route.items.slice(0, 4).map((item) => <NavLink className="understanding-row" key={item.id} to={`${route.to}${route.key === "mental-models" ? "" : `?item=${encodeURIComponent(item.id)}`}`} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>
          <span>{route.title}</span><div><b>{item.title}</b><p>{item.excerpt}</p></div><time>{item.updatedAt ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(item.updatedAt)) : `${item.sections.length} 个切面`}</time>
        </NavLink>)}</div>
      </section>)}
    </div>
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
