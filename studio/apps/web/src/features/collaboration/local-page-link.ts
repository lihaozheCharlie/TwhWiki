import { pageHref } from "../../shared/routing";

type LocalPagePath = { area: "wiki" | "sources"; relativePath: string };

function localPagePath(value: string): LocalPagePath | undefined {
  const normalized = value.replace(/\\/g, "/").replace(/^file:\/\//i, "");
  const current = /(?:^|\/)vault\/[^/]+\/(wiki|sources)\/(.+?)\.md(?::\d+(?::\d+)?)?(?:[?#].*)?$/.exec(normalized);
  const legacy = /(?:^|\/)vault\/(wiki|sources)\/(.+?)\.md(?::\d+(?::\d+)?)?(?:[?#].*)?$/.exec(normalized);
  const match = current || legacy;
  if (!match) return undefined;
  return { area: match[1] as LocalPagePath["area"], relativePath: match[2]! };
}

export function localWikiHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("/page/")) return href;
  try {
    const target = localPagePath(decodeURIComponent(href));
    return target ? pageHref(`${target.area}/${target.relativePath}`) : undefined;
  } catch {
    return undefined;
  }
}
