import React, { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GraphData, LettersView, LifeMapView, QuotesView, ReasoningLens, RelationshipsView, SectionedPageView, SkillTreeNode, StructuredCard, WikiPage, WikiPageSummary, WikiRun } from "@the-way-here/shared";
import { useApi } from "../../api";
import { categoryMeta, graphCategoryNames, growthTabs, knowledgeTabs, type ReturnContext } from "../../app/config";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { letterRunVersions, openContextAgent, type LetterRunVersion } from "../collaboration/model";
import { DocumentOutline, EditableDocument, MarkdownBody, documentHeadingPrefix } from "../../shared/markdown";
import { apiPageHref, PageLink, pageHref, useReturnContext } from "../../shared/routing";
import { CollapsibleIndexPane, Empty, Icon, Loading, PageHeader, SectionHeading, SectionTabs } from "../../shared/ui";
import { LifeViewSwitch, UnderstandingBanner } from "./UnderstandingLayout";

export function Timeline({ revision }: { revision: number }) {
  const { data, loading, error } = useApi<LifeMapView>("/api/views/life-map", revision);
  const [params, setParams] = useSearchParams();
  if (loading) return <Loading label="正在展开人生地图" />;
  if (error || !data) return <Empty>{error || "暂无人生阶段"}</Empty>;
  const selected = data.stages.find((stage) => stage.page.id === params.get("stage")) || data.stages.find((stage) => stage.current && stage.lane === 0) || data.stages[0];
  const selectStage = (id: string) => setParams((current) => { const next = new URLSearchParams(current); next.set("stage", id); return next; });
  return (
    <div className="life-map-page understanding-life-page">
      <UnderstandingBanner tone="life" title="人生轨迹" description="阶段、转折与近况回信共同组成一条可回看的路径。这里保留时间顺序，也保留同一时期并行发生的人生线索。" count={data.stages.length + data.events.length} countLabel="个阶段与转折" />
      <LifeViewSwitch active="timeline" />
      <section className="understanding-timeline" aria-label="人生阶段时间线">
        <div className="understanding-timeline-item is-now"><i /><div><span>现在</span><p>从此刻向前回看，新的经历会继续补入这条时间线。</p></div></div>
        {data.stages.map((stage) => {
          const isSelected = selected?.page.id === stage.page.id;
          return <button type="button" key={stage.page.id} className={`understanding-timeline-item${isSelected ? " is-selected" : ""}${stage.relatedEvents.length ? " is-turning" : ""}${stage.lane > 0 ? " is-parallel" : ""}`} onClick={() => selectStage(stage.page.id)}>
            <i /><div><span>{stage.range}</span><b>{stage.page.title}</b><p>{stage.focus}</p><small>{stage.lane > 0 ? "并行人生线" : "人生主线"}{stage.relatedEvents.length ? ` · ${stage.relatedEvents.length} 个转折` : ""}</small></div>
          </button>;
        })}
      </section>

      {selected && <section className="stage-focus" aria-live="polite">
        <div className="stage-focus-copy"><span>{selected.lane > 0 ? "并行人生线" : "人生主线"} · {selected.range}</span><h2><PageLink page={selected.page}>{selected.page.title}</PageLink></h2><p>{selected.focus}</p>
        </div>
        <div className="stage-focus-turns" id="stage-turns"><header><b>转折坐标</b><span>{selected.relatedEvents.length || "待补充"}</span></header>{selected.relatedEvents.length ? selected.relatedEvents.map((event) => <PageLink page={event} key={event.id}><time>{event.start || "时间待查"}</time><b>{event.title.replace(/^\d+\s*/, "")}</b><Icon name="arrow" size={14} /></PageLink>) : <p>这个阶段还没有明确关联的转折。补充经历后，坐标会出现在这里。</p>}</div>
        <div className="stage-linked-dimensions">{([
          ["相关的人", selected.relatedPeople], ["地点", selected.relatedPlaces], ["生活系统", selected.relatedSystems], ["近况回信", selected.relatedLetters],
        ] as Array<[string, WikiPageSummary[]]>).map(([label, pages]) => pages.length ? <div key={label}><b>{label}</b><span>{pages.slice(0, 5).map((page) => <PageLink key={page.id} page={page}>{page.title}</PageLink>)}</span></div> : null)}</div>
      </section>}
      <ContextualAgentDock revision={revision} context={{ scope: "人生地图", title: selected?.page.title || "人生阶段", pageId: selected?.page.id, summary: selected?.focus, defaultMode: "write", launcherLabel: "补充这个阶段", suggestions: ["我想起一件属于这个阶段的重要经历，请帮我判断应该补充到哪里。", "结合这个阶段的证据，帮我梳理它如何影响了后来的选择。", "这个阶段还有一条并行的人生线没有记录，请帮我补充。"] }} />
    </div>
  );
}

const graphColors = ["#416b59", "#a36e38", "#496f86", "#a6534c", "#75658b", "#77874c", "#9b6551", "#427d78"];

