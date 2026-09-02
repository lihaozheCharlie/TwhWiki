import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LettersView, LifeMapView, ReasoningLens, RelationshipsView, SectionedPageView, SourceImportBatch, StructuredCard, WikiPage, WikiPageSummary, WikiRun } from "@the-way-here/shared";
import { useApi } from "../../api";
import { categoryMeta, graphCategoryNames, growthTabs, type ReturnContext } from "../../app/config";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { letterRunVersions, openContextAgent, type LetterRunVersion } from "../collaboration/model";
import { DocumentOutline, EditableDocument, MarkdownBody, documentHeadingPrefix } from "../../shared/markdown";
import { apiPageHref, PageLink, pageHref } from "../../shared/routing";
import { CollapsibleIndexPane, Empty, Icon, Loading, PageHeader, SectionHeading, SectionTabs } from "../../shared/ui";
import { UnderstandingBanner } from "./UnderstandingLayout";
import { orderLifeStagesFromPresent } from "./life-atlas";
import { filterAndSortPeople, formatRelationshipDate, personRoleIds, primaryPersonRole, rolePersonCount, toggleRelationshipSelection, type RelationshipSort } from "./relationships-model";

export function Timeline({ revision }: { revision: number }) {
  const { data, loading, error } = useApi<LifeMapView>("/api/views/life-map", revision);
  const [params, setParams] = useSearchParams();
  if (loading) return <Loading label="正在展开人生地图" />;
  if (error || !data) return <Empty>{error || "暂无人生阶段"}</Empty>;
  const orderedStages = orderLifeStagesFromPresent(data.stages);
  const selected = orderedStages.find((stage) => stage.page.id === params.get("stage")) || orderedStages.find((stage) => stage.current && stage.lane === 0) || orderedStages[0];
  const selectStage = (id: string) => setParams((current) => { const next = new URLSearchParams(current); next.set("stage", id); return next; });
  return (
    <div className="life-map-page understanding-life-page">
      <UnderstandingBanner tone="life" title="人生轨迹" description="沿着阶段与转折回看一路走来的变化。这里保留时间顺序，也保留同一时期并行发生的人生线索。" count={data.stages.length + data.events.length} countLabel="个阶段与转折" />
      <section className="understanding-timeline" aria-label="人生阶段时间线">
        <div className="understanding-timeline-item is-now"><i /><div><span>现在</span><p>从此刻向过去回看，新的经历会继续补在最上方。</p></div></div>
        {orderedStages.map((stage) => {
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
  const [roleId, setRoleId] = useState("all");
  const [sort, setSort] = useState<RelationshipSort>("recent");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  const people = data?.groups.flatMap((item) => item.people.map((person) => ({ person, group: item.name }))) || [];
  const filtered = data ? filterAndSortPeople(people, data.roles, roleId, query, sort) : [];
  const selected = filtered.find(({ person }) => person.id === params.get("person"));
  useEffect(() => {
    if (selected) selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected?.person.id]);
  if (loading) return <Loading label="正在整理人物与关系" />;
  if (error || !data) return <Empty>{error || "暂无人物"}</Empty>;
  const relationshipRoles = data.roles;
  function selectPerson(id?: string, replace = false) { setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("person", id); else next.delete("person"); return next; }, { replace }); }
  function changeRole(nextRoleId: string) { setRoleId(nextRoleId); setVisibleCount(50); selectPerson(undefined, true); }
  function choosePerson(id: string) {
    const item = people.find(({ person }) => person.id === id);
    const primaryRole = item ? primaryPersonRole(item.person, relationshipRoles) : undefined;
    setRoleId(primaryRole?.id || "all");
    selectPerson(id);
  }
  function closePerson() {
    const trigger = selectedCardRef.current;
    selectPerson(undefined);
    requestAnimationFrame(() => trigger?.focus());
  }
  function togglePersonCard(id: string) {
    const nextId = toggleRelationshipSelection(selected?.person.id, id);
    if (!nextId) {
      closePerson();
      return;
    }
    choosePerson(nextId);
  }
  if (!people.length && data.roles.length) return <div className="understanding-people-page"><UnderstandingBanner tone="people" title="人与世界" description="具体人物还没有形成页面，可以先从已经整理出的关系角色继续阅读。" count={data.roles.length} countLabel="个关系角色" /><StructuredExplorer cards={data.roles} revision={revision} contextScope="人与世界 · 关系角色" /></div>;
  const networkRoles = data.roles.slice(0, 6);
  const networkRoleIds = new Set(networkRoles.map((role) => role.id));
  const networkPeople = people.filter(({ person }) => { const role = primaryPersonRole(person, data.roles); return role && networkRoleIds.has(role.id); }).sort((a, b) => b.person.mentionCount - a.person.mentionCount).slice(0, 12);
  const rolePositions = networkRoles.map((role, index) => ({ role, tone: index % 4 + 1, x: 190 + Math.cos((Math.PI * 2 * index) / Math.max(networkRoles.length, 1) - Math.PI / 2) * 104, y: 190 + Math.sin((Math.PI * 2 * index) / Math.max(networkRoles.length, 1) - Math.PI / 2) * 104 }));
  const personPositions = networkPeople.map((item, index) => {
    const primaryRole = primaryPersonRole(item.person, data.roles);
    return { ...item, primaryRole, tone: Math.max(0, data.roles.findIndex((role) => role.id === primaryRole?.id)) % 4 + 1, x: 190 + Math.cos((Math.PI * 2 * index) / Math.max(networkPeople.length, 1) - Math.PI / 2) * 164, y: 190 + Math.sin((Math.PI * 2 * index) / Math.max(networkPeople.length, 1) - Math.PI / 2) * 164 };
  });
  const activeRole = data.roles.find((role) => role.id === roleId);
  const selectedRole = selected ? primaryPersonRole(selected.person, data.roles) : activeRole;
  const selectedRoleTone = selectedRole ? Math.max(0, data.roles.findIndex((role) => role.id === selectedRole.id)) % 4 + 1 : 0;
  const selectedIndex = selected ? filtered.findIndex(({ person }) => person.id === selected.person.id) : -1;
  const renderCount = Math.max(visibleCount, selectedIndex + 1);
  return <div className="understanding-people-page">
    <header className="relationships-page-head"><div><h1>人与世界</h1><p>找到一个具体的人，也看见一段关系在生命里承担的功能；左侧的关系网络与右侧的人物列表始终保持同步。</p></div><div className="relationships-head-stat"><b>{data.totalPeople + data.roles.length}</b><span>个人与关系角色</span></div></header>
    <div className="relationships-workspace">
      <div className="relationships-graph-col">
        <section className="relationships-graph-card" aria-labelledby="relationship-web-title">
          <header><h2 id="relationship-web-title">关系网络</h2><span>{networkPeople.length} 个高关联人物</span></header>
          <p>线条来自人物页已记录的关系角色；点击任意节点，右侧列表会自动高亮并展开对应的人。</p>
          <svg viewBox="0 0 380 380" role="group" aria-label="人物与关系角色网络">
            <g className="relationships-edges">{rolePositions.map(({ role, x, y, tone }) => <line key={`self-${role.id}`} className={`tone-${tone}${roleId === role.id ? " is-active" : ""}`} x1="190" y1="190" x2={x} y2={y} />)}{personPositions.map(({ person, primaryRole, x, y, tone }) => { const linkedRole = rolePositions.find(({ role }) => role.id === primaryRole?.id)!; return <line key={`person-${person.id}`} className={`tone-${tone}${selected?.person.id === person.id ? " is-active" : ""}`} x1={linkedRole.x} y1={linkedRole.y} x2={x} y2={y} />; })}</g>
            <g className="relationships-center"><circle cx="190" cy="190" r="26" /><text x="190" y="194">我</text></g>
            {rolePositions.map(({ role, x, y, tone }) => <g className={`relationships-role-node tone-${tone}${roleId === role.id ? " is-selected" : ""}`} role="button" tabIndex={0} aria-label={`筛选关系角色：${role.title}`} aria-pressed={roleId === role.id} key={role.id} transform={`translate(${x} ${y})`} onClick={() => changeRole(role.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); changeRole(role.id); } }}><circle r="22" /><text y="4">{role.title.slice(0, 6)}</text></g>)}
            {personPositions.map(({ person, x, y, tone, primaryRole }) => { const dimmed = roleId !== "all" && !personRoleIds(person, data.roles).includes(roleId); const isSelected = selected?.person.id === person.id; const radius = Math.min(11, 5.5 + person.mentionCount / 8); return <g className={`relationships-person-node tone-${tone}${isSelected ? " is-selected" : ""}${dimmed ? " is-dim" : ""}`} role="button" tabIndex={0} aria-label={`查看 ${person.title}${primaryRole ? `，${primaryRole.title}` : ""}`} aria-expanded={isSelected} key={person.id} transform={`translate(${x} ${y})`} onClick={() => choosePerson(person.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePerson(person.id); } }}><circle r={radius} /><text y={radius + 12}>{person.title.slice(0, 7)}</text></g>; })}
          </svg>
          <footer>{networkRoles.map((role, index) => <button type="button" className={`tone-${index % 4 + 1}${roleId === role.id ? " is-active" : ""}`} aria-pressed={roleId === role.id} key={role.id} onClick={() => changeRole(role.id)}><i />{role.title}</button>)}</footer>
        </section>
        <aside className={`relationships-bridge tone-${selectedRoleTone}`} aria-live="polite"><Icon name="route" size={17} /><div><div><span>我</span><i>→</i>{selectedRole ? <><span>{selectedRole.title}</span><i>→</i></> : null}<span>{selected ? selected.person.title : activeRole ? "正在筛选右侧列表" : "点击左侧节点"}</span></div><p>{selected ? `已在右侧展开 ${selected.person.title} 的完整人物页。` : activeRole ? `右侧只显示与“${activeRole.title}”有明确连接的人。` : "图谱与列表共用同一套颜色，选中后会自动联动。"}</p></div></aside>
      </div>
      <section className="relationships-list-col" aria-label="人物列表">
        <div className="relationships-toolbar"><label><Icon name="search" size={16} /><input name="people-search" autoComplete="off" aria-label="搜索人物" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); selectPerson(undefined, true); }} placeholder="搜索姓名、别名或人物线索…" /><span aria-live="polite">{filtered.length} 人</span></label><div role="group" aria-label="人物排序">{[["recent", "最近影响"], ["connected", "关联最多"], ["name", "按姓名"]].map(([value, label]) => <button type="button" key={value} className={sort === value ? "active" : ""} aria-pressed={sort === value} onClick={() => { setSort(value as RelationshipSort); setVisibleCount(50); selectPerson(undefined, true); }}>{label}</button>)}</div></div>
        <div className="relationships-role-filters" aria-label="按关系角色筛选"><button type="button" className={roleId === "all" ? "active tone-0" : "tone-0"} aria-pressed={roleId === "all"} onClick={() => changeRole("all")}><i />全部 <span>{data.totalPeople}</span></button>{data.roles.map((role, index) => <button type="button" className={`tone-${index % 4 + 1}${roleId === role.id ? " active" : ""}`} aria-pressed={roleId === role.id} key={role.id} onClick={() => changeRole(role.id)}><i />{role.title} <span>{rolePersonCount(people, role, data.roles)}</span></button>)}</div>
        {filtered.length ? <div className="relationships-people-grid">{filtered.slice(0, renderCount).map(({ person, group: groupName }, index) => { const primaryRole = primaryPersonRole(person, data.roles); const tone = primaryRole ? Math.max(0, data.roles.findIndex((role) => role.id === primaryRole.id)) % 4 + 1 : 0; const isSelected = selected?.person.id === person.id; return <React.Fragment key={person.id}><button ref={isSelected ? selectedCardRef : undefined} type="button" className={`relationships-person-card tone-${tone}${isSelected ? " is-selected" : ""}`} aria-expanded={isSelected} onClick={() => togglePersonCard(person.id)}><span className="relationships-avatar">{person.title.slice(0, 1)}</span><span className="relationships-person-body"><span className="relationships-person-title"><b>{person.title}</b><time dateTime={person.lastMention}>{formatRelationshipDate(person.lastMention)}</time></span><span className="relationships-role-chip"><i />{primaryRole?.title || groupName} · {person.mentionCount} 处关联</span><span className="relationships-person-excerpt">{person.excerpt || "这个人物页还没有可以展示的摘要。"}</span></span></button>{isSelected ? <article className={`relationships-person-detail tone-${tone}${index % 2 ? " detail-from-right" : ""}`} aria-live="polite"><button type="button" className="relationships-detail-close" aria-label={`收起 ${person.title}`} onClick={closePerson}><Icon name="close" size={14} /></button><header><span className="relationships-avatar">{person.title.slice(0, 1)}</span><div><h2>{person.title}</h2><p>{person.aliases.length ? `别名 · ${person.aliases.join(" · ")}` : "暂无别名记录"}</p></div></header><div className="relationships-detail-links">{person.relatedStages.map((page) => <PageLink key={page.id} page={page}>阶段 · {page.title}</PageLink>)}{person.relatedRoles.map((page) => <PageLink key={page.id} page={page}>角色 · {page.title}</PageLink>)}{person.relatedSystems.map((page) => <PageLink key={page.id} page={page}>系统 · {page.title}</PageLink>)}</div><EmbeddedPagePreview key={person.id} page={person} revision={revision} onRenamed={(renamed) => selectPerson(renamed.id, true)} /></article> : null}</React.Fragment>; })}{renderCount < filtered.length ? <button type="button" className="relationships-load-more" onClick={() => setVisibleCount((value) => Math.max(value, renderCount) + 50)}>继续显示 {Math.min(50, filtered.length - renderCount)} 人</button> : null}</div> : <Empty>没有匹配的人物。可以换一个关键词，或清除当前角色筛选。</Empty>}
      </section>
    </div>
    <ContextualAgentDock revision={revision} context={{ scope: `人与世界 · ${selectedRole?.title || "全部人物"}`, title: selected?.person.title || "补充一个重要人物", pageId: selected?.person.id, summary: selected?.person.excerpt || "当前还没有选中的人物。", defaultMode: "write", launcherLabel: selected ? "补充这个人物" : "补充重要人物", suggestions: [selected ? `我想补充一段与${selected.person.title}有关的经历，请更新人物页和受影响的关系结构。` : "我想起了一个重要人物还没有记录，请帮我创建人物页并连接到合适的关系角色。", "请检查当前人物记录是否遗漏了别名、关系功能或关键经历。"] }} />
  </div>;
}

