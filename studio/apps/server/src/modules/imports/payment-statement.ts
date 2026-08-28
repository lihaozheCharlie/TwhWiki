import path from "node:path";
import type { PaymentJourneyCluster, PaymentJourneyClusterKind, PaymentJourneySummary, SourceImportFile } from "@the-way-here/shared";

export interface PaymentStatementPreparedFile {
  originalName: string;
  relativePath: string;
  content: string;
  bytes: number;
}

export interface PreparedPaymentStatement {
  files: PaymentStatementPreparedFile[];
  journey: PaymentJourneySummary;
}

type PaymentCategory = "餐饮" | "出行" | "购物" | "居家" | "健康" | "数字服务" | "转账" | "其他";

type PaymentEntry = {
  id: string;
  createdAt: string;
  date: string;
  hour: number;
  merchant: string;
  product: string;
  amount: number;
  direction: string;
  status: string;
  refund: number;
  netExpense: number;
  category: PaymentCategory;
  places: string[];
};

type ScoredCluster = PaymentJourneyCluster & { score: number; entryIds: string[] };

const cityNames = [
  "北京", "上海", "天津", "重庆", "广州", "深圳", "杭州", "南京", "苏州", "成都", "武汉", "西安", "长沙", "郑州", "青岛", "济南", "厦门", "福州", "宁波", "合肥", "昆明", "贵阳", "南宁", "海口", "三亚", "沈阳", "大连", "长春", "哈尔滨", "石家庄", "太原", "兰州", "西宁", "银川", "乌鲁木齐", "呼和浩特", "拉萨", "绍兴", "嘉兴", "湖州", "无锡", "常州", "温州", "金华", "台州",
];

const categoryKeywords: Array<{ category: PaymentCategory; words: string[] }> = [
  { category: "出行", words: ["打车", "滴滴", "铁路", "火车票", "携程", "旅行社", "酒店", "宾馆", "停车", "地铁", "公交", "航空", "机票"] },
  { category: "餐饮", words: ["餐饮", "饭", "菜", "居酒屋", "酒吧", "咖啡", "奶茶", "酸奶", "便利店", "便利购", "超市", "盒马", "果蔬", "牛肉", "饮料", "售卖机", "外卖", "美团收银", "智盘消费", "大众点评"] },
  { category: "居家", words: ["电费", "供电", "物业", "家居", "洗漱", "相册", "收纳", "杯子", "电池"] },
  { category: "健康", words: ["医药", "药房", "医院", "诊所", "体检", "健康", "压力自测"] },
  { category: "数字服务", words: ["会员", "订阅", "软件", "充值", "话费", "中国电信", "中国移动", "中国联通", "TESLA"] },
  { category: "购物", words: ["淘宝", "抖音店", "无印良品", "迪卡侬", "美利达", "耐克", "NIKE", "雨衣", "运动", "跑步", "骑行", "保温杯"] },
];

const themeDefinitions: Array<{ title: string; words: string[]; question: string }> = [
  { title: "运动与骑行线索", words: ["运动", "跑步", "健身", "骑行", "美利达", "迪卡侬", "耐克", "NIKE", "雨衣"], question: "从当时一次具体的运动、骑行或通勤场景讲起吧：你为什么开始准备这些东西，那段变化后来怎样进入了日常？" },
  { title: "居住与生活整理线索", words: ["电费", "物业", "家居", "洗漱", "相册", "收纳", "无印良品", "杯子", "电池"], question: "请带我回到当时的住处：你那阵子最想把生活整理成什么样，又有哪些变化藏在这些日常物件背后？" },
  { title: "健康与身体关注线索", words: ["医药", "药房", "医院", "诊所", "体检", "健康", "压力", "运动"], question: "请从那段时间身体或情绪上最清晰的一个感受讲起：你当时在照顾什么，又慢慢意识到了什么？" },
];

function decodeFile(file: SourceImportFile): string {
  const bytes = file.encoding === "base64" ? Buffer.from(file.content.replace(/\s/g, ""), "base64") : Buffer.from(file.content, "utf8");
  for (const encoding of ["utf-8", "gb18030"] as const) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
      if (text.includes("支付宝交易记录明细查询") || encoding === "utf-8") return text;
    } catch {
      // Try the next known export encoding.
    }
  }
  throw new Error(`无法识别账单编码：${file.name}`);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") { value += "\""; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += character;
  }
  cells.push(value);
  return cells.map((cell) => cell.replace(/\t/g, "").trim());
}