export function KnowledgeGraph({ revision }: { revision: number }) {
  const [params, setParams] = useSearchParams();
  const focusId = params.get("focus") || "";
  const { data, loading } = useApi<GraphData>(`/api/views/graph${focusId ? `?focus=${encodeURIComponent(focusId)}` : ""}`, revision);
  const [category, setCategory] = useState("all");
  const returnContext = useReturnContext();
  const focusNode = data?.nodes.find((node) => node.id === data.focusId);
  const prepared = useMemo(() => {
    if (!data) return undefined;
    const degree = new Map<string, number>();
    for (const link of data.links) {
      degree.set(link.source, (degree.get(link.source) || 0) + 1);
      degree.set(link.target, (degree.get(link.target) || 0) + 1);
    }
    const primary = category === "all"
      ? data.nodes.filter((node) => (degree.get(node.id) || 0) > 0).sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0)).slice(0, 96)
      : data.nodes.filter((node) => node.category === category);
    const primaryIds = new Set(primary.map((node) => node.id));
    const neighborIds = new Set<string>();
    if (category !== "all") for (const link of data.links) {
      if (primaryIds.has(link.source)) neighborIds.add(link.target);
      if (primaryIds.has(link.target)) neighborIds.add(link.source);
    }
    const selected = category === "all" ? primary : [...primary, ...data.nodes.filter((node) => neighborIds.has(node.id) && !primaryIds.has(node.id)).slice(0, 60)];
    const nodes = selected.slice(0, 120);
    const ids = new Set(nodes.map((node) => node.id));
    const categories = [...new Set(nodes.map((node) => node.category))];
    const positions = new Map<string, { x: number; y: number; color: string }>();
    categories.forEach((name, categoryIndex) => {
      const group = nodes.filter((node) => node.category === name);
      const groupAngle = (Math.PI * 2 * categoryIndex) / Math.max(categories.length, 1) - Math.PI / 2;
      const centerX = 480 + Math.cos(groupAngle) * (categories.length === 1 ? 0 : 245);
      const centerY = 310 + Math.sin(groupAngle) * (categories.length === 1 ? 0 : 205);
      group.forEach((node, index) => {
        const ring = Math.floor(index / 12) + 1;
        const angle = (Math.PI * 2 * (index % 12)) / Math.min(group.length, 12) + groupAngle;
        const radius = group.length === 1 ? 0 : 22 + ring * 17;
        positions.set(node.id, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius, color: graphColors[categoryIndex % graphColors.length]! });
      });
    });
    return { nodes, positions, links: data.links.filter((link) => ids.has(link.source) && ids.has(link.target)), degree };
  }, [data, category]);
  if (loading || !data || !prepared) return <Loading label="正在梳理知识关系" />;
  const counts = data.nodes.reduce<Record<string, number>>((result, node) => ((result[node.category] = (result[node.category] || 0) + 1), result), {});
  return (
    <div>
      <SectionTabs items={knowledgeTabs} />
      <PageHeader title="关系地图" description="线不是装饰：它表示知识页面之间真实存在的引用。选择一种结构，可以同时看见它连接到哪些经历、人物与判断。" />
      {focusNode && <div className="graph-focus-bar"><div><span>正在查看局部关系</span><b>{focusNode.title}</b></div><button onClick={() => setParams({})}>回到核心网络</button></div>}
      <div className="graph-filters">
        <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}><b>核心网络</b><span>{data.nodes.length} 个页面</span></button>
        {Object.entries(counts).filter(([key]) => graphCategoryNames[key]).map(([key, count]) => (
          <button key={key} className={category === key ? "active" : ""} onClick={() => setCategory(key)}><b>{graphCategoryNames[key]}</b><span>{count}</span></button>
        ))}
      </div>
      <div className="graph-canvas">
        <svg viewBox="0 0 960 620" role="img" aria-label="知识页面关系图">
          <g className="graph-links">{prepared.links.map((link) => {
            const source = prepared.positions.get(link.source)!; const target = prepared.positions.get(link.target)!;
            return <line key={`${link.source}-${link.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
          })}</g>
          <g>{prepared.nodes.map((node) => {
            const position = prepared.positions.get(node.id)!;
            const important = (prepared.degree.get(node.id) || 0) > 3;
            return <g key={node.id} className="graph-node" role="button" tabIndex={0} aria-label={`查看 ${node.title} 的局部关系`} transform={`translate(${position.x} ${position.y})`} onClick={() => { setParams({ focus: node.id }); setCategory("all"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setParams({ focus: node.id }); setCategory("all"); } }}>
              <circle r={important ? 8 : 5} fill={position.color} />
              {(important || category !== "all") && <text x="11" y="4">{node.title.slice(0, 12)}</text>}
              <title>{node.title} · {graphCategoryNames[node.category] || node.category}</title>
            </g>;
          })}</g>
        </svg>
        <div className="graph-note">显示 {prepared.nodes.length} 个页面、{prepared.links.length} 条真实引用；点击节点继续收拢到它的局部关系。</div>
      </div>
      <div className="graph-adjacency"><b>当前网络中的页面</b><p>关系图之外的可访问入口；打开原文不会改变当前筛选。</p><div>{[...prepared.nodes].sort((a, b) => (prepared.degree.get(b.id) || 0) - (prepared.degree.get(a.id) || 0)).slice(0, 24).map((node) => <NavLink key={node.id} to={pageHref(node.id)} state={returnContext}><span>{graphCategoryNames[node.category] || node.category} · {prepared.degree.get(node.id) || 0} 个连接</span><b>{node.title}</b></NavLink>)}</div></div>
      <ContextualAgentDock revision={revision} context={{ scope: "我的知识 · 关系地图", title: category === "all" ? "核心知识关系" : graphCategoryNames[category] || category, summary: `当前显示 ${prepared.nodes.length} 个页面与 ${prepared.links.length} 条真实引用。`, defaultMode: "read", launcherLabel: "询问这张关系图", suggestions: ["这张关系图里哪些页面连接最关键？它们共同说明了什么？", "当前分类与其他人生结构之间有哪些值得追查的连接？"] }} />
    </div>
  );
}

function StructuredExplorer({ cards, revision, contextScope, emptyLabel = "暂无内容", suggestions = [] }: { cards: StructuredCard[]; revision: number; contextScope: string; emptyLabel?: string; suggestions?: string[] }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [indexOpen, setIndexOpen] = useState(true);
  const filtered = useMemo(() => cards.filter((card) => `${card.title} ${card.excerpt} ${card.sections.map((section) => `${section.heading} ${section.body}`).join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [cards, query]);
  const selected = filtered.find((card) => card.id === params.get("item")) || filtered[0];
  const selectedIndex = selected ? filtered.findIndex((card) => card.id === selected.id) : -1;
  if (!cards.length) return <Empty>{emptyLabel}</Empty>;
  function selectItem(id: string) { setParams((current) => { const next = new URLSearchParams(current); next.set("item", id); return next; }); }
  function moveSelection(delta: number) {
    const next = filtered[selectedIndex + delta];
    if (next) selectItem(next.id);
  }
  return <>
    <div className={`collection-explorer${indexOpen ? "" : " index-collapsed"}`}>
    <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label="内容列表">
      <aside className="collection-list">
        <label><Icon name="search" size={16} /><input name="collection-search" autoComplete="off" aria-label="在当前分类中查找" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在当前分类中查找…" /></label>
        <small>{filtered.length} / {cards.length}</small>
        <div role="listbox" aria-label="内容列表">{filtered.map((card) => <button role="option" aria-label={card.title} aria-selected={selected?.id === card.id} key={card.id} className={selected?.id === card.id ? "active" : ""} onClick={() => selectItem(card.id)}><b>{card.title}</b><span>{card.excerpt}</span></button>)}</div>
      </aside>
    </CollapsibleIndexPane>
    <article className="collection-detail" aria-live="polite">
      {selected ? <>
        <EditablePageContent pageId={selected.id} revision={revision} onRenamed={(renamed) => selectItem(renamed.id)} />
        <div className="collection-pager"><button disabled={selectedIndex <= 0} onClick={() => moveSelection(-1)}><Icon name="back" size={15} />上一条</button><span>{selectedIndex + 1} / {filtered.length}</span><button disabled={selectedIndex >= filtered.length - 1} onClick={() => moveSelection(1)}>下一条<Icon name="arrow" size={15} /></button></div>
      </> : <Empty>没有匹配内容</Empty>}
    </article>
    </div>
    {selected && <ContextualAgentDock revision={revision} context={{ scope: contextScope, title: selected.title, pageId: selected.id, summary: selected.excerpt, defaultMode: "write", launcherLabel: "补充当前内容", suggestions: suggestions.length ? suggestions : ["我想补充一段新经历，请帮我放到当前内容的合适位置。", "请沿着当前页面的证据，告诉我还有什么值得继续追问。"] }} />}
  </>;
}

function EditablePageContent({ pageId, revision, startEditing = false, onRenamed }: { pageId: string; revision: number; startEditing?: boolean; onRenamed?: (page: WikiPage) => void }) {
  const { data, loading, error } = useApi<WikiPage>(apiPageHref(pageId), revision);
  if (loading) return <Loading label="正在展开完整内容" />;
  if (error || !data) return <Empty>{error || "完整内容暂时无法读取"}</Empty>;
  return <EditableDocument page={data} variant="preview" startEditing={startEditing} showOutline showIdentity={false} onRenamed={onRenamed} />;
}

function EmbeddedPagePreview({ page, revision, startEditing = false, onRenamed }: { page: Pick<WikiPageSummary, "id">; revision: number; startEditing?: boolean; onRenamed?: (page: WikiPage) => void }) {
  return <article className="embedded-page" aria-live="polite">
    <EditablePageContent pageId={page.id} revision={revision} startEditing={startEditing} onRenamed={onRenamed} />
  </article>;
}

function LetterVersionPreview({ pageTitle, version }: { pageTitle: string; version: LetterRunVersion }) {
  const markdown = /^#\s+.+$/m.test(version.markdown) ? version.markdown : `# ${pageTitle}\n\n${version.markdown}`;
  return <article className="embedded-page letter-version-preview" aria-live="polite">
    <section className="editable-document editable-document--preview knowledge-document letter-version-document">
      <header className="letter-version-document-meta">
        <div><span>人物视角重读</span><b>{version.label}</b><small>{new Date(version.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} · 已保留在这封回信中</small></div>
        <button type="button" onClick={() => openContextAgent({ runId: version.runId })}>查看生成对话 <Icon name="arrow" size={14} /></button>
      </header>
      <div className="editable-document-body"><MarkdownBody headingPrefix={documentHeadingPrefix(`letter-version-${version.id}`)}>{markdown}</MarkdownBody></div>
    </section>
  </article>;
}

export function Relationships({ revision }: { revision: number }) {
  const { data, loading, error } = useApi<RelationshipsView>("/api/views/relationships", revision);
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<"people" | "roles">("people");
  const [group, setGroup] = useState("全部");
  const [sort, setSort] = useState<"recent" | "connected" | "name">("recent");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [indexOpen, setIndexOpen] = useState(true);
  if (loading) return <Loading label="正在整理人物与关系" />;
  if (error || !data) return <Empty>{error || "暂无人物"}</Empty>;
  const effectiveMode = data.totalPeople > 0 ? mode : "roles";
  const people = data.groups.flatMap((item) => item.people.map((person) => ({ person, group: item.name })));
  const filtered = people.filter(({ person, group: groupName }) => (group === "全部" || groupName === group) && `${person.title} ${person.aliases.join(" ")} ${person.excerpt}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.person.title.localeCompare(b.person.title, "zh-CN") : sort === "connected" ? b.person.mentionCount - a.person.mentionCount : (b.person.lastMention || "").localeCompare(a.person.lastMention || "") || b.person.mentionCount - a.person.mentionCount);
  const selected = filtered.find(({ person }) => person.id === params.get("person")) || filtered[0];
  function selectPerson(id?: string, replace = false) { setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("person", id); else next.delete("person"); return next; }, { replace }); }
  function changeFilter(nextGroup: string) { setGroup(nextGroup); selectPerson(undefined, true); setVisibleCount(50); }
  const networkRoles = data.roles.slice(0, 4);
  const networkPeople = people.slice().sort((a, b) => b.person.mentionCount - a.person.mentionCount).slice(0, 12);
  const rolePositions = networkRoles.map((role, index) => ({ role, x: 360 + Math.cos((Math.PI * 2 * index) / Math.max(networkRoles.length, 1) - Math.PI / 2) * 105, y: 175 + Math.sin((Math.PI * 2 * index) / Math.max(networkRoles.length, 1) - Math.PI / 2) * 78 }));
  const personPositions = networkPeople.map((item, index) => ({ ...item, x: 360 + Math.cos((Math.PI * 2 * index) / Math.max(networkPeople.length, 1) - Math.PI / 2) * 285, y: 175 + Math.sin((Math.PI * 2 * index) / Math.max(networkPeople.length, 1) - Math.PI / 2) * 145 }));
  return <div className="understanding-people-page">
    <UnderstandingBanner tone="people" title="人与世界" description="找到一个具体的人，也看见一段关系在生命里承担的功能；人物、角色与人生阶段会在这里彼此连接。" count={data.totalPeople + data.roles.length} countLabel="个人与关系角色" />
    {(networkRoles.length > 0 || networkPeople.length > 0) ? <section className="understanding-relationship-web" aria-labelledby="relationship-web-title">
      <header><div><h2 id="relationship-web-title">关系网络</h2><p>线条来自人物页已经记录的关系角色；没有明确角色的人仍会与“我”保持直接连接。</p></div><span>{networkPeople.length} 个高关联人物</span></header>
      <svg viewBox="0 0 720 350" role="img" aria-label="人物与关系角色网络">
        <g className="relationship-web-edges">
          {rolePositions.map(({ role, x, y }) => <line key={`self-${role.id}`} x1="360" y1="175" x2={x} y2={y} />)}
          {personPositions.map(({ person, x, y }) => {
            const linkedRole = rolePositions.find(({ role }) => person.relatedRoles.some((item) => item.id === role.id || item.title === role.title));
            return <line key={`person-${person.id}`} className={linkedRole ? "" : "direct"} x1={linkedRole?.x || 360} y1={linkedRole?.y || 175} x2={x} y2={y} />;
          })}
        </g>
        <g className="relationship-web-center"><circle cx="360" cy="175" r="28" /><text x="360" y="180">我</text></g>
        {rolePositions.map(({ role, x, y }) => <g className="relationship-web-role" key={role.id} transform={`translate(${x} ${y})`}><circle r="21" /><text y="4">{role.title.slice(0, 5)}</text></g>)}
        {personPositions.map(({ person, x, y }) => <g className="relationship-web-person" role="button" tabIndex={0} aria-label={`查看 ${person.title}`} key={person.id} transform={`translate(${x} ${y})`} onClick={() => { setMode("people"); selectPerson(person.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setMode("people"); selectPerson(person.id); } }}><circle r={Math.min(14, 7 + person.mentionCount / 3)} /><text y="24">{person.title.slice(0, 7)}</text></g>)}
      </svg>
      <footer><span><i className="center" />自己</span><span><i className="role" />关系角色</span><span><i className="person" />具体人物</span></footer>
    </section> : null}
    <div className="view-switch"><button disabled={!data.totalPeople} className={effectiveMode === "people" ? "active" : ""} onClick={() => setMode("people")}>全部人物 <span>{data.totalPeople}</span></button><button className={effectiveMode === "roles" ? "active" : ""} onClick={() => setMode("roles")}>关系角色 <span>{data.roles.length}</span></button></div>
    {effectiveMode === "roles" ? <StructuredExplorer cards={data.roles} revision={revision} contextScope="人与世界 · 关系角色" suggestions={["我想补充一个重要的人物，帮我判断他在关系里承担了什么功能。", "当前关系角色是否遗漏了反例或边界？"]} /> : <>
      <div className="people-toolbar"><label><Icon name="search" size={16} /><input name="people-search" autoComplete="off" aria-label="搜索人物" value={query} onChange={(event) => { setQuery(event.target.value); selectPerson(undefined, true); setVisibleCount(50); }} placeholder="搜索姓名、别名或人物线索…" /></label><span>找到 {filtered.length} 人</span></div>
      <div className="people-sort segmented" aria-label="人物排序">{[["recent", "最近影响"], ["connected", "关联最多"], ["name", "按姓名"]].map(([value, label]) => <button key={value} className={sort === value ? "active" : ""} onClick={() => { setSort(value as typeof sort); selectPerson(undefined, true); }}>{label}</button>)}</div>
      <div className="people-groups">{["全部", ...data.groups.map((item) => item.name)].map((name) => <button key={name} className={group === name ? "active" : ""} onClick={() => changeFilter(name)}>{name}<span>{name === "全部" ? data.totalPeople : data.groups.find((item) => item.name === name)?.people.length}</span></button>)}</div>
      <div className={`people-explorer${indexOpen ? "" : " index-collapsed"}`}>
        <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label="人物列表">
          <aside className="people-index" role="listbox" aria-label="人物列表">
            {filtered.slice(0, visibleCount).map(({ person, group: groupName }) => <button role="option" aria-label={`${person.title} · ${groupName}`} aria-selected={selected?.person.id === person.id} key={person.id} className={selected?.person.id === person.id ? "active" : ""} onClick={() => selectPerson(person.id)}><span>{groupName} · {person.mentionCount} 处关联{person.lastMention ? ` · ${person.lastMention.slice(0, 10)}` : ""}</span><b>{person.title}</b>{person.aliases.length > 0 && <small>{person.aliases.slice(0, 2).join(" · ")}</small>}</button>)}
            {visibleCount < filtered.length && <button className="load-more" onClick={() => setVisibleCount((value) => value + 50)}>继续显示 {Math.min(50, filtered.length - visibleCount)} 人</button>}
          </aside>
        </CollapsibleIndexPane>
        <div className="person-detail">{selected ? <><div className="person-relationship-context"><span>生命中的连接</span><div>{selected.person.relatedStages.map((page) => <PageLink key={page.id} page={page}>阶段 · {page.title}</PageLink>)}{selected.person.relatedRoles.map((page) => <PageLink key={page.id} page={page}>角色 · {page.title}</PageLink>)}{selected.person.relatedSystems.map((page) => <PageLink key={page.id} page={page}>系统 · {page.title}</PageLink>)}</div></div><EmbeddedPagePreview key={selected.person.id} page={selected.person} revision={revision} onRenamed={(renamed) => selectPerson(renamed.id, true)} /></> : <Empty>没有匹配的人物</Empty>}</div>
      </div>
      <ContextualAgentDock revision={revision} context={{ scope: `人与世界 · ${group}`, title: selected?.person.title || "补充一个重要人物", pageId: selected?.person.id, summary: selected?.person.excerpt || "当前人物分类中还没有选中的人物。", defaultMode: "write", launcherLabel: selected ? "补充这个人物" : "补充重要人物", suggestions: [selected ? `我想补充一段与${selected.person.title}有关的经历，请更新人物页和受影响的关系结构。` : "我想起了一个重要人物还没有记录，请帮我创建人物页并连接到合适的关系角色。", "请检查当前人物记录是否遗漏了别名、关系功能或关键经历。"] }} />
    </>}
  </div>;
}

export function Cards({ revision }: { revision: number }) {
  const { category = "cycles" } = useParams();
  const meta = categoryMeta[category] || { title: category, intro: "" };
  const { data, loading } = useApi<StructuredCard[]>(`/api/views/cards/${category}`, revision);
  if (loading || !data) return <Loading />;
  return (
    <div>
      <SectionTabs items={growthTabs} />
      <PageHeader title={meta.title} description={meta.intro} />
      <StructuredExplorer cards={data} revision={revision} contextScope={`理解自己 · ${meta.title}`} suggestions={[`我想补充一段与“${meta.title}”有关的新经历，请更新当前页面及受影响的关联页。`, "请结合当前内容和原始证据，指出一个可能遗漏的反例或竞争解释。"]} />
    </div>
  );
}

export function Letters({ revision }: { revision: number }) {
  const { data, loading } = useApi<LettersView>("/api/views/letters", revision);
  const { data: lenses } = useApi<ReasoningLens[]>("/api/lenses", revision);
  const { data: runList, loading: runsLoading } = useApi<WikiRun[]>("/api/runs", revision);
  const [params, setParams] = useSearchParams();
  const [year, setYear] = useState("全部");
  const [lensOpen, setLensOpen] = useState(false);
  const [view, setView] = useState<"chronology" | "themes">("chronology");
  const [thread, setThread] = useState("全部");
  const [showAllThreads, setShowAllThreads] = useState(false);
  const [indexOpen, setIndexOpen] = useState(true);
  if (loading || !data || runsLoading) return <Loading label="正在整理回信" />;
  const lensExamples = (lenses || []).slice(0, 3).map((lens) => lens.displayName).join("、");
  const selectedThread = data.threads.find((item) => item.id === thread);
  const filtered = data.letters.filter((letter) => (view === "chronology" ? year === "全部" || letter.letterDate.startsWith(year) : thread === "全部" || selectedThread?.letters.includes(letter.page.id)));
  const selected = filtered.find((letter) => letter.page.id === params.get("letter")) || filtered[0];
  const generatedVersions = selected ? letterRunVersions(runList || [], selected.page.id) : [];
  const versions = selected ? [{ id: "original", label: "原始回信", lensName: "", markdown: "", createdAt: selected.letterDate, runId: "" }, ...generatedVersions] : [];
  const latestVersion = versions.at(-1);
  const activeVersion = versions.find((version) => version.id === params.get("version")) || latestVersion;
  const selectLetter = (id?: string, replace = false) => { setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("letter", id); else next.delete("letter"); next.delete("version"); return next; }, { replace }); };
  const selectVersion = (id?: string) => { setParams((current) => { const next = new URLSearchParams(current); if (!id || id === latestVersion?.id) next.delete("version"); else next.set("version", id); return next; }, { replace: true }); };
  return (
    <div className="understanding-life-page understanding-letters-page">
      <UnderstandingBanner tone="life" title="人生轨迹" description="阶段、转折与近况回信共同组成一条可回看的路径。回信让过去的材料与此刻重新发生联系。" count={data.letters.length} countLabel="封近况回信" />
      <LifeViewSwitch active="letters" />
      <div className="view-switch"><button className={view === "chronology" ? "active" : ""} onClick={() => { setView("chronology"); selectLetter(undefined, true); }}>按时间阅读</button><button className={view === "themes" ? "active" : ""} onClick={() => { setView("themes"); selectLetter(undefined, true); }}>沿主题追踪 <span>{data.threads.length}</span></button></div>
      {view === "chronology" ? <div className="letter-filters">{["全部", ...data.years].map((item) => <button key={item} className={year === item ? "active" : ""} onClick={() => { setYear(item); selectLetter(undefined, true); }}>{item}<span>{item === "全部" ? data.letters.length : data.letters.filter((letter) => letter.letterDate.startsWith(item)).length}</span></button>)}</div> : <><div className="letter-thread-note"><span>先显示回信最多的主题</span><button onClick={() => setShowAllThreads((value) => !value)}>{showAllThreads ? "收起长尾主题" : `查看全部 ${data.threads.length} 个主题`}</button></div><div className="letter-threads">{[{ id: "全部", title: "全部主题", letters: data.letters.map((letter) => letter.page.id), latestDate: "", category: "uncategorized" as const }, ...(showAllThreads ? data.threads : data.threads.slice(0, 14))].map((item) => <button key={item.id} className={thread === item.id ? "active" : ""} onClick={() => { setThread(item.id); selectLetter(undefined, true); }}><b>{item.title}</b><span>{item.letters.length} 封</span></button>)}</div></>}
      <div className={`letter-explorer${indexOpen ? "" : " index-collapsed"}`}>
        <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label="回信列表">
          <aside className="letter-index" role="listbox" aria-label="回信列表">
            {filtered.map((letter) => <button role="option" aria-label={letter.page.title} aria-selected={selected?.page.id === letter.page.id} key={letter.page.id} className={selected?.page.id === letter.page.id ? "active" : ""} onClick={() => selectLetter(letter.page.id)}><time>{letter.letterDate.slice(0, 10)}</time><b>{letter.page.title.replace(/^\d{4}-\d{2}-\d{2}\s*/, "")}</b>{letter.themes.length > 0 && <small>{letter.themes.slice(0, 2).map((theme) => theme.title).join(" · ")}</small>}<span>{letter.page.excerpt}</span></button>)}
          </aside>
        </CollapsibleIndexPane>
        <div className="letter-detail">{selected ? <><section className="letter-origin" aria-label="这封信的来历">
          <dl className="letter-origin-facts">
            <div><dt>写信于</dt><dd>{selected.letterDate.slice(0, 10)}</dd></div>
            {selected.evidenceFrom && <div><dt>回看的材料范围</dt><dd>{selected.evidenceFrom}{selected.evidenceTo && selected.evidenceTo !== selected.evidenceFrom ? ` — ${selected.evidenceTo}` : ""}</dd></div>}
            <div><dt>涵盖主题</dt><dd>{selected.themes.length > 0 ? `${selected.themes.length} 个` : "未标注"}</dd></div>
          </dl>
          {selected.themes.length > 0 && <div className="letter-origin-themes">{selected.themes.slice(0, 6).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}</div>}
          {(lenses || []).length > 0 && <div className="letter-origin-lens">
            <button type="button" className={lensOpen ? "open" : ""} aria-expanded={lensOpen} onClick={() => setLensOpen((value) => !value)}>用 {lensExamples} 等 {(lenses || []).length} 种人物视角重读 <Icon name="down" size={14} /></button>
            {lensOpen && <>
              <p>这些人物视角由 The Way Here 从可核实的公开原则中提炼。它们不会增加事实，也不模仿口头禅；不同之处在于首先关注什么、怎样解释证据，以及在哪里停止。重读完成后会作为这封信的最新版本保留，原始回信仍可切换查看。</p>
              <div>{(lenses || []).map((lens) => <button type="button" key={lens.id} onClick={() => { setLensOpen(false); selectVersion(); openContextAgent({ mode: "read", outputTarget: { kind: "letter-version", pageId: selected.page.id, lensId: lens.id, lensName: lens.displayName, label: `${lens.displayName}视角回信` }, prompt: `请用「${lens.displayName}」的思考方式，重新写一版完整的近况回信《${selected.page.title}》，并重读它所依据的材料。这个视角特别关注：${lens.attention}。保持一位了解我来路的朋友口吻，只依据知识库里的原始材料和已有判断，不虚构事实、不模仿人物口头禅，也不要替我下结论。最终只输出可直接阅读的完整回信正文，并在末尾用“依据”列出引用的材料；不要修改任何文件，系统会把回答保留为「${lens.displayName}视角回信」。` }); }}><b>{lens.displayName}</b><small>{lens.attention}</small></button>)}</div>
            </>}
          </div>}
        </section>
        {versions.length > 1 && activeVersion && <section className="letter-version-switcher" aria-label="回信版本">
          <div aria-live="polite"><span>正在阅读</span><b>{activeVersion.label}</b><small>{activeVersion.id === "original" ? `最初版本 · 写信于 ${selected.letterDate.slice(0, 10)}` : `${activeVersion.id === latestVersion?.id ? "最新版本" : "历史版本"} · ${new Date(activeVersion.createdAt).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}</small></div>
          <label><span>切换回信版本 · {versions.length} 个</span><select value={activeVersion.id} onChange={(event) => selectVersion(event.target.value)}>{[...versions].reverse().map((version) => <option key={version.id} value={version.id}>{version.id === latestVersion?.id ? "最新 · " : ""}{version.label}{version.id === "original" ? " · 最初版本" : ` · ${new Date(version.createdAt).toLocaleDateString("zh-CN")}`}</option>)}</select></label>
        </section>}
        {activeVersion?.id !== "original" ? <LetterVersionPreview key={activeVersion?.id} pageTitle={selected.page.title} version={activeVersion as LetterRunVersion} /> : <EmbeddedPagePreview key={selected.page.id} page={selected.page} revision={revision} onRenamed={(renamed) => selectLetter(renamed.id, true)} />}</> : <Empty>当前范围暂无回信</Empty>}</div>
      </div>
      <ContextualAgentDock revision={revision} context={{ scope: view === "themes" ? `近况回信 · ${selectedThread?.title || "全部主题"}` : `近况回信 · ${year}`, title: selected?.page.title || `${year === "全部" ? "最近" : year + " 年"}的近况回信`, pageId: selected?.page.id, summary: selected?.page.excerpt || "从选定年份的日记和已有知识生成回信。", defaultMode: "write", launcherLabel: selected ? "回应或重写这封信" : "写一封新回信", suggestions: [year === "全部" ? "从 2025 年日记中抽样几篇，结合已有知识写一封新的近况回信。" : `从 ${year} 年日记中抽样几篇，结合已有知识写一封新的近况回信。`, selected ? "根据更多原始证据重新写这封回信，保留朋友式回应，不做绩效复盘。" : "请先帮我选择最值得回看的一个时间切片，再写回信。"] }} />
    </div>
  );
}

export function MentalModels({ revision }: { revision: number }) {
  const { data: view, loading, error } = useApi<SectionedPageView>("/api/views/mental-models", revision);
  const [selectedHeading, setSelectedHeading] = useState("");
  const [indexOpen, setIndexOpen] = useState(true);
  if (loading) return <Loading label="正在展开判断工具箱" />;
  if (error || !view) return <Empty>{error || "暂无思维模型"}</Empty>;
  const { page, sections } = view;
  const definition = sections.find((section) => section.heading === "什么才算一个思维模型");
  const modelSections = sections.filter((section) => /^[一二三四五六七]、/.test(section.heading));
  const calibrations = sections.find((section) => section.heading.includes("近期四次模型校准"));
  const priorities = sections.find((section) => section.heading === "当前优先观察");
  const selected = modelSections.find((section) => section.heading === selectedHeading) || modelSections[0];
  return (
    <div>
      <SectionTabs items={growthTabs} />
      <PageHeader title="思维模型" description="不是名人观点和概念收藏，而是一组能说明证据、竞争解释、适用边界与误用风险的个人判断工具。" />
      {definition && <section className="model-definition"><ReactMarkdown remarkPlugins={[remarkGfm]}>{definition.body}</ReactMarkdown></section>}
      <div className={`model-explorer${indexOpen ? "" : " index-collapsed"}`}>
        <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label="模型列表">
          <aside className="model-index" role="listbox" aria-label="模型领域">
            {modelSections.map((section) => <button role="option" aria-selected={selected?.heading === section.heading} className={selected?.heading === section.heading ? "active" : ""} key={section.heading} onClick={() => setSelectedHeading(section.heading)}>{section.heading.replace(/^[一二三四五六七]、/, "")}<Icon name="arrow" size={15} /></button>)}
          </aside>
        </CollapsibleIndexPane>
        <article className="model-detail" aria-live="polite">{selected ? <><h2>{selected.heading.replace(/^[一二三四五六七]、/, "")}</h2><MarkdownBody>{selected.body}</MarkdownBody></> : <Empty>暂无模型内容</Empty>}</article>
      </div>
      <div className="model-lower">
        {calibrations && <section><SectionHeading title="近期校准" /><ReactMarkdown remarkPlugins={[remarkGfm]}>{calibrations.body}</ReactMarkdown></section>}
        {priorities && <section><SectionHeading title="当前优先观察" /><ReactMarkdown remarkPlugins={[remarkGfm]}>{priorities.body}</ReactMarkdown></section>}
      </div>
      <PageLink page={page} className="source-page-link">阅读完整模型总览 <Icon name="arrow" size={15} /></PageLink>
      <ContextualAgentDock revision={revision} context={{ scope: "理解自己 · 思维模型", title: selected?.heading.replace(/^[一二三四五六七]、/, "") || "思维模型", pageId: page.id, summary: selected?.body.slice(0, 260), defaultMode: "write", launcherLabel: "校准这个模型", suggestions: ["结合最近的经历，为当前模型补充一个真实反例或适用边界。", "请用当前模型解释最近的一次选择，并明确证据、推断和竞争解释。"] }} />
    </div>
  );
}

export function Quotes({ revision }: { revision: number }) {
  const { data: view, loading, error } = useApi<QuotesView>("/api/views/quotes", revision);
  if (loading) return <Loading label="正在整理能唤回判断的话" />;
  if (error || !view) return <Empty>{error || "暂无金句"}</Empty>;
  const { page, groups } = view;
  return (
    <div>
      <SectionTabs items={knowledgeTabs} />
      <PageHeader title="金句集锦" description="这里区分你明确保留的表达、过去认可过的话与尚待确认的候选，不把它们混成一面通用名言墙。" />
      <div className="quote-summary">
        {groups.map((group) => <a href={`#${encodeURIComponent(group.title)}`} key={group.title}><b>{group.title.replace(/^这次|^过去|^从/, "")}</b><span>{group.entries.length} 条</span></a>)}
      </div>
      <div className="quote-groups">
        {groups.map((group) => (
          <section key={group.title} id={encodeURIComponent(group.title)}>
            <div className="quote-group-heading"><h2>{group.title}</h2><span>{group.entries.length}</span></div>
            <div className="quote-grid">
              {group.entries.map((entry) => {
                return <article className="quote-card" key={`${group.title}-${entry.title}`}>
                  <div className="quote-card-meta"><span className={entry.confirmed ? "confirmed" : "candidate"}>{entry.confirmed ? "已确认" : "候选"}</span><b>{entry.title}</b></div>
                  <blockquote><ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.quote}</ReactMarkdown></blockquote>
                  {entry.usage && <p className="quote-usage">{entry.usage}</p>}
                  {entry.source && <small>{entry.source}</small>}
                </article>;
              })}
            </div>
          </section>
        ))}
      </div>
      <PageLink page={page} className="source-page-link">阅读完整收录说明与来源 →</PageLink>
      <ContextualAgentDock revision={revision} context={{ scope: "我的知识 · 金句集锦", title: "金句集锦", pageId: page.id, summary: "区分明确确认、过去认可与待确认候选的耐久表达。", defaultMode: "write", launcherLabel: "补充或核对一句话", suggestions: ["我有一句最近反复想到的话，请帮我判断它是否值得进入金句集锦。", "请核对当前候选金句的来源和确认状态，不要把推断写成我已认可。"] }} />
    </div>
  );
}

function flattenMaterialSkills(nodes: SkillTreeNode[]): SkillTreeNode[] {
  return nodes.flatMap((node) => node.kind === "file" ? [node] : flattenMaterialSkills(node.children || []));
}

export function Library({ revision }: { revision: number }) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const [expandedSkills, setExpandedSkills] = useState<string[]>([]);
  const { data, loading } = useApi<WikiPageSummary[]>("/api/pages?sources=false", revision);
  const { data: skillTree, loading: skillsLoading } = useApi<SkillTreeNode[]>("/api/build/skill-tree", revision);
  if (loading || !data || skillsLoading || !skillTree) return <Loading label="正在汇总知识与构建规则" />;
  const counts = data.reduce<Record<string, number>>((result, page) => ((result[page.category] = (result[page.category] || 0) + 1), result), {});
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = data.filter((page) => (category === "all" || page.category === category) && `${page.title} ${page.aliases.join(" ")} ${page.excerpt}`.toLocaleLowerCase().includes(normalizedQuery));
  const skillFiles = flattenMaterialSkills(skillTree);
  const matchedSkills = normalizedQuery ? skillFiles.filter((file) => `${file.skillName || ""} ${file.name} ${file.path}`.toLocaleLowerCase().includes(normalizedQuery)) : [];
  function toggleSkill(path: string) { setExpandedSkills((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]); }
  return (
    <div className="understanding-library-page">
      <UnderstandingBanner tone="all" title="全部资料" description="已有知识和构建规则放在一起，方便从一个结论回到它的内容、来源与形成方式。" count={data.length + skillFiles.length} countLabel="个知识页面与规则文件" />
      <div className="understanding-library-toolbar"><label><Icon name="search" size={17} /><input name="knowledge-search" autoComplete="off" aria-label="搜索全部知识与构建规则" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(30); }} placeholder="搜索 Wiki 知识与 Skill 规则…" /></label><span>{filtered.length + (normalizedQuery ? matchedSkills.length : skillFiles.length)} 项</span></div>
      <nav className="understanding-library-chips" aria-label="资料分类">
        <button className={category === "all" ? "active" : ""} onClick={() => { setCategory("all"); setVisibleCount(30); }}>全部 <b>{data.length}</b></button>
        {Object.entries(counts).filter(([key]) => graphCategoryNames[key] && !["maintenance", "sources"].includes(key)).map(([key, count]) => <button key={key} className={category === key ? "active" : ""} onClick={() => { setCategory(key); setVisibleCount(30); }}>{graphCategoryNames[key]} <b>{count}</b></button>)}
        <NavLink to="/quotes">金句</NavLink><NavLink to="/graph">关系网络</NavLink>
      </nav>
      <div className="understanding-library-columns">
        <section className="understanding-material-column understanding-material-column--skills">
          <header><span>Skill 规则</span><h2>知识如何被构建</h2><p>查看每条规则负责读取什么、怎样形成页面，以及它的安全边界。</p></header>
          <div className="understanding-material-tree">
            {normalizedQuery ? <div className="understanding-material-results">{matchedSkills.slice(0, 40).map((file) => <NavLink key={file.path} to={`/advanced?file=${encodeURIComponent(file.path)}`}><b>{file.name}</b><small>{file.skillName || file.path}</small></NavLink>)}{!matchedSkills.length ? <Empty>没有匹配的规则文件。</Empty> : null}</div> : skillTree.map((group) => {
              const open = expandedSkills.includes(group.path);
              const children = group.children || [];
              return <div className={`understanding-material-group${open ? " is-open" : ""}`} key={group.path}>
                <button type="button" onClick={() => toggleSkill(group.path)} aria-expanded={open}><Icon name="down" size={14} /><span><b>{group.skillName || group.name}</b><small>{group.kind === "directory" ? `${group.fileCount || flattenMaterialSkills(children).length} 个规则文件` : group.path}</small></span></button>
                {open ? <div>{children.map((child) => <NavLink key={child.path} to={child.kind === "file" ? `/advanced?file=${encodeURIComponent(child.path)}` : `/advanced?dir=${encodeURIComponent(child.path)}`}><b>{child.skillName || child.name}</b><small>{child.kind === "file" ? child.path : `${child.fileCount || flattenMaterialSkills(child.children || []).length} 个文件`}</small></NavLink>)}</div> : null}
              </div>;
            })}
          </div>
          <footer><NavLink to="/advanced">打开完整规则浏览器 <Icon name="arrow" size={14} /></NavLink></footer>
        </section>
        <section className="understanding-material-column understanding-material-column--wiki">
          <header><span>Wiki 知识</span><h2>已经形成的理解</h2><p>只展示经过构建的知识页面，每一条都可以继续回到原始材料核对。</p></header>
          <div className="understanding-wiki-list">
            {filtered.slice(0, visibleCount).map((page) => <PageLink page={page} key={page.id}><span>{graphCategoryNames[page.category] || page.category}</span><div><b>{page.title}</b><p>{page.excerpt}</p></div><Icon name="arrow" size={14} /></PageLink>)}
            {!filtered.length ? <Empty>没有匹配的知识页面。</Empty> : null}
          </div>
          {visibleCount < filtered.length ? <footer><button type="button" onClick={() => setVisibleCount((value) => value + 30)}>继续显示 {Math.min(30, filtered.length - visibleCount)} 条</button></footer> : null}
        </section>
      </div>
      <ContextualAgentDock revision={revision} context={{ scope: `全部资料 · ${category === "all" ? "已有知识与规则" : graphCategoryNames[category] || category}`, title: query ? `搜索“${query}”的当前结果` : "全部资料", summary: `当前筛选显示 ${filtered.length} 个知识页面与 ${normalizedQuery ? matchedSkills.length : skillFiles.length} 个规则文件。`, defaultMode: "read", launcherLabel: "询问当前资料", suggestions: ["请基于当前知识范围，帮我找到与最近状态最相关的三条证据。", "当前哪些判断缺少足够的原始材料支持？"] }} />
    </div>
  );
}

