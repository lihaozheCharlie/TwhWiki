import React, { useState } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { FocusWorkspaceView, GraphData, LifeMapView, QuotesView, ReasoningLens, SectionedPageView, SkillFileContent, SkillTreeNode, StateSignal, StructuredCard, TodayView, VaultInfo, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../api";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { LifeStageRoute } from "../knowledge/LifeStageRoute";
import { graphCategoryNames } from "../../app/config";
import { PageLink, pageHref, useReturnContext } from "../../shared/routing";
import { Empty, Icon, Loading, PageHeader, PageHero, HeroMetric, ParentBack } from "../../shared/ui";

export function KnowledgeHome({ revision }: { revision: number }) {
  const { data: vault, loading } = useApi<VaultInfo>("/api/vault", revision);
  const { data: today } = useApi<TodayView>("/api/views/today", revision);
  const { data: quotes } = useApi<QuotesView>("/api/views/quotes", revision);
  if (loading || !vault) return <Loading label="正在整理我的知识" />;
  const groups = [
    { to: "/insights", title: "理解自己", description: "个人主线、反复循环、现实系统与思维模型。", meta: `${(vault.categories["personal-lines"] || 0) + (vault.categories.cycles || 0) + (vault.categories.systems || 0) + (vault.categories["mental-models"] || 0)} 个知识页面` },
    { to: "/timeline", title: "回看人生", description: "沿着主线与并行人生线，回到不同阶段的处境、转折与证据。", meta: `${vault.categories["life-stages"] || 0} 个人生阶段` },
    { to: "/letters", title: "近况回信", description: "按写信时间或生命主题，重新听见过去与此刻之间的回应。", meta: `${vault.categories.letters || 0} 封回信` },
    { to: "/relationships", title: "人与世界", description: "人物、关系角色，以及它们和阶段、系统之间的连接。", meta: `${(vault.categories.entities || 0) + (vault.categories["relationship-roles"] || 0)} 个人与关系页面` },
    { to: "/library", title: "全部知识", description: "浏览完整知识页面、金句和真实引用形成的关系网络。", meta: `${vault.pageCount} 个构建结果` },
  ];
  const recentChanges = today?.recentPages.slice(0, 4) || [];
  const repeatedQuotes = quotes?.groups.flatMap((group) => group.entries).filter((entry) => entry.confirmed).slice(0, 3) || [];
  return <div className="knowledge-home">
    <PageHero title="从记录中，长出理解" description="这里展示经过构建的知识。每个判断都应该能回到原始材料，每次更新都应该保留不确定性。" tone="tinted" aside={<HeroMetric value={vault.pageCount} label="个知识页面" detail={`来自 ${vault.sourceCount} 份原始材料`} />} />
    <section className="knowledge-groups">{groups.map((group) => <NavLink to={group.to} key={group.to}><div><h2>{group.title}</h2><p>{group.description}</p><small>{group.meta}</small></div><Icon name="arrow" size={18} /></NavLink>)}</section>
    {(recentChanges.length > 0 || repeatedQuotes.length > 0) && <section className="knowledge-pulse">
      <div className="knowledge-recent"><h2>最近更新</h2><div>{recentChanges.map((page) => <PageLink page={page} key={page.id}><span>{graphCategoryNames[page.category] || page.category}</span><b>{page.title}</b><time>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(page.modifiedAt))}</time></PageLink>)}</div></div>
      {repeatedQuotes.length > 0 && <aside><span>被反复引用的句子</span>{repeatedQuotes.map((entry) => <blockquote key={entry.title}><p>{entry.quote.replace(/^>\s*/gm, "").replace(/[*_`]/g, "")}</p><cite>{entry.source || entry.title}</cite></blockquote>)}</aside>}
    </section>}
    <section className="knowledge-next"><div><span>继续沿着知识工作</span><h2>带着一个真实问题进入</h2><p>Agent 会区分原始材料、已有知识和新的推断，不把解释伪装成事实。</p></div><NavLink className="primary-action" to="/workbench?mode=read"><Icon name="spark" size={16} />与知识共创</NavLink></section>
    <ContextualAgentDock revision={revision} context={{ scope: "我的知识", title: "全部构建知识", summary: `当前有 ${vault.pageCount} 个知识页面，来自 ${vault.sourceCount} 份原始材料。`, defaultMode: "read", launcherLabel: "询问我的知识", suggestions: ["当前知识结构中，哪些部分证据最充分，哪些仍然缺少原始材料？", "结合最近更新的知识，我现在最值得继续追问什么？"] }} />
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
          <NavLink className="primary-action" to={`/workbench?mode=write&prompt=${encodeURIComponent(buildPrompt)}`}>交给 Agent 处理 <Icon name="arrow" size={15} /></NavLink>
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
                  <NavLink to={`/workbench?mode=read&prompt=${encodeURIComponent(explainPrompt)}`}>让 Agent 解释</NavLink>
                  <NavLink className="primary-action" to={`/workbench?mode=write&prompt=${encodeURIComponent(adjustPrompt)}`}>调整这条规则 <Icon name="arrow" size={15} /></NavLink>
                </footer>
              </>}
      </article>
    </section>

    <section className="advanced-safety"><div><span>不确定规则是否健康？</span><h2>先运行只读检查，不修改任何知识内容</h2></div><NavLink to="/workbench?mode=validate">运行知识健康检查 <Icon name="arrow" size={16} /></NavLink></section>
    <ContextualAgentDock revision={revision} context={{ scope: "高级构建", title: file ? `构建规则 ${file.name}` : "构建规则文件", summary: file ? `正在查看 ${file.path}。` : `共有 ${allFiles.length} 个构建规则文件，分布在 ${tree.length} 个分组中。`, defaultMode: "read", launcherLabel: "询问构建规则", suggestions: ["这些构建规则里，哪一条决定了我的近况回信怎么写？", "如果我想让知识页面更强调证据来源，应该调整哪条规则？"] }} />
  </div>;
}

export function Today({ revision }: { revision: number }) {
  const navigate = useNavigate();
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: lifeMap } = useApi<LifeMapView>("/api/views/life-map", revision);
  const personalLines = useApi<StructuredCard[]>("/api/views/cards/personal-lines", revision);
  const { data: vault } = useApi<VaultInfo>("/api/vault", revision);
  const { data: quotes } = useApi<QuotesView>("/api/views/quotes", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: lenses } = useApi<ReasoningLens[]>("/api/lenses", revision);
  if (loading || personalLines.loading) return <Loading label="正在整理你的知识概览" />;
  if (error || !data) return <Empty>{error || "暂无数据"}</Empty>;
  const displayedCurrentStages = data.currentStages.length ? data.currentStages : data.currentStage ? [{ page: data.currentStage, range: [data.currentStage.start, data.currentStage.end].filter(Boolean).join(" — ") || "当前阶段", focus: data.currentStage.excerpt, lane: 0 }] : [];
  const currentStage = displayedCurrentStages[0];
  const identityLine = personalLines.data?.find((card) => /成为.*人|什么样的人|我是谁/.test(card.title)) || personalLines.data?.[0];
  const strengthLine = personalLines.data?.find((card) => card.id !== identityLine?.id && /优势|擅长|能力|长处|判断力|系统/.test(card.title)) || personalLines.data?.find((card) => /优势|擅长|能力|长处|判断力|系统/.test(card.title));
  const strengthSignal = data.stateSignals.find((signal) => /优势|擅长|能力|长处/.test(`${signal.kind} ${signal.name} ${signal.judgment}`));
  const portraitCards = [
    { label: "我是谁", title: identityLine?.title || "从走过的路里，看见自己的长期主线", excerpt: identityLine?.excerpt || "把跨越不同阶段仍然反复出现的选择与在意，整理成可继续验证的理解。", to: identityLine ? `/cards/personal-lines?item=${encodeURIComponent(identityLine.id)}` : "/insights" },
    { label: "我的优势", title: strengthLine?.title || strengthSignal?.name || "优势不是标签，而是反复奏效的能力", excerpt: strengthLine?.excerpt || strengthSignal?.judgment || "从真实经历中识别你在什么情境下做得更好，以及这些能力如何被继续使用。", to: strengthLine ? `/cards/personal-lines?item=${encodeURIComponent(strengthLine.id)}` : "/insights" },
    { label: "我的人生阶段", title: currentStage?.page.title || "看见自己正走到哪里", excerpt: currentStage?.focus || "把时间、重要事件与变化放在一起，理解当前阶段正在形成的生活重心。", to: currentStage ? pageHref(currentStage.page.id) : "/timeline" },
    { label: "最近的我", title: data.latestLetter?.title || "给此刻留一封能够回看的信", excerpt: data.latestLetter?.excerpt || "让最近发生的事情有上下文，也让未来的你能够看见今天的感受与判断。", to: data.latestLetter ? pageHref(data.latestLetter.id) : "/letters" },
  ];
  const recent = (sourcePages || []).slice().sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)).slice(0, 4);
  const personalQuotes = quotes?.groups.flatMap((group) => group.entries).filter((entry) => entry.confirmed).slice(0, 3) || [];
  const countText = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
  const letterCount = vault?.categories.letters || 0;
  const peopleCount = vault?.categories.entities || 0;
  const stageCount = lifeMap?.stages.length || vault?.categories["life-stages"] || 0;
  const knowledgeMetric = [
    `${countText(stageCount)} 个阶段`,
    peopleCount > 0 ? `${countText(peopleCount)} 个人物` : null,
    `${countText(vault?.pageCount || 0)} 个知识页面`,
  ].filter(Boolean).join(" · ");
  const hasMaterial = (vault?.sourceCount || 0) > 0;
  const buildSteps = [
    { to: "/sources", title: "导入你的材料", detail: "日记、AI 对话记录、聊天记录，原文始终保留，可随时回看。", metric: hasMaterial ? `${countText(vault!.sourceCount)} 份原始材料` : "还没有材料", action: hasMaterial ? "继续导入" : "从这里开始" },
    { to: "/knowledge", title: "解析成结构化的你", detail: "识别人生阶段、反复出现的模式、关系网络与现实系统，每个判断都链回原文。", metric: hasMaterial ? knowledgeMetric : "等待第一份材料", action: "浏览构建结果" },
    { to: "/letters", title: "收到对近况的回应", detail: "把一段时间的材料读完之后，写成一封回信；也可以换一种思考方式重读。", metric: letterCount > 0 ? `${countText(letterCount)} 封回信` : "尚未生成回信", action: "读近况回信" },
  ];
  const featuredLenses = (lenses || []).slice(0, 4);
  const lensPrompt = (lens: ReasoningLens) => `请用「${lens.displayName}」的思考方式，重读我最近的近况与相关材料。这个视角特别关注：${lens.attention}。请只依据我知识库里的原始材料和已有判断来回答，指出我自己可能忽略的地方，并说明每一条判断来自哪些证据。不要替我下结论。`;
  return (
    <div className="home-overview">
      <section className="home-intro">
        <div className="home-intro-copy">
          <span>个人知识库</span>
          <h1>走过的路，会成为更了解自己的方式。</h1>
          <div className="home-intro-description">
            <p>你留下的每一段文字，都在讲述你是如何走到今天的。</p>
            <p>The Way Here把散落的日记与对话，整理成你的人生脉络，并写给此刻的你。</p>
          </div>
          <div className="home-intro-actions">{hasMaterial
            ? <><NavLink className="primary-action" to="/knowledge">浏览我的知识 <Icon name="arrow" size={16} /></NavLink><NavLink to="/sources">导入新材料</NavLink></>
            : <><NavLink className="primary-action" to="/sources">导入我的材料 <Icon name="arrow" size={16} /></NavLink><NavLink to="/knowledge">先看看会构建出什么</NavLink></>}</div>
        </div>
        <aside className="home-now-panel">
          <span>你正在这里</span>
          {currentStage ? <NavLink className="home-now-stage" to={pageHref(currentStage.page.id)} state={{ returnTo: "/", returnLabel: "返回此刻" }}>
            <time>{currentStage.range}</time><h2>{currentStage.page.title}</h2><p>{currentStage.focus}</p><b>回到这个阶段 <Icon name="arrow" size={15} /></b>
          </NavLink> : <div className="home-now-stage"><h2>从一段经历开始</h2><p>加入新的记录后，这里会逐渐形成你正在经历的人生阶段。</p></div>}
          {data.latestLetter && <NavLink className="home-now-letter" to={pageHref(data.latestLetter.id)} state={{ returnTo: "/", returnLabel: "返回此刻" }}><span>最近一封回信</span><b>{data.latestLetter.title}</b><Icon name="arrow" size={14} /></NavLink>}
        </aside>
        {vault && <footer className="home-now-ledger"><span><b>{new Intl.NumberFormat("zh-CN").format(vault.sourceCount)}</b> 份原始材料</span><i aria-hidden="true" /><span><b>{new Intl.NumberFormat("zh-CN").format(vault.pageCount)}</b> 个知识页面</span><em>每个判断都能回到原文</em></footer>}
      </section>

      <section className="home-build-flow" aria-labelledby="home-flow-title">
        <header><span>它怎么工作</span><h2 id="home-flow-title">从原始记录，到能回答你的知识</h2></header>
        <ol>{buildSteps.map((step) => <li key={step.to}>
          <NavLink to={step.to} state={{ returnTo: "/", returnLabel: "返回此刻" }}>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
            <em>{step.metric}</em>
            <b>{step.action} <Icon name="arrow" size={14} /></b>
          </NavLink>
        </li>)}</ol>
      </section>

      {featuredLenses.length > 0 && <section className="home-lenses" aria-labelledby="home-lenses-title">
        <header>
          <div><span>名人回信</span><h2 id="home-lenses-title">换一个人的思考方式，重读你的经历</h2><p>这些视角不会替你增加事实，只改变提问的角度。选一个视角，它会带着自己惯常关注的东西，重新读一遍你的材料。</p></div>
          <NavLink to="/letters">读全部近况回信 <Icon name="arrow" size={15} /></NavLink>
        </header>
        <div className="home-lens-grid">{featuredLenses.map((lens) => <NavLink key={lens.id} className="home-lens-card" to={`/workbench?mode=read&prompt=${encodeURIComponent(lensPrompt(lens))}`}>
          <h3>{lens.displayName}</h3>
          <p>{lens.attention}</p>
          {lens.signals.length > 0 && <ul>{lens.signals.slice(0, 3).map((signal) => <li key={signal}>{signal}</li>)}</ul>}
          <b>用这个视角重读 <Icon name="arrow" size={14} /></b>
        </NavLink>)}</div>
      </section>}

      {lifeMap?.stages.length ? <section className="home-life-route" aria-labelledby="home-trail-title"><header><div><span>你的轨迹</span><h2 id="home-trail-title">一条主线，也有同时生长的人生</h2><p>主线记录依次发生的阶段；家庭与其他长期身份会在对应时间点分岔并行。</p></div><NavLink to="/timeline">完整回看人生 <Icon name="arrow" size={15} /></NavLink></header><LifeStageRoute compact stages={lifeMap.stages} selectedId={currentStage?.page.id} ariaLabel="首页人生阶段轨迹" onSelect={(id) => navigate(`/timeline?stage=${encodeURIComponent(id)}`)} /></section> : null}

      <section className="home-portrait" aria-labelledby="portrait-title">
        <header><div><h2 id="portrait-title">知识库现在怎么理解你</h2><p>这不是固定标签，而是阶段性的理解，随着材料增加会被修正。每一项都能回到原文。</p></div><NavLink to="/knowledge">查看完整知识 <Icon name="arrow" size={15} /></NavLink></header>
        <div className="home-portrait-grid">{portraitCards.map((card) => <NavLink key={card.label} to={card.to} state={{ returnTo: "/", returnLabel: "返回此刻" }} className="home-portrait-card"><span>{card.label}</span><h3>{card.title}</h3><p>{card.excerpt}</p><Icon name="arrow" size={17} /></NavLink>)}</div>
      </section>
      {(recent.length > 0 || personalQuotes.length > 0) && <section className="home-library-glimpse">
        <div className="home-recent"><header><h2>最近加入的材料</h2><NavLink to="/sources">全部材料</NavLink></header><div>{recent.map((page) => <PageLink page={page} key={page.id}><span><b>{page.title}</b><time>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(page.modifiedAt))}</time></span><p>{page.excerpt}</p></PageLink>)}</div></div>
        {personalQuotes.length > 0 && <aside><h2>你自己写过的话</h2>{personalQuotes.map((entry) => <blockquote key={entry.title}><p>{entry.quote.replace(/^>\s*/gm, "").replace(/[*_`]/g, "")}</p><cite>{entry.source || entry.title}</cite></blockquote>)}</aside>}
      </section>}
      <ContextualAgentDock revision={revision} context={{ scope: "此刻", title: "从走过的路里更了解自己", summary: "结合个人主线、优势、人生阶段与最近近况，浏览当前知识库的整体轮廓。", defaultMode: "read", launcherLabel: "和我的知识聊聊", suggestions: ["结合我的个人主线和当前人生阶段，概括我正在成为一个怎样的人。", "从已有经历中总结我的三个优势，并分别说明证据和适用情境。", "最近的记录为已有的自我理解带来了哪些新变化？"] }} />
    </div>
  );
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
    <ParentBack to="/" label="返回此刻" />
    <PageHero title={data.signal.name} description={data.signal.judgment} tone="tinted" className="focus-page-hero" aside={<div className="page-hero-rationale"><b>为什么是现在</b><p>{data.signal.reason}</p><span>{data.signal.kind}</span></div>} />
    <nav className="focus-switcher" aria-label="切换当前问题">{data.candidates.map((candidate) => <NavLink key={candidate.id} className={candidate.id === data.signal.id ? "active" : ""} to={`/focus/${encodeURIComponent(candidate.id)}`}><b>{candidate.name}</b><small>{candidate.kind}</small></NavLink>)}</nav>
    <section className="epistemic-board" aria-label="事实、判断与待观察">
      <article className="evidence"><span>事实证据</span><b>{sourceEvents.length ? `${sourceEvents.length} 条可追溯材料` : "暂未找到直接原始材料"}</b><p>{sourceEvents[0]?.excerpt || "这不等于没有发生，只表示当前知识系统还缺少可追溯证据。"}</p></article>
      <article className="judgment"><span>当前判断</span><b>{data.signal.judgment}</b><p>来自状态追踪面板，可被后续证据修正。</p></article>
      <article className="unknown"><span>下一次观察</span><b>{data.signal.observation || "尚未定义观察信号"}</b><p>它是需要带回生活检验的未知，不是已经成立的结论。</p></article>
    </section>
    <div className="focus-workspace-grid">
      <section className="evidence-history"><SectionHeading title="证据怎样变化" />{data.evidenceTimeline.length ? <ol>{data.evidenceTimeline.map((item) => <li key={`${item.page.id}-${item.kind}`}><time>{item.date.slice(0, 10)}</time><i /><div><span>{evidenceKindLabels[item.kind]}</span><PageLink page={item.page}>{item.label}</PageLink><p>{item.excerpt}</p></div></li>)}</ol> : <Empty>相关页面已经找到，但还没有可排序的证据切片。</Empty>}</section>
      <aside className="focus-relations"><SectionHeading title="它连接到什么" />{data.related.map((group) => <section key={group.category}><h3>{group.label}<span>{group.pages.length}</span></h3>{group.pages.map((page) => <PageLink key={page.id} page={page}><b>{page.title}</b><small>{page.excerpt}</small></PageLink>)}</section>)}</aside>
    </div>
    <section className="local-graph-section"><SectionHeading title="这件事在知识系统里的位置" /><p>只显示与当前问题相距两步以内的页面；下方列表是同一关系的可访问入口。</p><ContextGraph data={data.graph} /></section>
    <ContextualAgentDock revision={revision} context={{ scope: `当前问题 · ${data.signal.name}`, title: data.signal.judgment, summary: `观察信号：${data.signal.observation}。相关上下文：${data.related.map((group) => `${group.label} ${group.pages.map((page) => page.title).join("、")}`).join("；")}`, defaultMode: "read", launcherLabel: "一起处理这个问题", suggestions: ["请区分原始证据、已有判断和仍需验证的推断，帮我理解这个问题。", `我刚想起一件与“${data.signal.name}”有关的经历，请判断应补到哪些页面。`, "基于当前证据，给我设计一个未来两周可观察、但不会制造额外压力的验证方式。"] }} />
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
    <section className="growth-note"><h2>看见之后，不急着变好</h2><p>这个产品不把成长换算成分数、连续天数或完成率。更重要的是：你能否更准确地描述发生了什么，辨认旧模式，并带着一个更好的问题回到生活。</p><button className="inline-agent-hint" onClick={() => window.dispatchEvent(new CustomEvent("open-context-agent"))}>帮我寻找问题 <Icon name="arrow" size={16} /></button></section>
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
