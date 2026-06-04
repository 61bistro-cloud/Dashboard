import { prisma } from "@/lib/prisma";

// ─────────────── Types ───────────────

export type DailyRow = {
  date: string; // YYYY-MM-DD
  weekday: string;
  inMonth: boolean;
  billCount: number;
  grossSales: number;
  discount: number;
  netSales: number;
  vat: number;
  foodAllocated: number;
  laborAllocated: number;
  fixedAllocated: number;
  totalCost: number;
  profit: number;
  marginPct: number | null;
};

export type MonthlyTotals = {
  fiscalMonthId: number;
  monthIndex: number;
  label: string; // "เม.ย."
  fullLabel: string;
  daysInMonth: number;

  posBillCount: number;
  posNetSum: number;
  override: number;
  netRevenue: number; // max(posNetSum, override)

  food: number;
  bev: number;
  pack: number;
  cogs: number; // food+bev+pack

  laborBase: number; // salary only
  laborExtra: number; // OT+Bonus+Extra+ServiceCharge
  labor: number;

  fixed: number;

  totalCost: number;
  netProfit: number;

  marginPct: number | null;
  foodPct: number | null;
  laborPct: number | null;
  primePct: number | null;
  fixedPct: number | null;
};

const WEEKDAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function safeMax(a: number, b: number): number {
  return a > b ? a : b;
}

// ─────────────── Yearly P&L (12 months matrix) ───────────────

