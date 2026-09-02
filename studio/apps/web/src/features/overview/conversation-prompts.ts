export type WeightedPrompt = { id: string; weight?: number };

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) + 1) / 4294967297;
}

/**
 * A deterministic weighted shuffle. Questions can change with the day, but
 * stay still while someone is reading or after a refresh.
 */
export function stablePromptOrder<T extends WeightedPrompt>(items: T[], seed: string): T[] {
  return items
    .map((item) => {
      const weight = Math.max(1, item.weight || 1);
      return { item, rank: -Math.log(stableUnit(`${seed}:${item.id}`)) / weight };
    })
    .sort((left, right) => left.rank - right.rank || left.item.id.localeCompare(right.item.id))
    .map(({ item }) => item);
}

export function dailyPromptSeed(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function groundedConversationReplyPrompt(basePrompt: string, answer: string): string {
  return [
    basePrompt.trim(),
    "",
    "我刚刚补充：",
    answer.trim(),
    "",
    "回复前，请先读取与这次补充最相关的 Wiki 综合页，并在需要时沿链接追溯相关事件和原始记录。不要只依据我这一次输入，也不要直接跳到泛化追问。",
    "请先自然说清此前的相关情况，再指出这次补充相较过去新增或改变了什么；区分可追溯事实、当前理解和仍然未知。然后直接回应这个变化，最后只问一个真正需要我补充的具体问题。",
    "如果现有记录不足以判断变化，请坦白还不知道，不要用猜测补足。回复保持自然对话，不要把这些步骤写成报告式小标题。",
  ].join("\n");
}