export function SearchResults({ revision }: { revision: number }) {
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const { data, loading } = useApi<WikiPageSummary[]>(`/api/search?q=${encodeURIComponent(query)}`, revision);
  if (loading || !data) return <Loading label="正在知识与原始材料中寻找" />;
  const knowledge = data.filter((page) => !page.isSource);
  const sources = data.filter((page) => page.isSource);
  return (
    <div>
      <PageHeader title={`“${query}”`} description={`找到 ${data.length} 项结果，已按构建知识与原始材料分组。`} />
      {knowledge.length > 0 && <section className="search-group"><SectionHeading title={`已有理解 · ${knowledge.length}`} action={<NavLink to="/knowledge">进入已有理解</NavLink>} /><div className="search-results">{knowledge.map((page) => <PageLink page={page} key={page.id} className="search-result"><small>{graphCategoryNames[page.category] || page.category}</small><h2>{page.title}</h2><p>{page.excerpt}</p></PageLink>)}</div></section>}
      {sources.length > 0 && <section className="search-group"><SectionHeading title={`生活记录 · ${sources.length}`} action={<NavLink to="/sources">查看全部生活记录</NavLink>} /><div className="search-results">{sources.map((page) => <PageLink page={page} key={page.id} className="search-result"><small>生活记录 · {page.relativePath}</small><h2>{page.title}</h2><p>{page.excerpt}</p></PageLink>)}</div></section>}
      {!data.length && <Empty>没有找到相关内容。换一个关键词，或者先带进一段新的生活记录。</Empty>}
    </div>
  );
}

