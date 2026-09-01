export const navigation = [
  { to: "/", label: "此刻", icon: "now", active: ["/"], children: [] },
  { to: "/questions", label: "值得聊聊", icon: "spark", active: ["/questions", "/focus/"], children: [] },
  { to: "/sources", label: "生活记录", icon: "source", active: ["/sources", "/imports/"], children: [] },
  { to: "/knowledge", label: "已有理解", icon: "library", active: ["/knowledge", "/insights", "/cards/", "/mental-models", "/timeline", "/letters", "/relationships", "/page/"], children: [
    { to: "/knowledge", label: "总览", active: ["/knowledge"] },
    { to: "/insights", label: "理解自己", active: ["/insights", "/cards/personal-lines", "/cards/cycles", "/cards/systems", "/mental-models"] },
    { to: "/timeline", label: "人生轨迹", active: ["/timeline"] },
    { to: "/letters", label: "近况回信", active: ["/letters"] },
    { to: "/relationships", label: "人与世界", active: ["/relationships"] },
  ] },
] as const;

export const growthTabs = [["/cards/personal-lines", "个人主线"], ["/cards/cycles", "反复循环"], ["/cards/systems", "现实系统"], ["/mental-models", "思维模型"]] as const;
export const categoryMeta: Record<string, { title: string; intro: string }> = {
  "personal-lines": { title: "个人主线", intro: "这一生反复在解决什么，以及它怎样穿过不同阶段。" },
  cycles: { title: "反复循环", intro: "看见触发、惯性反应、代价与真实有效的中断方式。" },
  systems: { title: "现实系统", intro: "职业、家庭、身体、资产、注意力与表达怎样共同运行。" },
};

export const graphCategoryNames: Record<string, string> = {
  home: "总入口", "personal-lines": "个人主线", "life-stages": "人生阶段", events: "事件与决策",
  cycles: "反复循环", "relationship-roles": "人与关系", systems: "现实系统", entities: "人物地点",
  "mental-models": "思维模型", state: "状态追踪", letters: "近况回信", quotes: "金句",
};

export type ReturnContext = { returnTo: string; returnLabel: string };

export type AgentContext = {
  scope: string;
  title: string;
  pageId?: string;
  summary?: string;
  suggestions: string[];
  defaultMode?: "read" | "write";
  launcherLabel?: string;
  compactLauncher?: boolean;
};
