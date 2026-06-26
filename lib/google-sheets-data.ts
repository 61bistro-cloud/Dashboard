import { prisma } from "@/lib/prisma";
import { getYearlyPL } from "@/lib/pl-calc";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pctStr = (p: number | null) =>
  p == null ? "" : `${(p * 100).toFixed(1)}%`;

export type SheetTab = { title: string; values: (string | number)[][] };

/**
 * Build every Master-Sheet tab for the most recent fiscal year that has data:
 *   - P&L รายเดือน (12 เดือน + รวมทั้งปี)
 *   - ต้นทุนรายเดือน (อาหาร/เครื่องดื่ม/บรรจุภัณฑ์/เงินเดือน/OT/Fixed)
 *   - ธุรกรรมธนาคาร (ทุกบัญชี ทั้งปี)
 *   - POS รายวัน (ยอดขายต่อวัน)
 */
export async function buildMasterTabs(businessId: number): Promise<SheetTab[]> {
  const fy = await prisma.fiscalYear.findFirst({
    orderBy: { yearBE: "desc" },
    include: { months: { orderBy: { monthIndex: "asc" } } },
  });
  if (!fy || fy.months.length === 0) {
    return [{ title: "ข้อมูล", values: [["ยังไม่มีข้อมูลปีงบ"]] }];
  }

  const tabs: SheetTab[] = [];
  const yearly = await getYearlyPL(fy.yearBE, businessId);

  // ── P&L รายเดือน ──
  if (yearly) {
    const head = [
      "เดือน",
      "รายได้",
      "ต้นทุนวัตถุดิบ",
      "ค่าแรง",
      "ค่าใช้จ่ายประจำ",
      "ต้นทุนรวม",
      "กำไรสุทธิ",
      "%กำไร",
      "Food%",
      "Labor%",
      "Prime%",
    ];
    const row = (m: (typeof yearly.months)[number] | typeof yearly.total) => [
      m.fullLabel,
      r2(m.netRevenue),
      r2(m.cogs),
      r2(m.labor),
      r2(m.fixed),
      r2(m.totalCost),
      r2(m.netProfit),
      pctStr(m.marginPct),
      pctStr(m.foodPct),
      pctStr(m.laborPct),
      pctStr(m.primePct),
    ];
    tabs.push({
      title: "P&L รายเดือน",
      values: [
        [`งบกำไรขาดทุน — ${fy.label}`],
        head,
        ...yearly.months.map(row),
        row(yearly.total),
      ],
    });

    // ── ต้นทุนรายเดือน ──
    tabs.push({
      title: "ต้นทุนรายเดือน",
      values: [
        [
          "เดือน",
          "อาหาร",
          "เครื่องดื่ม",
          "บรรจุภัณฑ์",
          "เงินเดือน",
          "OT/พิเศษ",
          "ค่าใช้จ่ายประจำ",
        ],
        ...yearly.months.map((m) => [
          m.fullLabel,
          r2(m.food),
          r2(m.bev),
          r2(m.pack),
          r2(m.laborBase),
          r2(m.laborExtra),
          r2(m.fixed),
        ]),
      ],
    });
  }

  const monthIds = fy.months.map((m) => m.id);
  const first = fy.months[0];
  const last = fy.months[fy.months.length - 1];
  const yStart = `${first.calendarYear}-${String(first.calendarMonth).padStart(2, "0")}-01`;
  const yEnd = `${last.calendarYear}-${String(last.calendarMonth).padStart(2, "0")}-${String(last.daysInMonth).padStart(2, "0")}`;

  // ── ธุรกรรมธนาคาร ──
  const txs = await prisma.bankTransaction.findMany({
    where: { businessId, fiscalMonthId: { in: monthIds } },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ accountId: "asc" }, { date: "asc" }, { id: "asc" }],
  });
  tabs.push({
    title: "ธุรกรรมธนาคาร",
    values: [
      ["วันที่", "เวลา", "บัญชี", "รายการ", "ฝาก", "ถอน", "คงเหลือ", "หมวด"],
      ...txs.map((t) => [
        t.date.toISOString().slice(0, 10),
        t.date.toISOString().slice(11, 16),
        t.account.name,
        t.description,
        t.deposit || "",
        t.withdraw || "",
        t.balanceAfter ?? "",
        t.category?.name ?? "",
      ]),
    ],
  });

  // ── POS รายวัน ──
  const bills = await prisma.posBill.groupBy({
    by: ["businessDate"],
    where: { businessId, businessDate: { gte: yStart, lte: yEnd } },
    _sum: { netAmount: true, grandTotal: true },
    _count: { id: true },
  });
  bills.sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  tabs.push({
    title: "POS รายวัน",
    values: [
      ["วันที่", "จำนวนบิล", "ยอดสุทธิ (Net)", "ยอดเก็บจริง (Grand)"],
      ...bills.map((b) => [
        b.businessDate,
        b._count.id,
        r2(b._sum.netAmount ?? 0),
        r2(b._sum.grandTotal ?? 0),
      ]),
    ],
  });

  return tabs;
}