export async function getYearlyPL(
  yearBE: number,
  businessId: number
): Promise<{
  year: { id: number; yearBE: number; label: string };
  months: MonthlyTotals[];
  total: MonthlyTotals; // year-to-date summed
} | null> {
  const year = await prisma.fiscalYear.findUnique({
    where: { yearBE },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
    },
  });
  if (!year) return null;

  const monthIds = year.months.map((m) => m.id);
  const monthById = new Map(year.months.map((m) => [m.id, m]));

  const yearStart = `${year.months[0].calendarYear}-${String(year.months[0].calendarMonth).padStart(2, "0")}-01`;
  // Last day of last month (March of next year)
  const lastMonth = year.months[11];
  const yearEnd = `${lastMonth.calendarYear}-${String(lastMonth.calendarMonth).padStart(2, "0")}-${String(lastMonth.daysInMonth).padStart(2, "0")}`;

  // Batch query: aggregate POS sales by businessDate for the whole year
  const billRows = await prisma.posBill.groupBy({
    by: ["businessDate"],
    where: { businessId, businessDate: { gte: yearStart, lte: yearEnd } },
    _sum: { netAmount: true },
    _count: { id: true },
  });

  // Reduce daily into per-fiscal-month buckets
  const posByMonth = new Map<number, { net: number; count: number }>();
  for (const m of year.months) {
    posByMonth.set(m.id, { net: 0, count: 0 });
  }
  for (const row of billRows) {
    // row.businessDate is "YYYY-MM-DD"
    const [yStr, mStr] = row.businessDate.split("-");
    const calY = Number(yStr);
    const calM = Number(mStr);
    const month = year.months.find(
      (m) => m.calendarYear === calY && m.calendarMonth === calM
    );
    if (!month) continue;
    const bucket = posByMonth.get(month.id)!;
    bucket.net += row._sum.netAmount ?? 0;
    bucket.count += row._count.id;
  }

  // Batch queries for costs
  const [purchases, suppliers, payrolls, extras, fixedCosts, overrides] =
    await Promise.all([
      prisma.supplierPurchase.findMany({
        where: { businessId, fiscalMonthId: { in: monthIds } },
        select: { fiscalMonthId: true, amount: true, supplierId: true },
      }),
      prisma.supplier.findMany({
        where: { businessId },
        select: { id: true, category: true },
      }),
      prisma.employeePayroll.groupBy({
        by: ["fiscalMonthId"],
        where: { businessId, fiscalMonthId: { in: monthIds } },
        _sum: { amount: true },
      }),
      prisma.payrollExtra.groupBy({
        by: ["fiscalMonthId"],
        where: { businessId, fiscalMonthId: { in: monthIds } },
        _sum: { amount: true },
      }),
      prisma.fixedCost.groupBy({
        by: ["fiscalMonthId"],
        where: { businessId, fiscalMonthId: { in: monthIds } },
        _sum: { amount: true },
      }),
      prisma.monthlyRevenueOverride.findMany({
        where: { businessId, fiscalMonthId: { in: monthIds } },
      }),
    ]);

  const supplierCat = new Map(suppliers.map((s) => [s.id, s.category]));
  const costByMonth = new Map<
    number,
    { food: number; bev: number; pack: number }
  >();
  for (const id of monthIds) {
    costByMonth.set(id, { food: 0, bev: 0, pack: 0 });
  }
  for (const p of purchases) {
    const cat = supplierCat.get(p.supplierId);
    const bucket = costByMonth.get(p.fiscalMonthId);
    if (!bucket || !cat) continue;
    if (cat === "FOOD") bucket.food += p.amount;
    else if (cat === "BEVERAGE") bucket.bev += p.amount;
    else if (cat === "PACKAGING") bucket.pack += p.amount;
  }

  const laborBaseByMonth = new Map<number, number>(
    payrolls.map((p) => [p.fiscalMonthId, p._sum.amount ?? 0])
  );
  const laborExtraByMonth = new Map<number, number>(
    extras.map((e) => [e.fiscalMonthId, e._sum.amount ?? 0])
  );
  const fixedByMonth = new Map<number, number>(
    fixedCosts.map((f) => [f.fiscalMonthId, f._sum.amount ?? 0])
  );
  const overrideByMonth = new Map<number, number>(
    overrides.map((o) => [o.fiscalMonthId, o.amount])
  );

  const months: MonthlyTotals[] = year.months.map((m) => {
    const pos = posByMonth.get(m.id) ?? { net: 0, count: 0 };
    const c = costByMonth.get(m.id) ?? { food: 0, bev: 0, pack: 0 };
    const laborBase = laborBaseByMonth.get(m.id) ?? 0;
    const laborExtra = laborExtraByMonth.get(m.id) ?? 0;
    const labor = laborBase + laborExtra;
    const fixed = fixedByMonth.get(m.id) ?? 0;
    const override = overrideByMonth.get(m.id) ?? 0;

    const cogs = c.food + c.bev + c.pack;
    const netRevenue = safeMax(pos.net, override);
    const totalCost = cogs + labor + fixed;
    const netProfit = netRevenue - totalCost;

    return {
      fiscalMonthId: m.id,
      monthIndex: m.monthIndex,
      label: m.label,
      fullLabel: m.fullLabel,
      daysInMonth: m.daysInMonth,

      posBillCount: pos.count,
      posNetSum: pos.net,
      override,
      netRevenue,

      food: c.food,
      bev: c.bev,
      pack: c.pack,
      cogs,

      laborBase,
      laborExtra,
      labor,

      fixed,
      totalCost,
      netProfit,

      marginPct: pct(netProfit, netRevenue),
      // "Food %" in restaurant P&L = total COGS (Food+Bev+Pack) — matches Excel Dashboard
      foodPct: pct(cogs, netRevenue),
      laborPct: pct(labor, netRevenue),
      primePct: pct(cogs + labor, netRevenue),
      fixedPct: pct(fixed, netRevenue),
    };
  });

  // Year-to-date summed total
  const sum = (fn: (m: MonthlyTotals) => number) =>
    months.reduce((s, m) => s + fn(m), 0);

  const totalRevenue = sum((m) => m.netRevenue);
  const totalFood = sum((m) => m.food);
  const totalBev = sum((m) => m.bev);
  const totalPack = sum((m) => m.pack);
  const totalLaborBase = sum((m) => m.laborBase);
  const totalLaborExtra = sum((m) => m.laborExtra);
  const totalLabor = totalLaborBase + totalLaborExtra;
  const totalFixed = sum((m) => m.fixed);
  const totalCogs = totalFood + totalBev + totalPack;
  const totalCost = totalCogs + totalLabor + totalFixed;
  const totalProfit = totalRevenue - totalCost;

  const total: MonthlyTotals = {
    fiscalMonthId: 0,
    monthIndex: 0,
    label: "รวมทั้งปี",
    fullLabel: `รวมทั้งปี ${year.yearBE}`,
    daysInMonth: months.reduce((s, m) => s + m.daysInMonth, 0),
    posBillCount: sum((m) => m.posBillCount),
    posNetSum: sum((m) => m.posNetSum),
    override: sum((m) => m.override),
    netRevenue: totalRevenue,
    food: totalFood,
    bev: totalBev,
    pack: totalPack,
    cogs: totalCogs,
    laborBase: totalLaborBase,
    laborExtra: totalLaborExtra,
    labor: totalLabor,
    fixed: totalFixed,
    totalCost,
    netProfit: totalProfit,
    marginPct: pct(totalProfit, totalRevenue),
    foodPct: pct(totalCogs, totalRevenue),
    laborPct: pct(totalLabor, totalRevenue),
    primePct: pct(totalCogs + totalLabor, totalRevenue),
    fixedPct: pct(totalFixed, totalRevenue),
  };

  return {
    year: { id: year.id, yearBE: year.yearBE, label: year.label },
    months,
    total,
  };
}

