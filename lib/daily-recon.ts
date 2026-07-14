import { prisma } from "@/lib/prisma";
import { classifyBill } from "@/lib/bank-calc";

export type ChannelKey = "EDC_PROMPTPAY" | "GRAB" | "LINEMAN" | "CASH";

export const RECON_CHANNELS: {
  key: ChannelKey;
  label: string;
  fee: boolean;
}[] = [
  { key: "EDC_PROMPTPAY", label: "EDC + PromptPay", fee: true },
  { key: "GRAB", label: "Grab", fee: true },
  { key: "LINEMAN", label: "LINE MAN", fee: true },
  { key: "CASH", label: "เงินสด", fee: false },
];

export const DEFAULT_LAG: Record<ChannelKey, number> = {
  EDC_PROMPTPAY: 1,
  GRAB: 1,
  LINEMAN: 1,
  CASH: 0,
};

const WEEKDAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function zero(): Record<ChannelKey, number> {
  return { EDC_PROMPTPAY: 0, GRAB: 0, LINEMAN: 0, CASH: 0 };
}

export type DailyReconRow = {
  date: string;
  weekday: string;
  pos: Record<ChannelKey, number>; // POS grandTotal by channel (on the sale day)
  bankIn: Record<ChannelKey, number>; // bank deposit on saleDay + lag (settlement)
  fee: Record<ChannelKey, number>; // pos − bankIn (ค่าธรรมเนียม / GP)
  expense: number; // bank withdrawals on this day
};

export type DailyReconResult = {
  month: { id: number; fullLabel: string };
  rows: DailyReconRow[];
  totals: {
    pos: Record<ChannelKey, number>;
    bankIn: Record<ChannelKey, number>;
    fee: Record<ChannelKey, number>;
    expense: number;
  };
};

/**
 * Daily reconciliation for a month: compares POS sales (grandTotal = amount
 * charged) against the actual bank money-in per channel, accounting for a
 * per-channel settlement lag (e.g. EDC settles T+1, net of fee). Also totals
 * daily bank expenses (withdrawals).
 */
export async function getDailyRecon(
  businessId: number,
  fiscalMonthId: number,
  lag: Record<ChannelKey, number>
): Promise<DailyReconResult | null> {
  const month = await prisma.fiscalMonth.findUnique({
    where: { id: fiscalMonthId },
  });
  if (!month) return null;

  const y = month.calendarYear;
  const mo = month.calendarMonth;
  const days = month.daysInMonth;
  const monthStart = `${y}-${pad(mo)}-01`;
  const monthEnd = `${y}-${pad(mo)}-${pad(days)}`;
  const maxLag = Math.max(0, ...Object.values(lag));
  const rangeStart = new Date(monthStart + "T00:00:00Z");
  const bankEnd = new Date(addDays(monthEnd, maxLag) + "T23:59:59Z");

  const [bills, deposits, withdraws] = await Promise.all([
    prisma.posBill.findMany({
      where: { businessId, businessDate: { gte: monthStart, lte: monthEnd } },
      select: {
        businessDate: true,
        paymentType: true,
        channel: true,
        grandTotal: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: {
        businessId,
        deposit: { gt: 0 },
        date: { gte: rangeStart, lte: bankEnd },
      },
      select: {
        date: true,
        deposit: true,
        category: { select: { posChannel: true } },
      },
    }),
    prisma.bankTransaction.findMany({
      where: { businessId, withdraw: { gt: 0 }, fiscalMonthId },
      select: { date: true, withdraw: true },
    }),
  ]);

  // POS by business day + channel
  const posMap = new Map<string, Record<ChannelKey, number>>();
  for (const b of bills) {
    const ch = classifyBill(b) as ChannelKey | null;
    if (!ch) continue;
    const rec = posMap.get(b.businessDate) ?? zero();
    rec[ch] = r2(rec[ch] + b.grandTotal);
    posMap.set(b.businessDate, rec);
  }

  // Bank deposits by calendar day + channel (from the categorized posChannel)
  const bankMap = new Map<string, Record<ChannelKey, number>>();
  for (const t of deposits) {
    const ch = t.category?.posChannel as ChannelKey | undefined;
    if (!ch || !(ch in DEFAULT_LAG)) continue;
    const d = t.date.toISOString().slice(0, 10);
    const rec = bankMap.get(d) ?? zero();
    rec[ch] = r2(rec[ch] + t.deposit);
    bankMap.set(d, rec);
  }

  // Expenses (withdrawals) by calendar day
  const outMap = new Map<string, number>();
  for (const t of withdraws) {
    const d = t.date.toISOString().slice(0, 10);
    outMap.set(d, r2((outMap.get(d) ?? 0) + t.withdraw));
  }

  const rows: DailyReconRow[] = [];
  const totals = { pos: zero(), bankIn: zero(), fee: zero(), expense: 0 };

  for (let day = 1; day <= days; day++) {
    const date = `${y}-${pad(mo)}-${pad(day)}`;
    const weekday = WEEKDAY_TH[new Date(date + "T00:00:00Z").getUTCDay()];
    const pos = posMap.get(date) ?? zero();
    const bankIn = zero();
    const fee = zero();
    for (const { key } of RECON_CHANNELS) {
      const settleDate = addDays(date, lag[key] ?? 0);
      const inAmt = bankMap.get(settleDate)?.[key] ?? 0;
      bankIn[key] = inAmt;
      // Only a meaningful fee/GP once the settlement deposit actually exists.
      fee[key] = inAmt > 0 ? r2(pos[key] - inAmt) : 0;
      totals.pos[key] = r2(totals.pos[key] + pos[key]);
      totals.bankIn[key] = r2(totals.bankIn[key] + inAmt);
      if (inAmt > 0) totals.fee[key] = r2(totals.fee[key] + fee[key]);
    }
    const expense = outMap.get(date) ?? 0;
    totals.expense = r2(totals.expense + expense);
    rows.push({ date, weekday, pos, bankIn, fee, expense });
  }

  return {
    month: { id: month.id, fullLabel: month.fullLabel },
    rows,
    totals,
  };
}
