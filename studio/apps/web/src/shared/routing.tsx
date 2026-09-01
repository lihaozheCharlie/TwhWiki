import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { WikiPageSummary } from "@the-way-here/shared";
import type { ReturnContext } from "../app/config";

export function useLiveRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const events = new EventSource("/api/events");
    for (const event of ["index", "run", "approval", "file", "agent-settings"]) events.addEventListener(event, () => setRevision((value) => value + 1));
    return () => events.close();
  }, []);
  return revision;
}

export function pageHref(id: string): string {
  return `/page/${id.split("/").map(encodeURIComponent).join("/")}`;
}

export function apiPageHref(id: string): string {
  return `/api/pages/${id.split("/").map(encodeURIComponent).join("/")}`;
}

export function useReturnContext(): ReturnContext {
  const location = useLocation();
  return { returnTo: `${location.pathname}${location.search}`, returnLabel: returnLabelForPath(location.pathname) };
}

export function PageLink({ page, className = "", children }: { page: WikiPageSummary; className?: string; children?: ReactNode }) {
  const returnContext = useReturnContext();
  return <NavLink to={pageHref(page.id)} state={returnContext} className={className}>{children || page.title}</NavLink>;
}

function returnLabelForPath(pathname: string): string {
  if (pathname === "/") return "返回此刻";
  if (pathname === "/questions" || pathname.startsWith("/focus/")) return "返回值得聊聊";
  if (pathname === "/insights") return "返回理解自己";
  if (pathname === "/timeline") return "返回人生地图";
  if (pathname === "/letters") return "返回近况回信";
  if (pathname === "/relationships") return "返回人与世界";
  if (pathname === "/mental-models") return "返回思维模型";
  if (pathname.startsWith("/sources")) return "返回生活记录";
  if (pathname === "/knowledge") return "返回已有理解";
  if (pathname === "/search") return "返回搜索结果";
  if (pathname.startsWith("/cards/personal-lines")) return "返回个人主线";
  if (pathname.startsWith("/cards/cycles")) return "返回反复循环";
  if (pathname.startsWith("/cards/systems")) return "返回现实系统";
  if (pathname.startsWith("/page/")) return "返回上一篇内容";
  return "返回上一页";
}
