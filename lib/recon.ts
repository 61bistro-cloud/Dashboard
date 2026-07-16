import { prisma } from "@/lib/prisma";

export type MatchField = "PAYMENT" | "TABLE" | "CHANNEL";

export const MATCH_FIELD_LABEL: Record<MatchField, string> = {
  PAYMENT: "ประเภทการชำระ",
  TABLE: "โต๊ะ",
  CHANNEL: "ช่องทาง",
};

/**
 * Seeded from this shop's real Foodstory data. Order = priority: a bill is
 * matched against items top-down and the FIRST hit wins — important because
 * Grab/Wokboy bills also carry paymentType "Bank Transfer" and would
 * otherwise be double-counted.
 */
export const DEFAULT_ITEMS: {
  name: string;
  matchField: MatchField | null;
  matchKeywords: string | null;
}[] = [
  { name: "Grab (Wokboy)", matchField: "TABLE", matchKeywords: "wokboy" },
  { name: "Grab", matchField: "TABLE", matchKeywords: "grab" },
  {
    name: "LINE MAN",
    matchField: "PAYMENT",
    matchKeywords: "line man,lineman",
  },
  {
    name: "EDC (บัตร)",
    matchField: "PAYMENT",
    matchKeywords: "visa,master,jcb",
  },
  { name: "PromptPay", matchField: "PAYMENT", matchKeywords: "promptpay" },
  {
    name: "โอนเข้าบัญชี",
    matchField: "PAYMENT",
    matchKeywords: "bank transfer",
  },
  { name: "เงินสด", matchField: "PAYMENT", matchKeywords: "cash" },
];

const WEEKDAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

/** Create the default items on first use, then return the active list. */
export async function ensureReconItems(businessId: number) {
  const count = await prisma.reconItem.count({ where: { businessId } });
  if (count === 0) {
    await prisma.reconItem.createMany({
      data: DEFAULT_ITEMS.map((d, i) => ({
        businessId,
        name: d.name,
        matchField: d.matchField,
        matchKeywords: d.matchKeywords,
        sortOrder: i + 1,
      })),
    });
  }
  return prisma.reconItem.findMany({
    where: { businessId, active: true },
    orderBy: { sortOrder: "asc" },
  });
}

type BillLite = {
  paymentType: string | null;
  channel: string | null;
  tableNo: string | null;
};
type ItemLite = {
  id: number;
  matchField: string | null;
  matchKeywords: string | null;
};

/** First item whose rule matches this bill (priority = list order). */
export function matchItem(bill: BillLite, items: ItemLite[]): number | null {
  for (const it of items) {
    if (!it.matchField || !it.matchKeywords) continue;
    const raw =
      it.matchField === "PAYMENT"
        ? bill.paymentType
        : it.matchField === "TABLE"
          ? bill.tableNo
          : bill.channel;
    const v = (raw ?? "").toLowerCase();
    if (!v) continue;
    const kws = it.matchKeywords
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (kws.some((k) => v.includes(k))) return it.id;
  }
  return null;
}

export type ReconDay = {
  date: string;
  weekday: string;
  pos: number; // auto from POS (grandTotal)
  actual: number | null; // manually entered
  diff: number | null; // pos − actual (ค่าธรรมเนียม/GP)
};

export type ReconItemMonth = {
  id: number;
  name: string;
  matchField: string | null;
  matchKeywords: string | null;
  sortOrder: number;
  days: ReconDay[];
  totalPos: number;
  totalActual: number;
  totalDiff: number; // only counts days that have an actual entered
};

export type ReconMonth = {
  month: { id: number; fullLabel: string };
  items: ReconItemMonth[];
  /** POS money that matched no item — surfaced so nothing goes missing. */
  unmatchedPos: number;
  /** Bank withdrawals per day (ค่าใช้จ่ายรายวัน) */
  expenseByDay: { date: string; amount: number }[];
  expenseTotal: number;
};

export async function getReconMonth(
  businessId: number,
  fiscalMonthId: number
): Promise<ReconMonth | null> {
  const month = await prisma.fiscalMonth.findUnique({
    where: { id: fiscalMonthId },
  });
  if (!month) return null;

  const y = month.calendarYear;
  const mo = month.calendarMonth;
  const days = month.daysInMonth;
  const monthStart = `${y}-${pad(mo)}-01`;
  const monthEnd = `${y}-${pad(mo)}-${pad(days)}`;

  const items = await ensureReconItems(businessId);

  const [bills, entries, withdraws] = await Promise.all([
    prisma.posBill.findMany({
      where: { businessId, businessDate: { gte: monthStart, lte: monthEnd } },
      select: {
        businessDate: true,
        paymentType: true,
        channel: true,
        tableNo: true,
        grandTotal: true,
      },
    }),
    prisma.reconEntry.findMany({
      where: { businessId, date: { gte: monthStart, lte: monthEnd } },
      select: { reconItemId: true, date: true, actual: true },
    }),
    prisma.bankTransaction.findMany({
      where: { businessId, withdraw: { gt: 0 }, fiscalMonthId },
      select: { date: true, withdraw: true },
    }),
  ]);

  // POS grandTotal by item + business day
  const posBy = new Map<string, number>(); // `${itemId}|${date}`
  let unmatchedPos = 0;
  for (const b of bills) {
    const itemId = matchItem(b, items);
    if (itemId == null) {
      unmatchedPos = r2(unmatchedPos + b.grandTotal);
      continue;
    }
    const k = `${itemId}|${b.businessDate}`;
    posBy.set(k, r2((posBy.get(k) ?? 0) + b.grandTotal));
  }

  const actualBy = new Map<string, number>();
  for (const e of entries) actualBy.set(`${e.reconItemId}|${e.date}`, e.actual);

  const outBy = new Map<string, number>();
  for (const t of withdraws) {
    const d = t.date.toISOString().slice(0, 10);
    outBy.set(d, r2((outBy.get(d) ?? 0) + t.withdraw));
  }

  const dateList: string[] = [];
  for (let d = 1; d <= days; d++) dateList.push(`${y}-${pad(mo)}-${pad(d)}`);

  const itemMonths: ReconItemMonth[] = items.map((it) => {
    let totalPos = 0;
    let totalActual = 0;
    let totalDiff = 0;
    const dayRows: ReconDay[] = dateList.map((date) => {
      const pos = posBy.get(`${it.id}|${date}`) ?? 0;
      const rawActual = actualBy.get(`${it.id}|${date}`);
      const actual = rawActual == null ? null : rawActual;
      const diff = actual == null ? null : r2(pos - actual);
      totalPos = r2(totalPos + pos);
      if (actual != null) {
        totalActual = r2(totalActual + actual);
        totalDiff = r2(totalDiff + (diff ?? 0));
      }
      return {
        date,
        weekday: WEEKDAY_TH[new Date(date + "T00:00:00Z").getUTCDay()],
        pos,
        actual,
        diff,
      };
    });
    return {
      id: it.id,
      name: it.name,
      matchField: it.matchField,
      matchKeywords: it.matchKeywords,
      sortOrder: it.sortOrder,
      days: dayRows,
      totalPos,
      totalActual,
      totalDiff,
    };
  });

  const expenseByDay = dateList.map((date) => ({
    date,
    amount: outBy.get(date) ?? 0,
  }));

  return {
    month: { id: month.id, fullLabel: month.fullLabel },
    items: itemMonths,
    unmatchedPos,
    expenseByDay,
    expenseTotal: r2(expenseByDay.reduce((s, d) => s + d.amount, 0)),
  };
}