export function Reader({ revision }: { revision: number }) {
  const params = useParams();
  const pageId = params["*"] || "";
  const { data: page, loading, error } = useApi<WikiPage>(`/api/pages/${pageId}`, revision);
  const location = useLocation();
  const navigate = useNavigate();
  const returnContext = location.state as ReturnContext | null;
  if (loading) return <Loading />;
  if (error || !page) return <Empty>{error || "页面不存在"}</Empty>;

  function goBack() {
    if (returnContext?.returnTo) navigate(returnContext.returnTo);
    else navigate(page?.isSource ? "/sources/materials" : "/knowledge", { replace: true });
  }

  return (
    <div className="reader-layout">
      <article className="reader">
        <button className="context-back" onClick={goBack}><Icon name="back" size={16} />{returnContext?.returnLabel || (page.isSource ? "返回生活记录" : "返回已有理解")}</button>
        <div className="reader-meta"><span>{page.category}</span><time>{page.end || page.start || ""}</time></div>
        <EditableDocument page={page} onRenamed={(renamed) => navigate(pageHref(renamed.id), { replace: true, state: returnContext })} />
      </article>
      <aside className="evidence-panel">
        {!page.isSource && <DocumentOutline markdown={page.markdown} headingPrefix={documentHeadingPrefix(page.id)} />}
        <h3>证据与关联</h3>
        {page.sources.length > 0 && <><b>来源</b><ul>{page.sources.slice(0, 12).map((source) => <li key={source}>{source}</li>)}</ul></>}
        {page.incomingLinks.length > 0 && <><b>被这些页面引用</b><ul>{page.incomingLinks.slice(0, 15).map((source) => <li key={source.id}><PageLink page={source} /></li>)}</ul></>}
      </aside>
      <ContextualAgentDock revision={revision} context={{ scope: `${page.isSource ? "原始材料" : "知识页面"} · ${graphCategoryNames[page.category] || page.category}`, title: page.title, pageId: page.id, summary: page.excerpt, defaultMode: page.isSource ? "read" : "write", launcherLabel: page.isSource ? "询问这份证据" : "补充当前页面", suggestions: page.isSource ? ["这份原始记录可以支持哪些已有判断？请区分直接证据和推断。", "这份记录与哪些人生阶段、人物或反复循环有关？"] : ["我想补充一段与当前页面有关的新经历，请按现有规则更新。", "请检查当前页面是否缺少来源、反例、关联或状态追踪。"] }} />
    </div>
  );
}
