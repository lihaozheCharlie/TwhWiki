import { describe, expect, it } from "vitest";
import type { PersonInsight, StructuredCard } from "@the-way-here/shared";
import { filterAndSortPeople, formatRelationshipDate, personRoleIds, primaryPersonRole, rolePersonCount, toggleRelationshipSelection } from "./relationships-model";

const roles: StructuredCard[] = [
  { id: "partner", title: "伴侣", excerpt: "", sections: [] },
  { id: "friend", title: "挚友", excerpt: "", sections: [] },
];

function person(id: string, title: string, roleId: string, mentionCount: number, lastMention?: string): PersonInsight {
  return {
    id, title, mentionCount, lastMention, excerpt: `${title} 的人物线索`, aliases: title === "林蔚" ? ["妻子"] : [],
    relatedRoles: [{ id: roleId, title: roles.find((role) => role.id === roleId)?.title || roleId } as PersonInsight["relatedRoles"][number]],
    relatedStages: [], relatedSystems: [], relativePath: `${title}.md`, category: "entities", tags: [], locations: [], sources: [], modifiedAt: "", isSource: false,
  };
}

const people = [
  { group: "家人", person: person("lin", "林蔚", "partner", 8, "2026-08-30") },
  { group: "朋友", person: person("chen", "陈默", "friend", 12, "2026-08-20") },
];

describe("relationships model", () => {
  it("再次点击已展开的人物时收起详情", () => {
    expect(toggleRelationshipSelection(undefined, "lin")).toBe("lin");
    expect(toggleRelationshipSelection("chen", "lin")).toBe("lin");
    expect(toggleRelationshipSelection("lin", "lin")).toBeUndefined();
  });

  it("用人物页的关系链接筛选并统计角色", () => {
    expect(personRoleIds(people[0]!.person, roles)).toEqual(["partner"]);
    expect(rolePersonCount(people, roles[1]!, roles)).toBe(1);
    expect(filterAndSortPeople(people, roles, "partner", "妻子", "recent").map(({ person: item }) => item.id)).toEqual(["lin"]);
  });

  it("支持按关联数与姓名排序", () => {
    expect(filterAndSortPeople(people, roles, "all", "", "connected").map(({ person: item }) => item.id)).toEqual(["chen", "lin"]);
    expect(filterAndSortPeople(people, roles, "all", "", "name").map(({ person: item }) => item.id)).toEqual(["chen", "lin"]);
  });

  it("没有明确角色链接的人物不会被误归类", () => {
    const unlinked = person("guest", "路人", "unknown", 3);
    expect(personRoleIds(unlinked, roles)).toEqual([]);
    expect(primaryPersonRole(unlinked, roles)).toBeUndefined();
  });

  it("把最近日期显示成易读的相对时间", () => {
    expect(formatRelationshipDate("2026-08-31", new Date("2026-09-02T12:00:00+08:00"))).toBe("2 天前");
    expect(formatRelationshipDate(undefined)).toBe("日期待补");
  });
});
