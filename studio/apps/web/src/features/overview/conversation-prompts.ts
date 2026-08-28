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
