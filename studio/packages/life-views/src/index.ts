import type {
  FocusWorkspaceView,
  GraphData,
  LettersView,
  LifeMapView,
  LifeStageView,
  PageCategory,
  QuoteGroup,
  QuotesView,
  RelationshipsView,
  SectionedPageView,
  StateSignal,
  StructuredCard,
  TimelineItem,
  TodayView,
  WikiLink,
  WikiPage,
  WikiPageSummary,
} from "@the-way-here/shared";
import { extractSectionBlocks, extractWikiLinks, type WikiIndex } from "@the-way-here/wiki-core";

function normalizeDate(value?: string): string {
  if (!value) return "";
  const match = value.match(/((?:19|20)\d{2})[-./年](1[0-2]|0?[1-9])(?:[-./月](3[01]|[12]\d|0?[1-9]))?/);
  if (!match) return "";
  return `${match[1]}-${match[2]!.padStart(2, "0")}-${(match[3] || "01").padStart(2, "0")}`;
}

export function semanticDate(page: WikiPageSummary): string {
  const filenameDate = normalizeDate(page.title);
  if (page.category === "letters") return filenameDate || normalizeDate(page.end) || normalizeDate(page.start) || normalizeDate(page.modifiedAt);
  return normalizeDate(page.end) || normalizeDate(page.start) || filenameDate || normalizeDate(page.modifiedAt);
}

function intrinsicDate(page: WikiPageSummary): string {
  return normalizeDate(page.end) || normalizeDate(page.start) || normalizeDate(page.title);
}

const dateKey = semanticDate;

function resolveLink(index: WikiIndex, link: WikiLink): WikiPage | undefined {
  return index.get(link.resolvedId || link.target);
}

function uniquePages(pages: Array<WikiPageSummary | undefined>): WikiPageSummary[] {
  return [...new Map(pages.filter(Boolean).map((page) => [page!.id, page!])).values()];
}

