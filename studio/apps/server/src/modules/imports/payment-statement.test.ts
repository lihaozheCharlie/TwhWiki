import { describe, expect, it } from "vitest";
import { prepareAlipayStatement } from "./payment-statement.js";

const header = ["交易号", "商家订单号", "交易创建时间", "付款时间", "最近修改时间", "交易来源地", "类型", "交易对方", "商品名称", "金额（元）", "收/支", "交易状态", "服务费（元）", "成功退款（元）", "备注", "资金状态"];

function transaction(index: number, createdAt: string, merchant: string, product: string, amount: number, status = "交易成功", refund = 0, direction = "支出"): string {
  return [String(index).padStart(28, "0"), `order-${index}`, createdAt, createdAt, createdAt, "其他（包括阿里巴巴和外部商家）", "即时到账交易", merchant, product, amount.toFixed(2), direction, status, "0.00", refund.toFixed(2), "", direction === "支出" ? "已支出" : "已收入"].join(",");
}

function statement(): string {
  return [
    "支付宝交易记录明细查询",
    "账号:[demo@example.invalid]",
    "起始日期:[2026-08-01 00:00:00]    终止日期:[2026-08-20 23:59:59]",
    "----------------交易记录明细列表----------------",
    header.join(","),
    transaction(1, "2026-08-01 12:02:00", "24H便利购", "杭州西溪园区智能货柜消费_纯悦水", 4),
    transaction(2, "2026-08-02 12:05:00", "24H便利购", "杭州西溪园区智能货柜消费_纯悦水", 4),
    transaction(3, "2026-08-03 12:01:00", "24H便利购", "杭州西溪园区智能货柜消费_纯悦水", 4),
    transaction(4, "2026-08-10 09:10:00", "高德打车", "高德打车订单", 35),
    transaction(5, "2026-08-10 13:00:00", "北京渔沅餐饮有限公司", "北京餐厅扫码收款", 120),
    transaction(6, "2026-08-11 18:50:00", "柒一拾壹（北京）有限公司", "7-ELEVEn北京环贸中心店", 12),
    transaction(7, "2026-08-11 21:20:00", "高德打车", "高德打车订单", 20),
    transaction(8, "2026-08-12 10:00:00", "美利达科技城店", "骑行装备", 138),
    transaction(9, "2026-08-15 17:00:00", "迪卡侬杭州余杭店", "跑步运动装备", 80),
    transaction(10, "2026-08-16 09:00:00", "铁路12306", "火车票", 600, "交易成功", 500),
    transaction(11, "2026-08-16 10:00:00", "铁路12306", "退款-火车票", 500, "退款成功", 0, "不计收支"),
    "----------------",
    "共11笔记录",
  ].join("\r");
}

describe("Alipay payment statement", () => {
  it("reconciles refunds and connects recurring, place, journey, day and theme clues", () => {
    const content = statement();
    const result = prepareAlipayStatement({ name: "alipay.csv", content: Buffer.from(content).toString("base64"), encoding: "base64" }, "2026-08-28T00:00:00.000Z");

    expect(result.journey.transactionCount).toBe(11);
    expect(result.journey.refundCount).toBe(1);
    expect(result.journey.netExpense).toBe(517);
    expect(result.journey.clusters.map((item) => item.kind)).toEqual(expect.arrayContaining(["journey", "place", "routine", "theme"]));
    expect(result.journey.clusters.find((item) => item.kind === "journey")?.title).toContain("北京");
    expect(result.journey.agentPrompt).toContain("这些账单默认都是我的");
    expect(result.journey.agentPrompt).toContain("不要逐笔确认");
    expect(result.journey.agentPrompt).toContain("每轮只展开一个核心画面");
    expect(result.journey.agentPrompt).toContain("重复消费、同一地点、同一天的多种活动和跨日期主题串起来");
    expect(result.journey.agentPrompt).not.toContain("先确认是否是我本人");
    expect(result.journey.clusters.some((item) => /是否|是不是|有没有/.test(item.question))).toBe(false);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]?.content).toContain("# 值得继续讲述的线索");
    expect(result.files[0]?.content).toContain("**适合展开：**");
    expect(result.files[0]?.content).toContain("# 规范化交易证据");
  });

  it("rejects a CSV without an Alipay transaction header", () => {
    expect(() => prepareAlipayStatement({ name: "wrong.csv", content: "a,b,c" }, "2026-08-28T00:00:00.000Z")).toThrow("没有找到支付宝账单表头");
  });
});
