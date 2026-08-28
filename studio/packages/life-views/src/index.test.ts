import { describe, expect, test } from "vitest";
import { buildFocusWorkspace, buildGraph, buildLetters, buildLifeMap, buildRelationships, buildToday, parseConversationPrompts, parseQuoteGroups, parseStateSignals, semanticDate, splitMarkdownTableRow } from "./index";

const summary = (id: string, title: string, category: string, relativePath = `${id}.md`) => ({
  id, title, category, relativePath, aliases: [], tags: [], locations: [], sources: [], excerpt: `${title}摘要`, modifiedAt: "2026-01-01", isSource: false,
});

describe("personal growth views", () => {
  test("reads the current state table", () => {
    const signals = parseStateSignals({
      sections: [{
        level: 2,
        heading: "当前追踪面板",
        body: "| 追踪项 | 类型 | 当前判断 | 观察信号 | 关联页面 |\n|---|---|---|---|---|\n| 睡眠 | 需要关注 | 最近偏晚 | 零点后睡时劣化 | [[身体系统]] |",
      }],
    } as any);
    expect(signals[0]).toMatchObject({ name: "睡眠", kind: "需要关注", judgment: "最近偏晚" });
  });

  test("keeps aliased wiki links inside one table cell", () => {
    expect(splitMarkdownTableRow("| [[wiki/阶段|初中阶段]] | 初中时期 | 早期底色 |")).toEqual([
      "[[wiki/阶段|初中阶段]]", "初中时期", "早期底色",
    ]);
  });

  test("reads active conversation prompts with their evidence contract", () => {
    const prompts = parseConversationPrompts({
      id: "wiki/11/值得聊聊",
      sections: [{
        level: 2,
        heading: "普通周里的创作",
        body: "- 问题：没有掌声的时候，你还愿意继续做什么？\n- 当前理解：公开表达已经带回真实反馈。\n- 为什么现在：一次突破还不能说明节奏已经稳定。\n- 仍然未知：低反馈时期会怎样选择。\n- 观察信号：连续两周是否仍有作品进入现实。\n- 相关知识：[[创作系统]]、[[05 第一次公开分享]]\n- 状态：active\n- 权重：4",
      }],
      outgoingLinks: [{ raw: "[[创作系统]]", target: "创作系统", label: "创作系统", resolvedId: "wiki/06/创作系统" }],
    } as any);
    expect(prompts[0]).toMatchObject({
      title: "普通周里的创作",
      question: "没有掌声的时候，你还愿意继续做什么？",
      weight: 4,
      status: "active",
    });
    expect(prompts[0]!.links[0]!.resolvedId).toBe("wiki/06/创作系统");
  });

  test("omits incomplete or inactive conversation prompts", () => {
    const prompts = parseConversationPrompts({
      id: "wiki/11/值得聊聊",
      sections: [
        { level: 2, heading: "缺字段", body: "- 问题：只写了问题\n- 状态：active" },
        { level: 2, heading: "已归档", body: "- 问题：旧问题\n- 当前理解：旧理解\n- 为什么现在：旧原因\n- 仍然未知：旧未知\n- 状态：archived" },
      ],
      outgoingLinks: [],
    } as any);
    expect(prompts).toEqual([]);
  });

  test("uses the overview order and separates overlapping life tracks", () => {
    const overview = summary("wiki/02/总览", "人生阶段总览", "life-stages");
    const student = summary("wiki/02/学生", "学生阶段", "life-stages");
    const work = summary("wiki/02/工作", "工作阶段", "life-stages");
    const family = summary("wiki/02/家庭", "家庭阶段", "life-stages");
    const pages: Record<string, any> = {
      [overview.id]: { ...overview, markdown: "# 总览\n\n## 阶段地图\n\n| 阶段 | 时间 | 核心问题 | 入口 |\n|---|---|---|---|\n| [[wiki/02/学生|学生]] | 2013-2017 | 学习 | |\n| [[wiki/02/工作|工作]] | 2017 至今 | 职业 | |\n| [[wiki/02/家庭|家庭]] | 2024 至今 | 家庭 | |", outgoingLinks: [] },
      [student.id]: { ...student, outgoingLinks: [] }, [work.id]: { ...work, outgoingLinks: [] }, [family.id]: { ...family, outgoingLinks: [] },
    };
    const index = { list: ({ category }: any) => Object.values(pages).filter((page: any) => page.category === category), get: (id: string) => pages[id] } as any;
    const view = buildLifeMap(index);
    expect(view.stages.map((stage) => stage.page.title)).toEqual(["学生阶段", "工作阶段", "家庭阶段"]);
    expect(view.stages.map((stage) => stage.lane)).toEqual([0, 0, 1]);
    expect(view.stages.filter((stage) => stage.current)).toHaveLength(2);
  });

  test("assigns every key event to one life stage using explicit links before dates", () => {
    const overview = summary("wiki/02/总览", "人生阶段总览", "life-stages");
    const student = summary("wiki/02/学生", "学生阶段", "life-stages");
    const work = summary("wiki/02/工作", "工作阶段", "life-stages");
    const family = summary("wiki/02/家庭", "家庭阶段", "life-stages");
    const studentEvent = { ...summary("wiki/03/01", "01 入学", "events"), start: "2014-09-01" };
    const workEvent = { ...summary("wiki/03/02", "02 入职", "events"), start: "2019-03-01" };
    const familyEvent = { ...summary("wiki/03/03", "03 组建家庭", "events"), start: "2024-05-01" };
    const recentEvent = { ...summary("wiki/03/04", "04 新选择", "events"), start: "2025-02-01" };
    const pages: Record<string, any> = {
      [overview.id]: { ...overview, markdown: "# 总览\n\n## 阶段地图\n\n| 阶段 | 时间 | 核心问题 | 入口 |\n|---|---|---|---|\n| [[wiki/02/学生|学生]] | 2013-2017 | 学习 | |\n| [[wiki/02/工作|工作]] | 2017 至今 | 职业 | |\n| [[wiki/02/家庭|家庭]] | 2024 至今 | 家庭 | |", outgoingLinks: [] },
      [student.id]: { ...student, outgoingLinks: [] },
      [work.id]: { ...work, outgoingLinks: [] },
      [family.id]: { ...family, outgoingLinks: [] },
      [studentEvent.id]: { ...studentEvent, outgoingLinks: [] },
      [workEvent.id]: { ...workEvent, outgoingLinks: [] },
      [familyEvent.id]: { ...familyEvent, outgoingLinks: [{ target: family.id, resolvedId: family.id }] },
      [recentEvent.id]: { ...recentEvent, outgoingLinks: [] },
    };
    const index = { list: ({ category }: any) => Object.values(pages).filter((page: any) => page.category === category), get: (id: string) => pages[id] } as any;
    const view = buildLifeMap(index);
    const assigned = view.stages.flatMap((stage) => stage.relatedEvents.map((event) => event.id));
    expect(assigned).toHaveLength(view.events.length);
    expect(new Set(assigned).size).toBe(view.events.length);
    expect(view.stages.find((stage) => stage.page.id === family.id)?.relatedEvents.map((event) => event.id)).toEqual([familyEvent.id]);
    expect(view.stages.find((stage) => stage.page.id === work.id)?.relatedEvents.map((event) => event.id)).toEqual([workEvent.id, recentEvent.id]);
  });

  test("groups every person by its closest directory", () => {
    const roles = summary("wiki/05/支持者", "支持者", "relationship-roles");
    const colleague = { ...summary("wiki/07/人物/认识的人/工作/甲", "甲", "entities", "wiki/07 人物与城市/人物/认识的人/工作/甲.md"), type: "entity" };
    const family = { ...summary("wiki/07/人物/认识的人/亲人/乙", "乙", "entities", "wiki/07 人物与城市/人物/认识的人/亲人/乙.md"), type: "entity" };
    const pages: Record<string, any> = {
      [roles.id]: { ...roles, renderedMarkdown: "# 支持者\n\n## 定义\n内容" }, [colleague.id]: colleague, [family.id]: family,
    };
    const index = { list: ({ category }: any) => Object.values(pages).filter((page: any) => page.category === category), get: (id: string) => pages[id] } as any;
    const view = buildRelationships(index);
    expect(view.totalPeople).toBe(2);
    expect(view.groups.map((group) => group.name).sort()).toEqual(["亲人", "工作"].sort());
  });

  test("separates a letter's writing date from its evidence interval", () => {
    const letter = { ...summary("wiki/10/2026-08-18", "2026-08-18 写给最近的你", "letters"), start: "2026-06-28", end: "2026-08-18" };
    const theme = summary("wiki/01/主线", "行动主线", "personal-lines");
    const pages: Record<string, any> = {
      [letter.id]: { ...letter, outgoingLinks: [{ target: theme.id, resolvedId: theme.id }] },
      [theme.id]: { ...theme, outgoingLinks: [] },
    };
    const index = { list: ({ category }: any) => Object.values(pages).filter((page: any) => page.category === category), get: (id: string) => pages[id] } as any;
    const view = buildLetters(index);
    expect(semanticDate(letter as any)).toBe("2026-08-18");
    expect(view.letters[0]).toMatchObject({ letterDate: "2026-08-18", evidenceFrom: "2026-06-28", evidenceTo: "2026-08-18" });
    expect(view.threads[0]!.title).toBe("行动主线");
  });

  test("prioritizes the most recently evidenced attention signal", () => {
    const state = summary("wiki/11/状态追踪总览", "状态追踪总览", "state");
    const theme = summary("wiki/01/主线", "行动主线", "personal-lines");
    const pages: Record<string, any> = {
      [state.id]: { ...state, sections: [{ level: 2, heading: "当前追踪面板", body: "| 追踪项 | 类型 | 当前判断 | 观察信号 | 关联页面 |\n|---|---|---|---|---|\n| 焦虑 | 需要关注 | 2026-05-01 有反复 | 继续观察 | [[wiki/01/主线]] |\n| 注意力 | 需要关注 | 2026-08-18 有新变化 | 记录中断 | [[wiki/01/主线]] |" }], outgoingLinks: [] },
      [theme.id]: { ...theme, outgoingLinks: [], incomingLinks: [] },
    };
    const index = { list: ({ category, sources }: any) => Object.values(pages).filter((page: any) => (!category || page.category === category) && (sources !== false || !page.isSource)), get: (id: string) => pages[id] } as any;
    const today = buildToday(index);
    expect(today.focusCandidates[0]!.name).toBe("注意力");
    expect(today.guidingQuestion).toContain("2026-08-18");
    expect(buildFocusWorkspace(index, "注意力")?.signal.name).toBe("注意力");
  });

  test("does not describe an undated signal with an undefined evidence date", () => {
    const state = summary("wiki/11/状态追踪总览", "状态追踪总览", "state");
    const pages: Record<string, any> = {
      [state.id]: { ...state, sections: [{ level: 2, heading: "当前追踪面板", body: "| 追踪项 | 类型 | 当前判断 | 观察信号 | 关联页面 |\n|---|---|---|---|---|\n| 启动阻力 | 需要关注 | 容易把计划变成考试 | 散步后能开始行动 | |" }], outgoingLinks: [] },
    };
    const index = { list: ({ category, sources }: any) => Object.values(pages).filter((page: any) => (!category || page.category === category) && (sources !== false || !page.isSource)), get: (id: string) => pages[id] } as any;
    const today = buildToday(index);
    expect(today.focusCandidates[0]!.reason).toBe("状态面板标记为需要关注，并连接 0 个知识页面");
    expect(today.focusCandidates[0]!.reason).not.toContain("undefined");
  });

  test("builds a local graph around a selected page instead of an alphabetical slice", () => {
    const a = summary("a", "甲", "personal-lines");
    const b = summary("b", "乙", "cycles");
    const c = summary("c", "丙", "systems");
    const d = summary("d", "丁", "entities");
    const pages: Record<string, any> = {
      a: { ...a, outgoingLinks: [{ resolvedId: "b" }] },
      b: { ...b, outgoingLinks: [{ resolvedId: "c" }] },
      c: { ...c, outgoingLinks: [] },
      d: { ...d, outgoingLinks: [] },
    };
    const index = { list: () => Object.values(pages), get: (id: string) => pages[id] } as any;
    const graph = buildGraph(index, 20, "a");
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c"]);
    expect(graph.nodes.find((node) => node.id === "c")?.distance).toBe(2);
  });
});

describe("quote index parsing", () => {
  test("preserves grouped multiline quotes and confirmation state", () => {
    const groups = parseQuoteGroups("## 明确保留\n\n### 规则\n\n> 第一行\n>\n> 第二行\n\n- 来源：[[wiki/来源|一封回信]]\n- 身份：用户明确点名保留。\n- 适用：阶段结束。\n\n## 候选\n\n### 另一句\n\n> 候选内容\n\n- 身份：日记原句；推断候选。");
    expect(groups).toHaveLength(2);
    expect(groups[0]!.entries[0]).toMatchObject({ quote: "第一行\n\n第二行", source: "一封回信", confirmed: true });
    expect(groups[1]!.entries[0]!.confirmed).toBe(false);
  });
});
