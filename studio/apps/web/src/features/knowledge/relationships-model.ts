import type { PersonInsight, StructuredCard } from "@the-way-here/shared";

export type RelationshipPerson = { person: PersonInsight; group: string };
export type RelationshipSort = "recent" | "connected" | "name";

export function toggleRelationshipSelection(currentId: string | undefined, clickedId: string) {
  return currentId === clickedId ? undefined : clickedId;
}

export function personRoleIds(person: PersonInsight, roles: StructuredCard[]) {
  return roles.filter((role) => person.relatedRoles.some((related) => related.id === role.id || related.title === role.title)).map((role) => role.id);
}

export function primaryPersonRole(person: PersonInsight, roles: StructuredCard[]) {
  const ids = new Set(personRoleIds(person, roles));
  return roles.find((role) => ids.has(role.id));
}

export function rolePersonCount(people: RelationshipPerson[], role: StructuredCard, roles: StructuredCard[]) {
  return people.filter(({ person }) => personRoleIds(person, roles).includes(role.id)).length;
}

export function filterAndSortPeople(people: RelationshipPerson[], roles: StructuredCard[], roleId: string, query: string, sort: RelationshipSort) {
  const needle = query.trim().toLocaleLowerCase();
  return people
    .filter(({ person }) => (roleId === "all" || personRoleIds(person, roles).includes(roleId)) && `${person.title} ${person.aliases.join(" ")} ${person.excerpt}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => sort === "name"
      ? a.person.title.localeCompare(b.person.title, "zh-CN")
      : sort === "connected"
        ? b.person.mentionCount - a.person.mentionCount || a.person.title.localeCompare(b.person.title, "zh-CN")
        : (b.person.lastMention || "").localeCompare(a.person.lastMention || "") || b.person.mentionCount - a.person.mentionCount || a.person.title.localeCompare(b.person.title, "zh-CN"));
}

export function formatRelationshipDate(value?: string, now = new Date()) {
  if (!value) return "日期待补";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value.slice(0, 10);
  const days = Math.max(0, Math.floor((now.valueOf() - parsed.valueOf()) / 86_400_000));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return parsed.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}
