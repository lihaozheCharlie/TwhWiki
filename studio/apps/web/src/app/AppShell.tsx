import React, { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import type { VaultInfo } from "@the-way-here/shared";
import { api, useApi } from "../api";
import { navigation, type ReturnContext } from "./config";
import { ConfirmDeleteDialog } from "../shared/ConfirmDeleteDialog";
import { Icon } from "../shared/ui";
import { OrganizedSources } from "../features/sources/Sources";
import { FocusWorkspace, GrowthHub, KnowledgeHome, QuestionsHub, Today } from "../features/overview/OverviewPages";
import { Cards, Letters, MentalModels, Reader, Relationships, SearchResults, Timeline } from "../features/knowledge/KnowledgePages";
import { CreateKnowledgeBaseDialog, DemoKnowledgeBaseNotice } from "../features/knowledge-bases/KnowledgeBaseOnboarding";

const CREATE_KNOWLEDGE_BASE = "__create_knowledge_base__";
type KnowledgeBaseSummary = VaultInfo["knowledgeBases"][number];

function GlobalKnowledgeBaseSwitcher({ vault, disabled, onChange, onCreate, onDelete }: { vault: VaultInfo; disabled: boolean; onChange: (knowledgeBaseId: string) => void; onCreate: () => void; onDelete: (knowledgeBase: KnowledgeBaseSummary) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = vault.knowledgeBases.find((knowledgeBase) => knowledgeBase.id === vault.knowledgeBaseId) || vault.knowledgeBases[0];

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>(".global-kb-trigger")?.focus();
      }
    }
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseKnowledgeBase(knowledgeBaseId: string) {
    setOpen(false);
    onChange(knowledgeBaseId);
  }

  return <div className="global-kb-switcher" ref={rootRef}>
    <button className="global-kb-trigger" type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls="global-kb-menu" onClick={() => setOpen((current) => !current)}>
      <Icon name="spark" size={15} />
      <span>{active?.name || "个人空间"}</span>
      <Icon name="down" size={14} />
    </button>
    {open ? <div className="global-kb-menu" id="global-kb-menu" role="menu" aria-label="切换知识库">
      <div className="global-kb-menu-heading"><b>切换知识库</b><span>每个空间有各自的记录、理解和对话。</span></div>
      <div className="global-kb-options">
        {vault.knowledgeBases.map((knowledgeBase) => {
          const selected = knowledgeBase.id === vault.knowledgeBaseId;
          const demo = knowledgeBase.id.toLowerCase() === "demo";
          return <div className="global-kb-option-row" key={knowledgeBase.id}>
            <button className="global-kb-option-main" type="button" role="menuitemradio" aria-checked={selected} onClick={() => chooseKnowledgeBase(knowledgeBase.id)}>
              <span className="global-kb-check">{selected ? <Icon name="check" size={15} /> : null}</span>
              <span className="global-kb-option-copy"><span>{knowledgeBase.name}{demo ? <small>演示</small> : null}</span><small>{demo ? "预置的示例记忆，可以先感受被记住的体验" : `来自「${knowledgeBase.name}」的生活记录与已有理解`}</small></span>
            </button>
            {!demo ? <button className="global-kb-delete" type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(knowledgeBase); }} aria-label={`删除知识库「${knowledgeBase.name}」`} title="删除知识库"><Icon name="trash" size={15} /></button> : null}
          </div>;
        })}
      </div>
      <button className="global-kb-create" type="button" role="menuitem" onClick={() => { setOpen(false); onCreate(); }}>新建一个知识库 <Icon name="arrow" size={14} /></button>
    </div> : null}
  </div>;
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
  const [createKnowledgeBaseOpen, setCreateKnowledgeBaseOpen] = useState(false);
  const [deleteKnowledgeBaseTarget, setDeleteKnowledgeBaseTarget] = useState<KnowledgeBaseSummary>();

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
    setSwitchingKnowledgeBaseName(nextKnowledgeBase?.name || "所选空间");
    setKnowledgeBaseError("");
    try {
      await api<{ ok: boolean; knowledgeBaseId: string }>("/api/vault/select", {
        method: "POST",
        body: JSON.stringify({ knowledgeBaseId }),
      });
      let destination = location.pathname;
      if (destination.startsWith("/page/")) destination = isSourceReader ? "/sources" : "/knowledge";
      else if (destination.startsWith("/focus/")) destination = "/questions";
      window.location.assign(destination);
    } catch (reason: any) {
      setKnowledgeBaseSwitching(false);
      setKnowledgeBaseError(reason.message);
    }
  }

  async function createKnowledgeBase(name: string) {
    setKnowledgeBaseSwitching(true);
    setSwitchingKnowledgeBaseName(name);
    setKnowledgeBaseError("");
    try {
      await api<{ id: string; name: string; knowledgeBaseId: string }>("/api/vault", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      window.location.assign("/");
    } catch (reason: any) {
      setKnowledgeBaseSwitching(false);
      throw reason;
    }
  }

  async function deleteKnowledgeBase() {
    if (!deleteKnowledgeBaseTarget) return;
    await api<{ id: string; name: string; fallbackId: string }>(`/api/vault/${encodeURIComponent(deleteKnowledgeBaseTarget.id)}`, { method: "DELETE" });
    window.location.assign("/");
  }

  function closeDeleteKnowledgeBaseDialog() {
    setDeleteKnowledgeBaseTarget(undefined);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(".global-kb-trigger")?.focus(), 0);
  }

  const personalKnowledgeBase = vault?.knowledgeBases.find((item) => item.id.toLowerCase() !== "demo");

  return (
    <div className={`app-shell${activeSection?.children.length ? " has-local-nav" : ""}`}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="global-header">
        <div className="global-header-inner">
          <div className="global-identity">
            <NavLink to="/" className="global-brand" translate="no" aria-label="The Way Here 首页"><span>The Way</span><b>Here</b></NavLink>
            {vault ? <GlobalKnowledgeBaseSwitcher vault={vault} disabled={knowledgeBaseSwitching} onChange={(knowledgeBaseId) => void switchKnowledgeBase(knowledgeBaseId)} onCreate={() => setCreateKnowledgeBaseOpen(true)} onDelete={setDeleteKnowledgeBaseTarget} /> : null}
          </div>
          <nav id="main-navigation" className="global-navigation" aria-label="主要导航">
            {navigation.map((item) => {
              const active = mainItemActive(item);
              return <NavLink key={item.to} to={item.to} end={item.to === "/"} className={active ? "active" : ""}>{item.label}</NavLink>;
            })}
          </nav>
          <form id="global-search" className="global-search" onSubmit={submitSearch} role="search">
            <Icon name="search" size={16} />
            <input name="global-search" autoComplete="off" aria-label="搜索生活记录与已有理解" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记录与已有理解…" />
          </form>
        </div>
      </header>
      {activeSection && activeSection.children.length > 0 ? <div className="local-navigation">
        <div className="local-navigation-inner">
          <nav id="local-navigation-links" aria-label={`${activeSection.label}分类`}>
            {activeSection.children.map((child, index) => <React.Fragment key={child.to}>
              <NavLink to={child.to} end={child.to === "/knowledge"} aria-current={childItemActive(child) ? "page" : undefined} className={`${childItemActive(child) ? "active" : ""}${index === 0 ? " root-tab" : ""}`}>{child.label}</NavLink>
              {index === 0 ? <span className="local-navigation-separator" aria-hidden="true" /> : null}
            </React.Fragment>)}
          </nav>
        </div>
      </div> : null}
      <main className="main-area" id="main-content" tabIndex={-1}>
        {knowledgeBaseSwitching ? <div className="knowledge-base-transition" role="status" aria-live="polite"><span />正在打开「{switchingKnowledgeBaseName}」…</div> : null}
        {knowledgeBaseError ? <div className="knowledge-base-error" role="alert">{knowledgeBaseError}</div> : null}
        <div className="page-frame">
          {location.pathname !== "/" && location.pathname !== "/questions" && vault?.knowledgeBaseId.toLowerCase() === "demo" ? <DemoKnowledgeBaseNotice
            hasPersonalKnowledgeBase={Boolean(personalKnowledgeBase)}
            onCreate={() => setCreateKnowledgeBaseOpen(true)}
            onOpenPersonal={() => personalKnowledgeBase && void switchKnowledgeBase(personalKnowledgeBase.id)}
          /> : null}
          <Routes>
            <Route path="/" element={<Today revision={revision} />} />
            <Route path="/questions" element={<QuestionsHub revision={revision} />} />
            <Route path="/sources" element={<OrganizedSources revision={revision} />} />
            <Route path="/sources/materials" element={<OrganizedSources revision={revision} />} />
            <Route path="/knowledge" element={<KnowledgeHome revision={revision} />} />
            <Route path="/focus/:signalId" element={<FocusWorkspace revision={revision} />} />
            <Route path="/insights" element={<GrowthHub revision={revision} />} />
            <Route path="/timeline" element={<Timeline revision={revision} />} />
            <Route path="/relationships" element={<Relationships revision={revision} />} />
            <Route path="/cards/personal-lines" element={<Cards revision={revision} category="personal-lines" />} />
            <Route path="/cards/cycles" element={<Cards revision={revision} category="cycles" />} />
            <Route path="/cards/systems" element={<Cards revision={revision} category="systems" />} />
            <Route path="/letters" element={<Letters revision={revision} />} />
            <Route path="/mental-models" element={<MentalModels revision={revision} />} />
            <Route path="/search" element={<SearchResults revision={revision} />} />
            <Route path="/page/*" element={<Reader revision={revision} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      {createKnowledgeBaseOpen ? <CreateKnowledgeBaseDialog onClose={() => setCreateKnowledgeBaseOpen(false)} onSubmit={createKnowledgeBase} /> : null}
      {deleteKnowledgeBaseTarget ? <ConfirmDeleteDialog
        title="删除这个知识库？"
        description="其中的生活记录和已有理解会从本机永久删除。"
        itemName={deleteKnowledgeBaseTarget.name}
        impact={deleteKnowledgeBaseTarget.id === vault?.knowledgeBaseId ? "这是当前打开的知识库。删除后会自动打开另一个保留的空间；此操作不能撤销。" : "这个知识库的日记、导入材料和构建出的理解都会一起删除；此操作不能撤销。"}
        confirmLabel="删除知识库"
        onClose={closeDeleteKnowledgeBaseDialog}
        onConfirm={deleteKnowledgeBase}
      /> : null}
    </div>
  );
}