export function Cards({ revision, category }: { revision: number; category: "personal-lines" | "cycles" | "systems" }) {
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
      <UnderstandingBanner tone="life" title="近况回信" description="从过去的记录回望此刻，让当时的经历与现在重新发生联系。" count={data.letters.length} countLabel="封近况回信" />
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
  const { data: importBatches } = useApi<SourceImportBatch[]>(pageId ? "/api/imports" : "", revision);
  const location = useLocation();
  const navigate = useNavigate();
  const returnContext = location.state as ReturnContext | null;
  if (loading) return <Loading />;
  if (error || !page) return <Empty>{error || "页面不存在"}</Empty>;
  const buildProvenance = (importBatches || []).flatMap((batch) => batch.files.map((file) => ({ batch, file }))).filter(({ file }) => file.builtRefs?.some((ref) => ref.pageId === page.id));

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
        {buildProvenance.length > 0 && <div className="knowledge-build-provenance"><b>这条理解怎样形成</b>{buildProvenance.map(({ batch, file }) => {
          const sourceId = file.storedPath.replace(/\.md$/i, "");
          return <div key={`${batch.id}-${file.storedPath}`}><span>来自：{file.originalName}</span>{file.buildKind !== "direct" && <span>经由：一次对话沉淀</span>}<NavLink to={`/sources?${new URLSearchParams({ file: sourceId })}`}>查看原始记录</NavLink>{file.buildRunId ? <button type="button" onClick={() => openContextAgent({ runId: file.buildRunId })}>查看对话全文</button> : null}</div>;
        })}</div>}
        {page.sources.length > 0 && <><b>来源</b><ul>{page.sources.slice(0, 12).map((source) => <li key={source}>{source}</li>)}</ul></>}
        {page.incomingLinks.length > 0 && <><b>被这些页面引用</b><ul>{page.incomingLinks.slice(0, 15).map((source) => <li key={source.id}><PageLink page={source} /></li>)}</ul></>}
      </aside>
      <ContextualAgentDock revision={revision} context={{ scope: `${page.isSource ? "原始材料" : "知识页面"} · ${graphCategoryNames[page.category] || page.category}`, title: page.title, pageId: page.id, summary: page.excerpt, defaultMode: page.isSource ? "read" : "write", launcherLabel: page.isSource ? "询问这份证据" : "补充当前页面", suggestions: page.isSource ? ["这份原始记录可以支持哪些已有判断？请区分直接证据和推断。", "这份记录与哪些人生阶段、人物或反复循环有关？"] : ["我想补充一段与当前页面有关的新经历，请按现有规则更新。", "请检查当前页面是否缺少来源、反例、关联或状态追踪。"] }} />
    </div>
  );
}
