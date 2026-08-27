import React, { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import type { VaultInfo } from "@the-way-here/shared";
import { api, useApi } from "../api";
import { navigation, type ReturnContext } from "./config";
import { Icon } from "../shared/ui";
import { OrganizedSources } from "../features/sources/Sources";
import { AdvancedBuild, FocusWorkspace, GrowthHub, KnowledgeHome, Today } from "../features/overview/OverviewPages";
import { Cards, KnowledgeGraph, Letters, Library, MentalModels, Quotes, Reader, Relationships, SearchResults, Timeline } from "../features/knowledge/KnowledgePages";
import { RunDetail, Workbench } from "../features/collaboration/Collaboration";

function GlobalKnowledgeBaseSwitcher({ vault, disabled, onChange }: { vault: VaultInfo; disabled: boolean; onChange: (knowledgeBaseId: string) => void }) {
  if (vault.knowledgeBases.length < 2) return null;
  return <label className="global-kb-switcher" title="切换知识库">
    <Icon name="library" size={14} />
    <span className="sr-only">当前知识库</span>
    <select aria-label="切换知识库" value={vault.knowledgeBaseId} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {vault.knowledgeBases.map((knowledgeBase) => <option key={knowledgeBase.id} value={knowledgeBase.id}>{knowledgeBase.name}</option>)}
    </select>
    <Icon name="down" size={13} />
  </label>;
}

export function AppShell({ revision }: { revision: number }) {
  const { data: vault } = useApi<VaultInfo>("/api/vault", revision);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const readerReturnContext = location.state as ReturnContext | null;
  const isSourceReader = location.pathname.startsWith("/page/") && readerReturnContext?.returnTo.startsWith("/sources");
  const [query, setQuery] = useState("");
  const [knowledgeBaseSwitching, setKnowledgeBaseSwitching] = useState(false);
  const [switchingKnowledgeBaseName, setSwitchingKnowledgeBaseName] = useState("");
  const [knowledgeBaseError, setKnowledgeBaseError] = useState("");

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function mainItemActive(item: (typeof navigation)[number]): boolean {
    if (item.to === "/") return location.pathname === "/";
    if (location.pathname.startsWith("/page/")) {
      if (item.to === "/sources") return Boolean(isSourceReader);
      if (item.to === "/knowledge") return !isSourceReader;
    }
    return item.active.some((prefix) => location.pathname.startsWith(prefix));
  }

  function childItemActive(child: { readonly to: string; readonly active: readonly string[] }): boolean {
    if (child.to === "/sources") return location.pathname === "/sources" || location.pathname === "/sources/materials" || (Boolean(isSourceReader) && !readerReturnContext?.returnTo.startsWith("/sources/import"));
    if (child.to === "/sources/import") return location.pathname.startsWith("/sources/import") || (Boolean(isSourceReader) && Boolean(readerReturnContext?.returnTo.startsWith("/sources/import")));
    return child.active.some((prefix) => location.pathname.startsWith(prefix));
  }

  const activeSection = navigation.find((item) => mainItemActive(item));
  useEffect(() => {
    if (navigationType !== "POP") window.scrollTo({ top: 0 });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [location.pathname, navigationType]);

  async function switchKnowledgeBase(knowledgeBaseId: string) {
    if (!vault || knowledgeBaseId === vault.knowledgeBaseId || knowledgeBaseSwitching) return;
    const nextKnowledgeBase = vault.knowledgeBases.find((item) => item.id === knowledgeBaseId);
    setKnowledgeBaseSwitching(true);
    setSwitchingKnowledgeBaseName(nextKnowledgeBase?.name || "所选知识库");
    setKnowledgeBaseError("");
    try {
      await api<{ ok: boolean; knowledgeBaseId: string }>("/api/vault/select", {
        method: "POST",
        body: JSON.stringify({ knowledgeBaseId }),
      });
      let destination = location.pathname;
      if (destination.startsWith("/page/")) destination = isSourceReader ? "/sources" : "/knowledge";
      else if (destination.startsWith("/focus/")) destination = "/";
      else if (/^\/workbench\/.+/.test(destination)) destination = "/workbench";
      window.location.assign(destination);
    } catch (reason: any) {
      setKnowledgeBaseSwitching(false);
      setKnowledgeBaseError(reason.message);
    }
  }

  return (
    <div className={`app-shell${activeSection?.children.length ? " has-local-nav" : ""}`}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="global-header">
        <div className="global-header-inner">
          <NavLink to="/" className="global-brand" translate="no" aria-label="The Way Here 首页"><span>The Way</span><b>Here</b></NavLink>
          {vault ? <GlobalKnowledgeBaseSwitcher vault={vault} disabled={knowledgeBaseSwitching} onChange={(knowledgeBaseId) => void switchKnowledgeBase(knowledgeBaseId)} /> : null}
          <nav id="main-navigation" className="global-navigation" aria-label="主要导航">
            {navigation.map((item) => {
              const active = mainItemActive(item);
              return <NavLink key={item.to} to={item.to} end={item.to === "/"} className={active ? "active" : ""}>{item.label}</NavLink>;
            })}
          </nav>
          <form id="global-search" className="global-search" onSubmit={submitSearch} role="search">
            <Icon name="search" size={16} />
            <input name="global-search" autoComplete="off" aria-label="搜索知识与原始材料" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识与原始材料…" />
          </form>
        </div>
      </header>
      {activeSection && activeSection.children.length > 0 ? <div className="local-navigation">
        <div className="local-navigation-inner">
          <nav id="local-navigation-links" aria-label={`${activeSection.label}分类`}>
            {activeSection.children.map((child) => <NavLink key={child.to} to={child.to} end={child.to === "/knowledge"} aria-current={childItemActive(child) ? "page" : undefined} className={childItemActive(child) ? "active" : ""}>{child.label}</NavLink>)}
          </nav>
        </div>
      </div> : null}
      <main className="main-area" id="main-content" tabIndex={-1}>
        {knowledgeBaseSwitching ? <div className="knowledge-base-transition" role="status" aria-live="polite"><span />正在打开「{switchingKnowledgeBaseName}」…</div> : null}
        {knowledgeBaseError ? <div className="knowledge-base-error" role="alert">{knowledgeBaseError}</div> : null}
        <div className="page-frame">
          <Routes>
            <Route path="/" element={<Today revision={revision} />} />
            <Route path="/sources" element={<OrganizedSources revision={revision} />} />
            <Route path="/sources/materials" element={<OrganizedSources revision={revision} />} />
            <Route path="/sources/import" element={<Navigate to="/sources" replace />} />
            <Route path="/knowledge" element={<KnowledgeHome revision={revision} />} />
            <Route path="/advanced" element={<AdvancedBuild revision={revision} />} />
            <Route path="/focus/:signalId" element={<FocusWorkspace revision={revision} />} />
            <Route path="/insights" element={<GrowthHub revision={revision} />} />
            <Route path="/timeline" element={<Timeline revision={revision} />} />
            <Route path="/relationships" element={<Relationships revision={revision} />} />
            <Route path="/graph" element={<KnowledgeGraph revision={revision} />} />
            <Route path="/cards/relationship-roles" element={<Relationships revision={revision} />} />
            <Route path="/cards/:category" element={<Cards revision={revision} />} />
            <Route path="/letters" element={<Letters revision={revision} />} />
            <Route path="/mental-models" element={<MentalModels revision={revision} />} />
            <Route path="/quotes" element={<Quotes revision={revision} />} />
            <Route path="/library" element={<Library revision={revision} />} />
            <Route path="/search" element={<SearchResults revision={revision} />} />
            <Route path="/page/*" element={<Reader revision={revision} />} />
            <Route path="/workbench" element={<Workbench revision={revision} />} />
            <Route path="/workbench/:runId" element={<RunDetail revision={revision} />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