function numberValue(value: string | undefined): number {
  const parsed = Number.parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function classify(source: string, merchant: string, product: string): PaymentCategory {
  const text = `${source} ${merchant} ${product}`;
  if (/^(?:[\p{Script=Han}·]{2,12}|[a-z ]{2,20})$/iu.test(merchant) && /收钱码|扫码|二维码|商家主扫/.test(product)) return "转账";
  for (const definition of categoryKeywords) if (definition.words.some((word) => text.toLocaleLowerCase().includes(word.toLocaleLowerCase()))) return definition.category;
  return source.includes("淘宝") ? "购物" : "其他";
}

function extractPlaces(text: string): string[] {
  const places = new Set<string>();
  for (const city of cityNames) if (text.includes(city)) places.add(city);
  const patterns = [
    /[\p{Script=Han}]{2,9}(?:区|县|街道|园区)/gu,
    /[\p{Script=Han}A-Za-z0-9]{2,12}(?:科技城|商场|广场|天街|中心)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const place = match[0].replace(/(?:有限公司|管理有限责任公司).*$/, "").trim();
      if (place.length >= 2 && place.length <= 14) places.add(place);
    }
  }
  return [...places];
}

function parseEntries(text: string): PaymentEntry[] {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => line.includes("交易号") && line.includes("交易创建时间") && line.includes("交易对方"));
  if (headerIndex < 0) throw new Error("没有找到支付宝账单表头，请上传支付宝导出的交易记录 CSV");
  const headers = parseCsvLine(lines[headerIndex]!);
  const required = ["交易创建时间", "交易来源地", "交易对方", "商品名称", "金额（元）", "收/支", "交易状态", "成功退款（元）"];
  for (const name of required) if (!headers.includes(name)) throw new Error(`支付宝账单缺少字段：${name}`);
  const column = (name: string) => headers.indexOf(name);
  const entries: PaymentEntry[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^-{10,}|^共\d+笔记录/.test(line.trim())) break;
    const cells = parseCsvLine(line);
    const createdAt = cells[column("交易创建时间")] || "";
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(createdAt)) continue;
    const merchant = cells[column("交易对方")] || "未知交易对方";
    const product = cells[column("商品名称")] || "未提供商品说明";
    const amount = numberValue(cells[column("金额（元）")]);
    const direction = cells[column("收/支")] || "";
    const status = cells[column("交易状态")] || "";
    const refund = numberValue(cells[column("成功退款（元）")]);
    entries.push({
      id: `T${String(entries.length + 1).padStart(3, "0")}`,
      createdAt,
      date: createdAt.slice(0, 10),
      hour: Number.parseInt(createdAt.slice(11, 13), 10),
      merchant,
      product,
      amount,
      direction,
      status,
      refund,
      netExpense: direction === "支出" ? Math.max(0, amount - refund) : 0,
      category: classify(cells[column("交易来源地")] || "", merchant, product),
      places: extractPlaces(`${merchant} ${product}`),
    });
  }
  if (!entries.length) throw new Error("账单中没有找到可识别的交易记录");
  return entries;
}

function dayDifference(left: string, right: string): number {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000);
}

function displayDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function periodText(start: string, end: string): string {
  return start === end ? displayDate(start) : `${displayDate(start)}—${displayDate(end)}`;
}

function merchantKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[（(][^）)]*[）)]/g, "").replace(/(?:有限责任公司|有限公司|分公司|旗舰店|专营店|门店)$/g, "").replace(/\*+/g, "").replace(/\s+/g, "").trim();
}

function evidenceLine(entry: PaymentEntry): string {
  const item = entry.product.length > 30 ? `${entry.product.slice(0, 29)}…` : entry.product;
  return `${entry.id} · ${displayDate(entry.date)} ${entry.createdAt.slice(11, 16)} · ${entry.merchant} · ${item}`;
}