function latestDateIn(value: string, fallbackYear: string): string | undefined {
  const dates = [...value.matchAll(/(?:19|20)\d{2}[-年/.](?:1[0-2]|0?[1-9])(?:[-月/.](?:3[01]|[12]\d|0?[1-9])日?)?/g)]
    .map((match) => match[0].replace(/[年/.]/g, "-").replace(/月/g, "-").replace(/日/g, ""))
    .map((date) => date.split("-").map((part, index) => index === 0 ? part : part.padStart(2, "0")).join("-"));
  const partialDates = [...value.matchAll(/(?<!\d)(?:1[0-2]|0?[1-9])[./月](?:3[01]|[12]\d|0?[1-9])日?(?!\d)/g)].map((match) => {
    const [month, day] = match[0].replace(/月/g, ".").replace(/日/g, "").split(".");
    return `${fallbackYear}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  });
  return [...dates, ...partialDates].sort().at(-1);
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitMarkdownTableRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let wikiDepth = 0;
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pair === "[[") wikiDepth += 1;
    if (pair === "]]" && wikiDepth > 0) wikiDepth -= 1;
    if (value[index] === "|" && wikiDepth === 0) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += value[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseStateSignals(page?: WikiPage): StateSignal[] {
  if (!page) return [];
  const section = page.sections.find((item) => item.heading === "当前追踪面板");
  if (!section) return [];
  const lines = section.body.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  if (lines.length < 3) return [];
  return lines.slice(2).flatMap((line) => {
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 4) return [];
    const links: WikiLink[] = [];
    for (const match of cells.slice(4).join("|").matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      links.push({ raw: match[0], target: match[1]!, label: match[2] || match[1]! });
    }
    return [{
      id: stripMarkdown(cells[0] || ""),
      name: stripMarkdown(cells[0] || ""),
      kind: stripMarkdown(cells[1] || ""),
      judgment: stripMarkdown(cells[2] || ""),
      observation: stripMarkdown(cells[3] || ""),
      links,
    }];
  });
}

function prioritizeSignals(signals: StateSignal[]): StateSignal[] {
  const years = signals.flatMap((signal) => [...`${signal.judgment} ${signal.observation}`.matchAll(/(?:19|20)\d{2}/g)].map((match) => match[0]));
  const fallbackYear = years.sort().at(-1) || String(new Date().getFullYear());
  const dated = signals.map((signal) => latestDateIn(`${signal.judgment} ${signal.observation}`, fallbackYear));
  const newest = dated.filter(Boolean).sort().at(-1);
  return signals.map((signal, index) => {
    const evidenceDate = dated[index];
    const score = (signal.kind.includes("需要关注") ? 40 : signal.kind.includes("优势") ? 6 : 18)
      + (evidenceDate && evidenceDate === newest ? 40 : evidenceDate ? 15 : 0)
      + Math.min(signal.links.length * 3, 15);
    const reason = evidenceDate && evidenceDate === newest
      ? `最近证据更新于 ${evidenceDate}，并连接 ${signal.links.length} 个知识页面`
      : signal.kind.includes("需要关注")
        ? `状态面板标记为需要关注，并连接 ${signal.links.length} 个知识页面`
        : `来自当前状态面板的持续观察`;
    return { ...signal, score, reason };
  }).sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function buildToday(index: WikiIndex): TodayView {
  const stages = index.list({ category: "life-stages" }).filter((page) => !page.title.includes("总览"));
  const letters = index.list({ category: "letters" }).filter((page) => !page.title.includes("总览"));
  const events = index.list({ category: "events" }).filter((page) => !page.title.includes("总览"));
  const lifeMap = buildLifeMap(index);
  const currentStages = lifeMap.stages.filter((stage) => stage.current).map((stage) => ({
    page: stage.page,
    range: stage.range,
    focus: stage.focus,
    lane: stage.lane,
  }));
  const currentStage = currentStages[0]?.page || stages.sort((a, b) => dateKey(b).localeCompare(dateKey(a)))[0];
  const latestLetter = letters.sort((a, b) => dateKey(b).localeCompare(dateKey(a)))[0];
  const latestEvent = events.sort((a, b) => dateKey(b).localeCompare(dateKey(a)))[0];
  const stateSummary = index.list({ category: "state" }).find((page) => page.title === "状态追踪总览");
  const stateSignals = parseStateSignals(stateSummary ? index.get(stateSummary.id) : undefined);
  const focusCandidates = prioritizeSignals(stateSignals);
  const focusPages = uniquePages((focusCandidates[0]?.links || [])
    .map((link) => resolveLink(index, link)))
    .filter((page) => !page.isSource && !["home", "maintenance", "state"].includes(page.category))
    .slice(0, 6);
  const recentPages = index
    .list({ sources: false })
    .filter((page) => !["home", "maintenance", "sources"].includes(page.category))
    .sort((a, b) => dateKey(b).localeCompare(dateKey(a)))
    .slice(0, 8);
  const guidingQuestion = focusCandidates[0]?.judgment;
  return { currentStage, currentStages, latestLetter, latestEvent, stateSignals, focusCandidates, focusPages, recentPages, guidingQuestion };
}

const focusCategoryLabels: Partial<Record<PageCategory, string>> = {
  "personal-lines": "长期主线", cycles: "反复循环", systems: "现实系统", "mental-models": "可用模型",
  "life-stages": "人生阶段", events: "关键事件", entities: "相关人物与地点", letters: "近况回信", sources: "原始证据",
};

export function buildFocusWorkspace(index: WikiIndex, signalId?: string): FocusWorkspaceView | undefined {
  const today = buildToday(index);
  const signal = today.focusCandidates.find((item) => item.id === signalId) || today.focusCandidates[0];
  if (!signal) return undefined;
  const directlyLinked = uniquePages(signal.links.map((link) => resolveLink(index, link)));
  const related = new Map<string, WikiPageSummary>();
  for (const pageSummary of directlyLinked) {
    const page = index.get(pageSummary.id);
    related.set(pageSummary.id, pageSummary);
    for (const link of page?.outgoingLinks || []) {
      const linked = resolveLink(index, link);
      if (linked && !["home", "maintenance"].includes(linked.category)) related.set(linked.id, linked);
    }
    for (const incoming of page?.incomingLinks || []) {
      if (!["home", "maintenance"].includes(incoming.category)) related.set(incoming.id, incoming);
    }
  }
  const grouped = [...related.values()].reduce<Map<PageCategory, WikiPageSummary[]>>((result, page) => {
    const entries = result.get(page.category) || [];
    entries.push(page);
    result.set(page.category, entries);
    return result;
  }, new Map());
  const relatedGroups = [...grouped.entries()]
    .filter(([category]) => focusCategoryLabels[category])
    .map(([category, pages]) => ({ category, label: focusCategoryLabels[category]!, pages: pages.sort((a, b) => semanticDate(b).localeCompare(semanticDate(a))).slice(0, 8) }))
    .sort((a, b) => Number(["personal-lines", "cycles", "systems", "mental-models"].includes(b.category)) - Number(["personal-lines", "cycles", "systems", "mental-models"].includes(a.category)));
  const kindFor = (page: WikiPageSummary): "source" | "letter" | "event" | "wiki" => page.isSource ? "source" : page.category === "letters" ? "letter" : page.category === "events" ? "event" : "wiki";
  const evidenceTimeline = [...related.values()]
    .filter((page) => page.isSource || ["letters", "events"].includes(page.category) || directlyLinked.some((direct) => direct.id === page.id))
    .map((page) => ({ date: semanticDate(page), label: page.title, excerpt: page.excerpt, kind: kindFor(page), page }))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const focusNodeId = `focus:${signal.id}`;
  const allowed = new Set([...related.keys(), ...directlyLinked.map((page) => page.id)]);
  const graphLinks: GraphData["links"] = directlyLinked.map((page) => ({ source: focusNodeId, target: page.id }));
  for (const id of allowed) {
    const page = index.get(id);
    for (const link of page?.outgoingLinks || []) if (link.resolvedId && allowed.has(link.resolvedId)) graphLinks.push({ source: id, target: link.resolvedId });
  }
  const graphPages = [...related.values()].slice(0, 45);
  const graph: GraphData = {
    focusId: focusNodeId,
    nodes: [{ id: focusNodeId, title: signal.name, category: "state", degree: directlyLinked.length, distance: 0 }, ...graphPages.map((page) => ({ id: page.id, title: page.title, category: page.category, distance: directlyLinked.some((item) => item.id === page.id) ? 1 : 2 }))],
    links: [...new Map(graphLinks.map((link) => [`${link.source}|${link.target}`, link])).values()].filter((link) => link.source === focusNodeId || graphPages.some((page) => page.id === link.source)).filter((link) => graphPages.some((page) => page.id === link.target)),
  };
  return { signal, candidates: today.focusCandidates, related: relatedGroups, evidenceTimeline, graph };
}

function yearRange(value: string): { start: number; end: number } | undefined {
  const years = [...value.matchAll(/(?:19|20)\d{2}/g)].map((match) => Number(match[0]));
  if (!years.length) return undefined;
  return { start: years[0]!, end: /至今|现在|current/i.test(value) ? 9999 : years[1] || years[0]! };
}

function eventOrder(page: WikiPageSummary): number {
  const prefix = page.title.match(/^(\d+)\s/)?.[1];
  return prefix ? Number(prefix) : Number.MAX_SAFE_INTEGER;
}

function stageYearRange(stage: LifeStageView): { start: number; end: number } | undefined {
  return yearRange(stage.range) || yearRange([stage.page.start, stage.page.end].filter(Boolean).join(" "));
}

function stageForEvent(index: WikiIndex, event: WikiPageSummary, stages: LifeStageView[]): LifeStageView | undefined {
  const eventPage = index.get(event.id);
  const representativeOwner = stages.find((stage) => stage.representative?.id === event.id);
  if (representativeOwner) return representativeOwner;
  const eventLinkedOwner = stages.find((stage) => eventPage?.outgoingLinks.some((link) => link.resolvedId === stage.page.id));
  if (eventLinkedOwner) return eventLinkedOwner;
  const stageLinkedOwner = stages.find((stage) => index.get(stage.page.id)?.outgoingLinks.some((link) => link.resolvedId === event.id));
  if (stageLinkedOwner) return stageLinkedOwner;

  const mainStages = stages.filter((stage) => stage.lane === 0);
  const eventYears = yearRange([event.start, event.end, event.title].filter(Boolean).join(" "));
  if (eventYears) {
    const datedOwner = mainStages.find((stage) => {
      const range = stageYearRange(stage);
      if (!range) return false;
      return eventYears.start >= range.start && (range.start === range.end ? eventYears.start === range.start : eventYears.start < range.end);
    });
    if (datedOwner) return datedOwner;
  }

  const orderedAnchors = mainStages
    .filter((stage) => stage.representative && eventOrder(stage.representative) !== Number.MAX_SAFE_INTEGER)
    .sort((a, b) => eventOrder(a.representative!) - eventOrder(b.representative!));
  const orderedOwner = [...orderedAnchors].reverse().find((stage) => eventOrder(stage.representative!) <= eventOrder(event));
  return orderedOwner || mainStages[0];
}

export function buildLifeMap(index: WikiIndex): LifeMapView {
  const overviewSummary = index.list({ category: "life-stages" }).find((page) => page.title.includes("总览"));
  const overview = overviewSummary ? index.get(overviewSummary.id) : undefined;
  const section = overview ? extractSectionBlocks(overview.markdown, 2).find((item) => item.heading.includes("阶段地图")) : undefined;
  const rows = section?.body.split(/\r?\n/).filter((line) => line.trim().startsWith("|")).slice(2) || [];
  const laneEnds: number[] = [];
  const stages: LifeStageView[] = [];

  for (const [order, line] of rows.entries()) {
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 3) continue;
    const stageLink = extractWikiLinks(cells[0] || "")[0];
    if (!stageLink) continue;
    const page = index.get(stageLink.target);
    if (!page) continue;
    const range = stripMarkdown(cells[1] || "待补充");
    const interval = yearRange(range);
    let lane = 0;
    if (interval) {
      lane = laneEnds.findIndex((end) => end <= interval.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = interval.end;
    }
    const representativeLink = extractWikiLinks(cells[3] || "")[0];
    const representative = representativeLink ? index.get(representativeLink.target) : undefined;
    const linkedEvents = page.outgoingLinks.flatMap((link) => {
      const linked = link.resolvedId ? index.get(link.resolvedId) : undefined;
      return linked?.category === "events" ? [linked] : [];
    });
    const relatedEvents = [...new Map(linkedEvents.map((event) => [event.id, event])).values()];
    if (representative && !relatedEvents.some((item) => item.id === representative.id)) relatedEvents.unshift(representative);
    const connected = uniquePages([page, ...relatedEvents].flatMap((item) => {
      const full = index.get(item.id);
      return (full?.outgoingLinks || []).map((link) => resolveLink(index, link));
    }));
    stages.push({
      page,
      range,
      focus: stripMarkdown(cells[2] || page.excerpt),
      lane,
      order,
      current: /至今|现在|current/i.test(range),
      representative,
      relatedEvents,
      relatedPeople: connected.filter((item) => item.category === "entities" && item.relativePath.split("/").includes("人物")),
      relatedPlaces: connected.filter((item) => item.category === "entities" && !item.relativePath.split("/").includes("人物")),
      relatedSystems: connected.filter((item) => item.category === "systems"),
      relatedLetters: connected.filter((item) => item.category === "letters"),
    });
  }

  if (!stages.length) {
    index.list({ category: "life-stages" }).filter((page) => !page.title.includes("总览")).forEach((page, order) => {
      stages.push({ page, range: [page.start, page.end].filter(Boolean).join(" — ") || "待补充", focus: page.excerpt, lane: 0, order, current: false, relatedEvents: [], relatedPeople: [], relatedPlaces: [], relatedSystems: [], relatedLetters: [] });
    });
  }

  const events = index.list({ category: "events" })
    .filter((page) => !page.title.includes("总览") && !page.title.includes("索引"))
    .sort((a, b) => eventOrder(a) - eventOrder(b) || (a.start || "9999").localeCompare(b.start || "9999"));

  for (const stage of stages) stage.relatedEvents = [];
  for (const event of events) {
    const owner = stageForEvent(index, event, stages);
    if (owner) owner.relatedEvents.push(event);
  }
  for (const stage of stages) {
    const connected = uniquePages([stage.page, ...stage.relatedEvents].flatMap((item) => {
      const full = index.get(item.id);
      return (full?.outgoingLinks || []).map((link) => resolveLink(index, link));
    }));
    stage.relatedPeople = connected.filter((item) => item.category === "entities" && item.relativePath.split("/").includes("人物"));
    stage.relatedPlaces = connected.filter((item) => item.category === "entities" && !item.relativePath.split("/").includes("人物"));
    stage.relatedSystems = connected.filter((item) => item.category === "systems");
    stage.relatedLetters = connected.filter((item) => item.category === "letters");
  }
  return { overview: overviewSummary, stages, events };
}

export function buildTimeline(index: WikiIndex): TimelineItem[] {
  const stages: TimelineItem[] = index
    .list({ category: "life-stages" })
    .filter((page) => !page.title.includes("总览"))
    .map((page) => ({ id: page.id, title: page.title, kind: "stage", start: page.start, end: page.end, excerpt: page.excerpt }));
  const events: TimelineItem[] = index
    .list({ category: "events" })
    .filter((page) => !page.title.includes("总览"))
    .map((page) => ({ id: page.id, title: page.title, kind: "event", start: page.start, end: page.end, excerpt: page.excerpt }));
  return [...stages, ...events].sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
}

export function buildCards(index: WikiIndex, category: PageCategory): StructuredCard[] {
  return index
    .list({ category })
    .filter((summary) => !summary.title.includes("总览"))
    .map((summary) => {
      const page = index.get(summary.id)!;
      return {
        id: page.id,
        title: page.title,
        excerpt: page.excerpt,
        updatedAt: page.end,
        sections: extractSectionBlocks(page.renderedMarkdown, 2).map((section) => ({
          heading: section.heading,
          body: section.body,
        })),
      };
    });
}

export function buildRelationships(index: WikiIndex): RelationshipsView {
  const people = index.list({ category: "entities" }).filter((page) => {
    const segments = page.relativePath.split("/");
    return page.type === "entity" && segments.some((segment) => segment === "人物") && !page.title.includes("总览");
  });
  const grouped = new Map<string, RelationshipsView["groups"][number]["people"]>();
  for (const person of people) {
    const segments = person.relativePath.replace(/\.md$/i, "").split("/");
    const group = segments.at(-2) || "其他";
    const entries = grouped.get(group) || [];
    const full = index.get(person.id);
    const mentions = full?.incomingLinks || [];
    const datedMentions = mentions.filter((page) => page.isSource || ["letters", "events"].includes(page.category));
    const related = uniquePages([...(full?.outgoingLinks || []).map((link) => resolveLink(index, link)), ...mentions]);
    entries.push({
      ...person,
      mentionCount: mentions.length,
      lastMention: datedMentions.map(intrinsicDate).filter(Boolean).sort().at(-1),
      relatedStages: related.filter((page) => page.category === "life-stages").slice(0, 6),
      relatedRoles: related.filter((page) => page.category === "relationship-roles").slice(0, 6),
      relatedSystems: related.filter((page) => page.category === "systems").slice(0, 6),
    });
    grouped.set(group, entries);
  }
  const groups = [...grouped.entries()]
    .map(([name, entries]) => ({ name, people: entries.sort((a, b) => (b.lastMention || "").localeCompare(a.lastMention || "") || b.mentionCount - a.mentionCount || a.title.localeCompare(b.title, "zh-CN")) }))
    .sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name, "zh-CN"));
  return { roles: buildCards(index, "relationship-roles"), groups, totalPeople: people.length };
}

export function buildMentalModels(index: WikiIndex): SectionedPageView | undefined {
  const summary = index.list({ category: "mental-models" })[0];
  const page = summary ? index.get(summary.id) : undefined;
  return page ? { page, sections: extractSectionBlocks(page.markdown, 2) } : undefined;
}

function cleanWikiText(value: string): string {
  return value.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_raw, target, label) => label || target).replace(/\*\*/g, "").trim();
}

export function parseQuoteGroups(markdown: string): QuoteGroup[] {
  const groups: QuoteGroup[] = [];
  let group: QuoteGroup | undefined;
  let entry: QuoteGroup["entries"][number] | undefined;
  const finishEntry = () => {
    if (group && entry?.quote) {
      entry.quote = entry.quote.trim();
      entry.confirmed = !entry.identity.includes("推断候选");
      group.entries.push(entry);
    }
    entry = undefined;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const groupHeading = line.match(/^##\s+(.+)/);
    if (groupHeading) {
      finishEntry();
      group = { title: groupHeading[1]!.trim(), entries: [] };
      groups.push(group);
      continue;
    }
    const entryHeading = line.match(/^###\s+(.+)/);
    if (entryHeading && group) {
      finishEntry();
      entry = { title: entryHeading[1]!.trim(), quote: "", source: "", identity: "", usage: "", confirmed: false };
      continue;
    }
    if (!entry) continue;
    if (line.startsWith(">")) entry.quote += `${line.replace(/^>\s?/, "")}\n`;
    else if (line.startsWith("- 来源：")) entry.source = cleanWikiText(line.slice(5));
    else if (line.startsWith("- 身份：")) entry.identity = cleanWikiText(line.slice(5));
    else if (line.startsWith("- 适用：")) entry.usage = cleanWikiText(line.slice(5));
  }
  finishEntry();
  return groups.filter((item) => item.entries.length > 0);
}

export function buildQuotes(index: WikiIndex): QuotesView | undefined {
  const summary = index.list({ category: "quotes" })[0];
  const page = summary ? index.get(summary.id) : undefined;
  return page ? { page, groups: parseQuoteGroups(page.markdown) } : undefined;
}

export function buildGraph(index: WikiIndex, maxNodes = 120, focusId?: string): GraphData {
  const limit = focusId ? Math.min(maxNodes, 48) : maxNodes;
  const allPages = index.list({ sources: false }).filter((page) => !["maintenance", "other", "sources"].includes(page.category));
  const allIds = new Set(allPages.map((page) => page.id));
  const allLinks: GraphData["links"] = [];
  const degree = new Map<string, number>();
  for (const summary of allPages) {
    for (const link of index.get(summary.id)?.outgoingLinks || []) if (link.resolvedId && allIds.has(link.resolvedId)) {
      allLinks.push({ source: summary.id, target: link.resolvedId });
      degree.set(summary.id, (degree.get(summary.id) || 0) + 1);
      degree.set(link.resolvedId, (degree.get(link.resolvedId) || 0) + 1);
    }
  }
  let selectedIds: Set<string>;
  const distance = new Map<string, number>();
  if (focusId && allIds.has(focusId)) {
    selectedIds = new Set([focusId]);
    distance.set(focusId, 0);
    let frontier = [focusId];
    for (let depth = 1; depth <= 2 && selectedIds.size < limit; depth += 1) {
      const next: string[] = [];
      for (const link of allLinks) if (frontier.includes(link.source) || frontier.includes(link.target)) {
        const candidate = frontier.includes(link.source) ? link.target : link.source;
        if (!selectedIds.has(candidate) && selectedIds.size < limit) { selectedIds.add(candidate); distance.set(candidate, depth); next.push(candidate); }
      }
      frontier = next;
    }
  } else {
    const anchors = allPages.filter((page) => ["state", "personal-lines", "cycles", "systems", "life-stages"].includes(page.category));
    const ranked = [...allPages].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
    selectedIds = new Set([...anchors, ...ranked].slice(0, limit).map((page) => page.id));
  }
  const pages = allPages.filter((page) => selectedIds.has(page.id)).sort((a, b) => focusId ? (distance.get(a.id) ?? 99) - (distance.get(b.id) ?? 99) || (degree.get(b.id) || 0) - (degree.get(a.id) || 0) : 0).slice(0, limit);
  const allowed = new Set(pages.map((page) => page.id));
  return {
    focusId,
    nodes: pages.map((page) => ({ id: page.id, title: page.title, category: page.category, degree: degree.get(page.id) || 0, distance: distance.get(page.id) })),
    links: allLinks.filter((link) => allowed.has(link.source) && allowed.has(link.target)),
  };
}

export function buildLetters(index: WikiIndex): LettersView {
  const pages = index
    .list({ category: "letters" })
    .filter((page) => !page.title.includes("总览"))
    .sort((a, b) => dateKey(b).localeCompare(dateKey(a)));
  const themeCategories: PageCategory[] = ["personal-lines", "cycles", "systems", "mental-models", "life-stages", "relationship-roles", "entities"];
  const letters = pages.map((page) => {
    const full = index.get(page.id);
    return {
      page,
      letterDate: semanticDate(page),
      evidenceFrom: page.start,
      evidenceTo: page.end,
      themes: uniquePages((full?.outgoingLinks || []).map((link) => resolveLink(index, link))).filter((linked) => themeCategories.includes(linked.category)).slice(0, 10),
    };
  });
  const threads = new Map<string, { id: string; title: string; category: PageCategory | "uncategorized"; letters: string[]; latestDate: string }>();
  for (const letter of letters) {
    const themes = letter.themes.length ? letter.themes : [{ id: "uncategorized", title: "尚未归入主题", category: "other" as PageCategory } as WikiPageSummary];
    for (const theme of themes) {
      const entry = threads.get(theme.id) || { id: theme.id, title: theme.title, category: theme.id === "uncategorized" ? "uncategorized" : theme.category, letters: [], latestDate: letter.letterDate };
      entry.letters.push(letter.page.id);
      if (letter.letterDate > entry.latestDate) entry.latestDate = letter.letterDate;
      threads.set(theme.id, entry);
    }
  }
  return { letters, threads: [...threads.values()].sort((a, b) => b.letters.length - a.letters.length || b.latestDate.localeCompare(a.latestDate)), years: [...new Set(letters.map((letter) => letter.letterDate.slice(0, 4)))].filter(Boolean).sort().reverse() };
}

export function sortedLetters(index: WikiIndex): WikiPageSummary[] {
  return buildLetters(index).letters.map((letter) => letter.page);
}
