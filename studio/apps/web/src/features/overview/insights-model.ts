import type { StructuredCard } from "@the-way-here/shared";

const calibrationKeywords = /边界|反例|不适用|不能|避免|代价|限制|风险|区分/;

export function plainInsightText(value: string): string {
  return value
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => label || target)
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^\s*(?:[-+] |\d+[.)]\s*)/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function insightCardDetail(card: StructuredCard, preferredHeadings: string[] = []): string {
  const preferred = preferredHeadings
    .map((heading) => card.sections.find((section) => section.heading.includes(heading)))
    .find(Boolean);
  return plainInsightText(preferred?.body || card.sections[0]?.body || card.excerpt);
}

export function insightSectionText(card: StructuredCard, heading: string): string {
  const section = card.sections.find((candidate) => candidate.heading.includes(heading));
  return plainInsightText(section?.body || "");
}

export function insightCoreJudgment(card: StructuredCard): string {
  return insightSectionText(card, "核心判断") || plainInsightText(card.excerpt) || "这条主线还没有形成独立的核心判断。";
}

export function insightExcerpt(value: string, length = 150): string {
  const text = plainInsightText(value);
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}

export function mentalModelPanels(body: string): { summary: string; calibration: string } {
  const text = plainInsightText(body);
  const sentences = text.split(/(?<=[。！？；])/).map((sentence) => sentence.trim()).filter(Boolean);
  const calibration = sentences.filter((sentence) => calibrationKeywords.test(sentence)).join("");
  return {
    summary: sentences.filter((sentence) => !calibrationKeywords.test(sentence)).join("") || text,
    calibration: calibration || "这份总览还没有单独写出边界或反例；打开完整模型后，可以继续核对和补充。",
  };
}