function cluster(
  kind: PaymentJourneyClusterKind,
  title: string,
  summary: string,
  question: string,
  entries: PaymentEntry[],
  score: number,
): ScoredCluster {
  const sorted = entries.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return {
    id: `${kind}-${sorted[0]!.id.toLocaleLowerCase()}`,
    kind,
    title,
    summary,
    question,
    startDate: sorted[0]!.date,
    endDate: sorted.at(-1)!.date,
    entryCount: sorted.length,
    categories: [...new Set(sorted.map((entry) => entry.category))],
    evidence: sorted.slice(0, 5).map(evidenceLine),
    score,
    entryIds: sorted.map((entry) => entry.id),
  };
}

function recurringClusters(entries: PaymentEntry[]): ScoredCluster[] {
  const groups = new Map<string, PaymentEntry[]>();
  for (const entry of entries.filter((candidate) => candidate.direction === "支出" && candidate.status !== "交易关闭")) {
    const key = merchantKey(entry.merchant);
    if (key.length < 2) continue;
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  return [...groups.values()].filter((group) => group.length >= 3).map((group) => {
    const sorted = group.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const hours = sorted.map((entry) => entry.hour);
    const concentrated = Math.max(...hours.map((hour) => hours.filter((candidate) => Math.abs(candidate - hour) <= 1).length));
    const rhythm = concentrated / hours.length >= .65 ? `，且大多发生在${hours.sort((a, b) => a - b)[Math.floor(hours.length / 2)]}点前后` : "";
    return cluster(
      "routine",
      `反复出现的「${sorted[0]!.merchant}」`,
      `${periodText(sorted[0]!.date, sorted.at(-1)!.date)}共有 ${sorted.length} 笔相似消费${rhythm}，可能对应一个固定场景或生活节律。`,
      `请从一次最有画面的消费讲起：那通常是怎样的一天、周围有什么人和事，这个反复出现的小习惯对当时的生活意味着什么？`,
      sorted,
      42 + sorted.length * 4 + concentrated,
    );
  });
}

function placeClusters(entries: PaymentEntry[]): ScoredCluster[] {
  const groups = new Map<string, PaymentEntry[]>();
  for (const entry of entries) for (const place of entry.places) groups.set(place, [...(groups.get(place) || []), entry]);
  return [...groups.entries()].filter(([, group]) => group.length >= 3 && new Set(group.map((entry) => entry.date)).size >= 2).map(([place, group]) => {
    const categories = [...new Set(group.map((entry) => entry.category))];
    return cluster(
      "place",
      `围绕「${place}」的生活半径`,
      `${periodText(group.map((entry) => entry.date).sort()[0]!, group.map((entry) => entry.date).sort().at(-1)!)}出现 ${group.length} 笔记录，串联了${categories.join("、")}。`,
      `请带我走进${place}当时的一天：你常在那里做什么、会遇见谁，哪些消费之外的细节最能说明那段生活？`,
      group,
      48 + group.length * 2 + categories.length * 7 - (cityNames.includes(place) ? 8 : 0),
    );
  });
}

function journeyClusters(entries: PaymentEntry[]): ScoredCluster[] {
  const cityGroups = new Map<string, PaymentEntry[]>();
  for (const entry of entries) for (const city of entry.places.filter((place) => cityNames.includes(place))) cityGroups.set(city, [...(cityGroups.get(city) || []), entry]);
  const dominant = [...cityGroups.entries()].sort((left, right) => right[1].length - left[1].length)[0]?.[0];
  const journeys: ScoredCluster[] = [];
  for (const [city, cityEntries] of cityGroups) {
    if (city === dominant || cityEntries.length < 2) continue;
    const dates = [...new Set(cityEntries.map((entry) => entry.date))].sort();
    if (dayDifference(dates[0]!, dates.at(-1)!) > Math.max(5, dates.length + 2)) continue;
    const start = dates[0]!;
    const end = dates.at(-1)!;
    const connected = entries.filter((entry) => cityEntries.includes(entry) || (entry.category === "出行" && dayDifference(start, entry.date) >= -1 && dayDifference(entry.date, end) >= -1));
    const categories = [...new Set(connected.map((entry) => entry.category))];
    journeys.push(cluster(
      "journey",
      `${periodText(start, end)} · ${city}旅程候选`,
      `${cityEntries.length} 笔明确包含${city}的记录，与附近的出行消费共同形成一段连续轨迹，涉及${categories.join("、")}。`,
      `请从这次${city}之行最先浮现的一个画面讲起：你为何出发、和谁共享了这段时间，哪件小事后来最值得记住？`,
      connected,
      100 + connected.length * 4 + categories.length * 8,
    ));
  }
  return journeys;
}

function dayStoryClusters(entries: PaymentEntry[]): ScoredCluster[] {
  const groups = new Map<string, PaymentEntry[]>();
  for (const entry of entries.filter((candidate) => candidate.direction === "支出" && candidate.status !== "交易关闭")) groups.set(entry.date, [...(groups.get(entry.date) || []), entry]);
  return [...groups.entries()].flatMap(([date, group]) => {
    const categories = [...new Set(group.map((entry) => entry.category))];
    const hours = group.map((entry) => entry.hour);
    if (group.length < 3 || categories.length < 2 || Math.max(...hours) - Math.min(...hours) < 4) return [];
    return [cluster(
      "day-story",
      `${displayDate(date)} · 一天里的多段生活`,
      `从${Math.min(...hours)}点到${Math.max(...hours)}点的 ${group.length} 笔记录串联了${categories.join("、")}，比单笔消费更像一个完整事件。`,
      `如果把这一天讲成一段短故事，请从早些时候的一个画面说起，慢慢讲到当天最重要的转折，以及那些消费背后的人和心情。`,
      group,
      64 + group.length * 3 + categories.length * 9,
    )];
  });
}

function themeClusters(entries: PaymentEntry[]): ScoredCluster[] {
  return themeDefinitions.flatMap((definition) => {
    const matches = entries.filter((entry) => definition.words.some((word) => `${entry.merchant} ${entry.product}`.toLocaleLowerCase().includes(word.toLocaleLowerCase())));
    if (matches.length < 2 || new Set(matches.map((entry) => entry.date)).size < 2) return [];
    return [cluster(
      "theme",
      definition.title,
      `${periodText(matches.map((entry) => entry.date).sort()[0]!, matches.map((entry) => entry.date).sort().at(-1)!)}有 ${matches.length} 笔彼此呼应的消费，可能属于同一段生活变化。`,
      definition.question,
      matches,
      72 + matches.length * 4,
    )];
  });
}

function selectClusters(candidates: ScoredCluster[]): PaymentJourneyCluster[] {
  const selected: ScoredCluster[] = [];
  const ordered = candidates.slice().sort((left, right) => right.score - left.score);
  for (const kind of ["journey", "routine", "place", "day-story", "theme"] satisfies PaymentJourneyClusterKind[]) {
    const best = ordered.find((candidate) => candidate.kind === kind);
    if (best) selected.push(best);
  }
  for (const candidate of ordered) {
    if (selected.includes(candidate)) continue;
    const duplicate = selected.some((existing) => {
      const overlap = candidate.entryIds.filter((id) => existing.entryIds.includes(id)).length;
      return overlap / Math.min(candidate.entryIds.length, existing.entryIds.length) >= .85 && candidate.kind === existing.kind;
    });
    if (!duplicate) selected.push(candidate);
    if (selected.length >= 10) break;
  }
  return selected.sort((left, right) => right.score - left.score).map(({ score: _score, entryIds: _entryIds, ...item }) => item);
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildAgentPrompt(reportPath: string, clusters: PaymentJourneyCluster[]): string {
  const clues = clusters.slice(0, 8).map((item, index) => `${index + 1}. ${item.title}：${item.summary}\n   可从这里开始：${item.question}`).join("\n");
  return `我刚导入了一份消费账单，聚类报告位于 ${reportPath}。请把它当作回忆线索，和我进行一段温柔、有深度的旅程访谈。\n\n这些账单默认都是我的，不要逐笔确认“是不是你”“有没有发生”，也不要连续抛出需要回答是或否的问题。只有我主动指出代付、礼物、误识别或明显冲突时再自然校正。\n\n请优先把重复消费、同一地点、同一天的多种活动和跨日期主题串起来，不要逐笔复述。每轮只展开一个核心画面：先用一两句话温和地说出你看到的联系，再给我一个开放式邀请，让我能够用几句话或一小段故事回答。问题可以沿着地点、同行者、动机、当时的状态、转折、感受、结果和后续影响深入，但不要把这些维度一次性全部列成反问。\n\n听完我的回答后，先简短复述你理解到的重点或其中有意味的细节，再顺着我的原话追问下一层；不要重复确认已经说过的信息。普通消费可以跳过，相互关联的线索要慢慢追深。经过几轮后，帮我整理成一段连贯的旅程叙述，并明确哪些细节来自我的回答。\n\n当前候选线索：\n${clues}\n\n请先选择最可能串起一段完整经历的线索，像一个熟悉我的朋友那样，从一个具体、容易进入的画面开始邀请我讲述。`;
}

function buildReport(title: string, source: string, createdAt: string, entries: PaymentEntry[], clusters: PaymentJourneyCluster[], agentPrompt: string): string {
  const netExpense = entries.reduce((total, entry) => total + entry.netExpense, 0);
  const activeDays = new Set(entries.map((entry) => entry.date)).size;
  const clusterSections = clusters.map((item) => `## ${item.title}\n\n${item.summary}\n\n**适合展开：** ${item.question}\n\n**关联类别：** ${item.categories.join("、")}\n\n${item.evidence.map((line) => `- ${line}`).join("\n")}`).join("\n\n");
  const rows = entries.map((entry) => `| ${entry.id} | ${entry.createdAt} | ${markdownEscape(entry.merchant)} | ${markdownEscape(entry.product)} | ${entry.category} | ${entry.amount.toFixed(2)} | ${entry.status} | ${entry.refund.toFixed(2)} |`).join("\n");
  return `---\ntype: source\nimport_channel: alipay\nsource: ${JSON.stringify(source)}\nimported_at: ${createdAt}\n---\n\n# ${title}\n\n这是一份由支付宝账单确定性解析得到的消费旅程报告。聚类是回忆候选，不代表已经确认的人生事实。\n\n- 交易记录：${entries.length} 笔\n- 活跃日期：${activeDays} 天\n- 净支出：${netExpense.toFixed(2)} 元\n- 退款记录：${entries.filter((entry) => entry.status === "退款成功").length} 笔\n- 旅程线索：${clusters.length} 组\n\n# 值得继续讲述的线索\n\n${clusterSections}\n\n# 与 Agent 继续回忆\n\n${agentPrompt}\n\n# 规范化交易证据\n\n| 编号 | 时间 | 交易对方 | 商品或说明 | 类别 | 金额 | 状态 | 成功退款 |\n| --- | --- | --- | --- | --- | ---: | --- | ---: |\n${rows}\n`;
}

export function prepareAlipayStatement(file: SourceImportFile, createdAt: string): PreparedPaymentStatement {
  if (path.posix.extname(file.name).toLocaleLowerCase() !== ".csv") throw new Error("支付宝账单请上传 CSV 文件");
  const decoded = decodeFile(file);
  const entries = parseEntries(decoded);
  const dates = entries.map((entry) => entry.date).sort();
  const start = dates[0]!;
  const end = dates.at(-1)!;
  const title = `支付宝消费旅程 ${start} 至 ${end}`;
  const reportPath = `${title}.md`;
  const clusters = selectClusters([
    ...journeyClusters(entries),
    ...dayStoryClusters(entries),
    ...themeClusters(entries),
    ...placeClusters(entries),
    ...recurringClusters(entries),
  ]);
  const agentPrompt = buildAgentPrompt(reportPath, clusters);
  const report = buildReport(title, file.relativePath || file.name, createdAt, entries, clusters, agentPrompt);
  const rawPath = `${title} · 原始记录.csv`;
  return {
    files: [
      { originalName: file.name, relativePath: reportPath, content: report, bytes: Buffer.byteLength(report, "utf8") },
      { originalName: file.name, relativePath: rawPath, content: decoded, bytes: Buffer.byteLength(decoded, "utf8") },
    ],
    journey: {
      provider: "alipay",
      title,
      reportPath,
      period: { start, end },
      transactionCount: entries.length,
      activeDays: new Set(entries.map((entry) => entry.date)).size,
      netExpense: Number(entries.reduce((total, entry) => total + entry.netExpense, 0).toFixed(2)),
      refundCount: entries.filter((entry) => entry.status === "退款成功").length,
      clusters,
      agentPrompt,
    },
  };
}
