import { prisma } from "@/lib/prisma";

export type BankMonthData = {
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
  txCount: number;
  rows: Array<{
    id: number;
    date: Date;
    description: string;
    deposit: number;
    withdraw: number;
    runningBalance: number;
    channel: string | null;
    note: string | null;
    categoryName: string | null;
    categoryId: number | null;
  }>;
};

export async function getBankMonth(
  fiscalMonthId: number,
  accountId: number
): Promise<BankMonthData> {
  const [opening, txs] = await Promise.all([
    prisma.accountOpening.findUnique({
      where: {
        accountId_fiscalMonthId: { accountId, fiscalMonthId },
      },
    }),
    prisma.bankTransaction.findMany({
      where: { fiscalMonthId, accountId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);

  let running = opening?.amount ?? 0;
  const rows = txs.map((t) => {
    running += t.deposit - t.withdraw;
    return {
      id: t.id,
      date: t.date,
      description: t.description,
      deposit: t.deposit,
      withdraw: t.withdraw,
      runningBalance: running,
      channel: t.channel,
      note: t.note,
      categoryName: t.category?.name ?? null,
      categoryId: t.categoryId,
    };
  });

  const inflow = txs.reduce((s, t) => s + t.deposit, 0);
  const outflow = txs.reduce((s, t) => s + t.withdraw, 0);
  return {
    opening: opening?.amount ?? 0,
    inflow,
    outflow,
    closing: (opening?.amount ?? 0) + inflow - outflow,
    txCount: txs.length,
    rows,
  };
}

export type CategorySummaryRow = {
  categoryId: number | null;
  name: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER" | "UNCATEGORIZED";
  totalIn: number;
  totalOut: number;
  count: number;
};

export async function getCategorySummary(
  fiscalMonthId: number,
  accountId?: number
): Promise<CategorySummaryRow[]> {
  const where: { fiscalMonthId: number; accountId?: number } = {
    fiscalMonthId,
  };
  if (accountId != null) where.accountId = accountId;

  const txs = await prisma.bankTransaction.findMany({
    where,
    include: { category: true },
  });

  const map = new Map<string, CategorySummaryRow>();
  for (const t of txs) {
    const key = t.categoryId == null ? "_uncat" : String(t.categoryId);
    const existing = map.get(key);
    if (existing) {
      existing.totalIn += t.deposit;
      existing.totalOut += t.withdraw;
      existing.count += 1;
    } else {
      map.set(key, {
        categoryId: t.categoryId,
        name: t.category?.name ?? "ไม่ระบุหมวด",
        kind: t.category?.kind ?? "UNCATEGORIZED",
        totalIn: t.deposit,
        totalOut: t.withdraw,
        count: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const order = { INCOME: 0, EXPENSE: 1, TRANSFER: 2, UNCATEGORIZED: 3 };
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    return a.name.localeCompare(b.name, "th");
  });
}

// ─────────── Reconciliation: POS vs Bank by channel ───────────

export type ReconRow = {
  label: string;
  posChannel: string;
  posAmount: number; // sum of PosBill.netAmount where payment matches
  bankAmount: number; // sum of BankTransaction.deposit where category.posChannel matches
  diff: number;
  diffPct: number | null;
  status: "match" | "near" | "fee" | "diff" | "missing";
};

/** Map Foodstory PosBill.paymentType / channel → our internal posChannel buckets. */
function classifyBill(b: {
  paymentType: string | null;
  channel: string | null;
}): string | null {
  const pay = (b.paymentType ?? "").toLowerCase();
  const ch = (b.channel ?? "").toLowerCase();
  if (pay.includes("cash")) return "CASH";
  if (
    pay.includes("visa") ||
    pay.includes("master") ||
    pay.includes("jcb") ||
    pay.includes("alipay")
  )
    return "EDC_PROMPTPAY";
  if (pay.includes("promptpay") || pay.includes("qr")) return "EDC_PROMPTPAY";
  if (pay.includes("bank transfer")) return "EDC_PROMPTPAY";
  if (pay.includes("line man") || ch.includes("line man")) return "LINEMAN";
  if (ch.includes("grab")) return "GRAB";
  return null;
}

const CHANNEL_LABELS: Record<string, { label: string }> = {
  EDC_PROMPTPAY: { label: "EDC + PromptPay + Card" },
  CASH: { label: "เงินสดหน้าร้าน" },
  GRAB: { label: "Grab Delivery" },
  LINEMAN: { label: "LINE MAN" },
};

export async function getReconciliation(
  fiscalMonthId: number
): Promise<ReconRow[]> {
  const month = await prisma.fiscalMonth.findUnique({
    where: { id: fiscalMonthId },
  });
  if (!month) return [];

  const monthStart = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-01`;
  const monthEnd = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-${String(month.daysInMonth).padStart(2, "0")}`;

  const [bills, bankTxs] = await Promise.all([
    prisma.posBill.findMany({
      where: { paymentDate: { gte: monthStart, lte: monthEnd } },
      select: { netAmount: true, paymentType: true, channel: true },
    }),
    prisma.bankTransaction.findMany({
      where: { fiscalMonthId },
      include: { category: { select: { posChannel: true } } },
    }),
  ]);

  // POS by channel
  const posByCh = new Map<string, number>();
  for (const b of bills) {
    const ch = classifyBill(b);
    if (!ch) continue;
    posByCh.set(ch, (posByCh.get(ch) ?? 0) + b.netAmount);
  }

  // Bank credits by category.posChannel
  const bankByCh = new Map<string, number>();
  for (const t of bankTxs) {
    const ch = t.category?.posChannel;
    if (!ch) continue;
    bankByCh.set(ch, (bankByCh.get(ch) ?? 0) + t.deposit);
  }

  const allChannels = new Set([
    ...posByCh.keys(),
    ...bankByCh.keys(),
    ...Object.keys(CHANNEL_LABELS),
  ]);
  const rows: ReconRow[] = [];
  for (const ch of allChannels) {
    const meta = CHANNEL_LABELS[ch] ?? { label: ch };
    const posAmount = posByCh.get(ch) ?? 0;
    const bankAmount = bankByCh.get(ch) ?? 0;
    const diff = posAmount - bankAmount;
    const diffPct = posAmount > 0 ? Math.abs(diff) / posAmount : null;
    let status: ReconRow["status"];
    if (posAmount === 0 && bankAmount === 0) status = "missing";
    else if (Math.abs(diff) <= 1) status = "match";
    else if (Math.abs(diff) <= 100) status = "near";
    else if (diff > 0 && diffPct != null && diffPct <= 0.06)
      status = "fee"; // bank takes a fee
    else status = "diff";

    rows.push({
      label: meta.label,
      posChannel: ch,
      posAmount,
      bankAmount,
      diff,
      diffPct,
      status,
    });
  }

  rows.sort((a, b) => {
    const order = ["EDC_PROMPTPAY", "CASH", "GRAB", "LINEMAN"];
    return order.indexOf(a.posChannel) - order.indexOf(b.posChannel);
  });

  return rows;
}

export type ReconTone = "emerald" | "sky" | "amber" | "red" | "slate";

export const RECON_STATUS_STYLE: Record<
  ReconRow["status"],
  {
    label: string;
    bg: string;
    tone: ReconTone;
    icon: "check" | "dot" | "alert" | "x" | "circle";
  }
> = {
  match: {
    label: "ตรง",
    bg: "bg-emerald-100 text-emerald-800",
    tone: "emerald",
    icon: "check",
  },
  near: {
    label: "ใกล้เคียง",
    bg: "bg-emerald-50 text-emerald-700",
    tone: "emerald",
    icon: "dot",
  },
  fee: {
    label: "ค่าธรรมเนียม",
    bg: "bg-amber-100 text-amber-800",
    tone: "amber",
    icon: "alert",
  },
  diff: {
    label: "ต่างมาก",
    bg: "bg-red-100 text-red-800",
    tone: "red",
    icon: "x",
  },
  missing: {
    label: "รอกรอก",
    bg: "bg-slate-100 text-slate-600",
    tone: "slate",
    icon: "circle",
  },
};