// ─────────────── Daily P&L for a month ───────────────

export async function getDailyPL(
  fiscalMonthId: number,
  businessId: number
): Promise<{
  month: {
    id: number;
    label: string;
    fullLabel: string;
    daysInMonth: number;
    calendarYear: number;
    calendarMonth: number;
  };
  totals: MonthlyTotals;
  days: DailyRow[];
} | null> {
  const month = await prisma.fiscalMonth.findUnique({
    where: { id: fiscalMonthId },
    include: { year: true },
  });
  if (!month) return null;

  // Get all monthly totals (reuses same costs computation)
  const yearly = await getYearlyPL(month.year.yearBE, businessId);
  if (!yearly) return null;
  const monthTotals = yearly.months.find(
    (m) => m.fiscalMonthId === fiscalMonthId
  );
  if (!monthTotals) return null;

  const days = month.daysInMonth;
  const monthStart = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-01`;
  const monthEnd = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-${String(days).padStart(2, "0")}`;

  // Per-day POS aggregates
  const billRows = await prisma.posBill.groupBy({
    by: ["businessDate"],
    where: { businessId, businessDate: { gte: monthStart, lte: monthEnd } },
    _sum: {
      netAmount: true,
      grossAmount: true,
      totalDiscount: true,
      vatAmount: true,
    },
    _count: { id: true },
  });
  const byDate = new Map(billRows.map((r) => [r.businessDate, r]));

  // Allocations: per-day = monthly total / daysInMonth
  const foodPerDay = monthTotals.cogs / days; // COGS distributed (per Excel)
  // Wait — Excel splits Food separately from Bev/Pack? Looking again:
  //  Daily P&L cols are 🥩 Food (จัดสรร), 👥 Labor, 🏠 Fixed
  //  In May, Food per day = 95,597 / 31 = 3,083.77 → matches Excel ✓
  //  So "Food" in Daily P&L = total COGS (Food+Bev+Pack)
  const laborPerDay = monthTotals.labor / days;
  const fixedPerDay = monthTotals.fixed / days;

  const dailyRows: DailyRow[] = [];
  for (let day = 1; day <= days; day++) {
    const dateStr = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const d = new Date(dateStr + "T00:00:00Z");
    const weekday = WEEKDAY_TH[d.getUTCDay()];
    const pos = byDate.get(dateStr);

    const billCount = pos?._count.id ?? 0;
    const grossSales = pos?._sum.grossAmount ?? 0;
    const discount = pos?._sum.totalDiscount ?? 0;
    const netSales = pos?._sum.netAmount ?? 0;
    const vat = pos?._sum.vatAmount ?? 0;

    const totalCost = foodPerDay + laborPerDay + fixedPerDay;
    const profit = netSales - totalCost;

    dailyRows.push({
      date: dateStr,
      weekday,
      inMonth: true,
      billCount,
      grossSales,
      discount,
      netSales,
      vat,
      foodAllocated: foodPerDay,
      laborAllocated: laborPerDay,
      fixedAllocated: fixedPerDay,
      totalCost,
      profit,
      marginPct: pct(profit, netSales),
    });
  }

  return {
    month: {
      id: month.id,
      label: month.label,
      fullLabel: month.fullLabel,
      daysInMonth: days,
      calendarYear: month.calendarYear,
      calendarMonth: month.calendarMonth,
    },
    totals: monthTotals,
    days: dailyRows,
  };
}

// ─────────────── KPI benchmarks ───────────────

export type KpiStatus = "good_plus" | "good" | "ok" | "bad";
export type KpiTone = "emerald" | "sky" | "amber" | "red";

export const KPI_STATUS_STYLE: Record<
  KpiStatus,
  { tone: KpiTone; bg: string; label: string }
> = {
  good_plus: {
    tone: "emerald",
    bg: "bg-emerald-100 text-emerald-800",
    label: "ดีมาก",
  },
  good: { tone: "sky", bg: "bg-sky-100 text-sky-800", label: "ดี" },
  ok: { tone: "amber", bg: "bg-amber-100 text-amber-800", label: "พอใช้" },
  bad: { tone: "red", bg: "bg-red-100 text-red-800", label: "ต้องปรับ" },
};

/** Lower is better (Food/Labor/Prime/Fixed %) */
export function kpiStatusLowerBetter(
  pct: number | null,
  thresholds: { goodPlus: number; good: number; ok: number }
): KpiStatus {
  if (pct == null) return "bad";
  if (pct <= thresholds.goodPlus) return "good_plus";
  if (pct <= thresholds.good) return "good";
  if (pct <= thresholds.ok) return "ok";
  return "bad";
}

/** Higher is better (Margin %) */
export function kpiStatusHigherBetter(
  pct: number | null,
  thresholds: { goodPlus: number; good: number; ok: number }
): KpiStatus {
  if (pct == null) return "bad";
  if (pct >= thresholds.goodPlus) return "good_plus";
  if (pct >= thresholds.good) return "good";
  if (pct >= thresholds.ok) return "ok";
  return "bad";
}

// Restaurant industry standard thresholds (matches Excel manual)
export const KPI_THRESHOLDS = {
  food: { goodPlus: 0.28, good: 0.32, ok: 0.35 },
  labor: { goodPlus: 0.25, good: 0.3, ok: 0.35 },
  prime: { goodPlus: 0.55, good: 0.6, ok: 0.65 },
  fixed: { goodPlus: 0.12, good: 0.15, ok: 0.2 },
  margin: { goodPlus: 0.15, good: 0.1, ok: 0.05 },
};

// ─────────────── Data Quality (POS days per month) ───────────────

export async function getDataQuality(
  yearBE: number,
  businessId: number
): Promise<{
  perMonth: {
    fiscalMonthId: number;
    label: string;
    daysWithSales: number;
    daysInMonth: number;
  }[];
  totalDaysWithSales: number;
}> {
  const year = await prisma.fiscalYear.findUnique({
    where: { yearBE },
    include: { months: { orderBy: { monthIndex: "asc" } } },
  });
  if (!year) return { perMonth: [], totalDaysWithSales: 0 };

  const yearStart = `${year.months[0].calendarYear}-${String(year.months[0].calendarMonth).padStart(2, "0")}-01`;
  const lastMonth = year.months[11];
  const yearEnd = `${lastMonth.calendarYear}-${String(lastMonth.calendarMonth).padStart(2, "0")}-${String(lastMonth.daysInMonth).padStart(2, "0")}`;

  const distinctDates = await prisma.posBill.findMany({
    where: { businessId, businessDate: { gte: yearStart, lte: yearEnd } },
    distinct: ["businessDate"],
    select: { businessDate: true },
  });

  const daysByMonth = new Map<number, number>();
  for (const m of year.months) daysByMonth.set(m.id, 0);
  for (const d of distinctDates) {
    const [yStr, mStr] = d.businessDate.split("-");
    const month = year.months.find(
      (m) => m.calendarYear === Number(yStr) && m.calendarMonth === Number(mStr)
    );
    if (month) daysByMonth.set(month.id, (daysByMonth.get(month.id) ?? 0) + 1);
  }

  const perMonth = year.months.map((m) => ({
    fiscalMonthId: m.id,
    label: m.label,
    daysWithSales: daysByMonth.get(m.id) ?? 0,
    daysInMonth: m.daysInMonth,
  }));

  return {
    perMonth,
    totalDaysWithSales: perMonth.reduce((s, m) => s + m.daysWithSales, 0),
  };
}
