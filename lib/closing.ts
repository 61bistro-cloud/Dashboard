import {
  categoryBucket,
  supplierGroups,
  supplierGroup,
  groupBucket,
} from "@/lib/cost-plan";
import { prisma } from "@/lib/prisma";
import { getYearlyPL, getDataQuality, type MonthlyTotals } from "@/lib/pl-calc";
import { getReconciliation, type ReconRow } from "@/lib/bank-calc";
import { PAYROLL_EXTRA_LABELS } from "@/lib/fiscal";

export type BreakdownLine = { label: string; amount: number };
export type Breakdown = {
  revenue: BreakdownLine[]; // POS by payment type (+ override reconcile)
  cogsFood: BreakdownLine[];
  cogsBev: BreakdownLine[];
  cogsPack: BreakdownLine[];
  laborSalary: BreakdownLine[];
  laborExtra: BreakdownLine[];
  fixed: BreakdownLine[];
};

function emptyBreakdown(): Breakdown {
  return {
    revenue: [],
    cogsFood: [],
    cogsBev: [],
    cogsPack: [],
    laborSalary: [],
    laborExtra: [],
    fixed: [],
  };
}
function normalizeBreakdown(b: Partial<Breakdown>): Breakdown {
  return { ...emptyBreakdown(), ...b };
}

/** Per-line-item sources of each P&L figure, computed from the daily books. */
export async function computeBreakdown(
  businessId: number,
  fiscalMonthId: number
): Promise<Breakdown> {
  const month = await prisma.fiscalMonth.findUnique({
    where: { id: fiscalMonthId },
  });
  if (!month) return emptyBreakdown();
  const mm = String(month.calendarMonth).padStart(2, "0");
  const monthStart = `${month.calendarYear}-${mm}-01`;
  const monthEnd = `${month.calendarYear}-${mm}-${String(month.daysInMonth).padStart(2, "0")}`;

  const [posByPay, purchases, payrolls, extras, fixedCosts, costCategories] =
    await Promise.all([
      prisma.posBill.groupBy({
        by: ["paymentType"],
        where: {
          businessId,
          businessDate: { gte: monthStart, lte: monthEnd },
        },
        _sum: { netAmount: true },
      }),
      prisma.supplierPurchase.findMany({
        where: { businessId, fiscalMonthId, amount: { gt: 0 } },
        include: {
          supplier: { select: { id: true, name: true, category: true } },
        },
      }),
      prisma.employeePayroll.findMany({
        where: { businessId, fiscalMonthId, amount: { gt: 0 } },
        include: { employee: { select: { name: true } } },
      }),
      prisma.payrollExtra.findMany({
        where: { businessId, fiscalMonthId, amount: { gt: 0 } },
      }),
      prisma.fixedCost.findMany({
        where: { businessId, fiscalMonthId, amount: { gt: 0 } },
        include: { category: { select: { name: true, icon: true } } },
      }),
      prisma.fixedCostCategory.findMany({
        where: { businessId },
        select: { icon: true },
      }),
    ]);

  // Revenue is POS net sales only. Bank credits and legacy overrides are not sales.
  const revenue: BreakdownLine[] = posByPay
    .filter((r) => (r._sum.netAmount ?? 0) !== 0)
    .map((r) => ({
      label: r.paymentType || "อื่นๆ / ไม่ระบุ",
      amount: r._sum.netAmount ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  const cogsFood: BreakdownLine[] = [];
  const cogsBev: BreakdownLine[] = [];
  const cogsPack: BreakdownLine[] = [];
  const supplierLabor: BreakdownLine[] = [],
    supplierOpex: BreakdownLine[] = [];
  const overrides = supplierGroups(costCategories);
  for (const p of purchases) {
    const line = { label: p.nameOverride ?? p.supplier.name, amount: p.amount };
    const bucket = groupBucket(supplierGroup(p.supplier, overrides));
    if (bucket === "food") cogsFood.push(line);
    else if (bucket === "bev") cogsBev.push(line);
    else if (bucket === "pack") cogsPack.push(line);
    else if (bucket === "laborExtra") supplierLabor.push(line);
    else supplierOpex.push(line);
  }

  for (const cost of fixedCosts) {
    const bucket = categoryBucket(cost.category),
      line = { label: cost.category.name, amount: cost.amount };
    if (bucket === "food") cogsFood.push(line);
    else if (bucket === "bev") cogsBev.push(line);
    else if (bucket === "pack") cogsPack.push(line);
  }

  const laborSalary: BreakdownLine[] = payrolls.map((p) => ({
    label: p.nameOverride ?? p.employee.name,
    amount: p.amount,
  }));
  const laborExtra: BreakdownLine[] = [
    ...supplierLabor,
    ...extras.map((e) => ({
      label: PAYROLL_EXTRA_LABELS[e.type] ?? e.type,
      amount: e.amount,
    })),
    ...fixedCosts
      .filter((f) => categoryBucket(f.category) === "laborExtra")
      .map((f) => ({ label: f.category.name, amount: f.amount })),
  ];
  const fixed: BreakdownLine[] = [
    ...supplierOpex,
    ...fixedCosts
      .filter((f) => categoryBucket(f.category) === "fixed")
      .map((f) => ({ label: f.category.name, amount: f.amount })),
  ];

  return {
    revenue,
    cogsFood,
    cogsBev,
    cogsPack,
    laborSalary,
    laborExtra,
    fixed,
  };
}

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckItem = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

export type ClosingAdjustmentRow = {
  id: number;
  kind: "REVENUE" | "COST";
  label: string;
  amount: number;
};

export type ClosingRecord = {
  id: number;
  status: string;
  netRevenue: number;
  posBillCount: number;
  food: number;
  bev: number;
  pack: number;
  cogs: number;
  laborBase: number;
  laborExtra: number;
  labor: number;
  fixed: number;
  totalCost: number;
  netProfit: number;
  marginPct: number | null;
  note: string | null;
  closedAt: Date;
  closedByName: string | null;
  updatedAt: Date;
};

export type ClosingView = {
  month: {
    id: number;
    label: string;
    fullLabel: string;
    daysInMonth: number;
    yearBE: number;
  };
  live: MonthlyTotals;
  daysWithSales: number;
  recon: ReconRow[];
  checks: CheckItem[];
  closing: ClosingRecord | null;
  breakdown: Breakdown;
  adjustments: ClosingAdjustmentRow[];
  adjustRevenue: number;
  adjustCost: number;
  final: {
    netRevenue: number;
    totalCost: number;
    netProfit: number;
    marginPct: number | null;
  };
  drift: { label: string; snapshot: number; live: number; diff: number }[];
  logs: {
    id: number;
    action: string;
    detail: string | null;
    byName: string | null;
    createdAt: Date;
  }[];
};

function pct(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

/** Build the full closing view for one month: live P&L, checks, snapshot. */
export async function getClosingView(
  businessId: number,
  fiscalMonthId: number
): Promise<ClosingView | null> {
  const month = await prisma.fiscalMonth.findUnique({
    where: { id: fiscalMonthId },
    include: { year: true },
  });
  if (!month) return null;

  const [yearly, dq, recon, record] = await Promise.all([
    getYearlyPL(month.year.yearBE, businessId),
    getDataQuality(month.year.yearBE, businessId),
    getReconciliation(fiscalMonthId, businessId),
    prisma.monthlyClosing.findUnique({
      where: { businessId_fiscalMonthId: { businessId, fiscalMonthId } },
      include: {
        adjustments: { orderBy: { createdAt: "asc" } },
        closedBy: { select: { name: true, email: true } },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { closing: false },
        },
      },
    }),
  ]);

  if (!yearly) return null;
  const live = yearly.months.find((m) => m.fiscalMonthId === fiscalMonthId);
  if (!live) return null;

  const daysWithSales =
    dq.perMonth.find((m) => m.fiscalMonthId === fiscalMonthId)?.daysWithSales ??
    0;

  // Resolve user names for the logs in one pass
  const userIds = [
    ...new Set(
      (record?.logs ?? []).map((l) => l.byUserId).filter(Boolean) as string[]
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userName = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  const adjustments: ClosingAdjustmentRow[] = (record?.adjustments ?? []).map(
    (a) => ({
      id: a.id,
      kind: a.kind === "REVENUE" ? "REVENUE" : "COST",
      label: a.label,
      amount: a.amount,
    })
  );
  const adjustRevenue = adjustments
    .filter((a) => a.kind === "REVENUE")
    .reduce((s, a) => s + a.amount, 0);
  const adjustCost = adjustments
    .filter((a) => a.kind === "COST")
    .reduce((s, a) => s + a.amount, 0);

  const closing: ClosingRecord | null = record
    ? {
        id: record.id,
        status: record.status,
        netRevenue: record.netRevenue,
        posBillCount: record.posBillCount,
        food: record.food,
        bev: record.bev,
        pack: record.pack,
        cogs: record.cogs,
        laborBase: record.laborBase,
        laborExtra: record.laborExtra,
        labor: record.labor,
        fixed: record.fixed,
        totalCost: record.totalCost,
        netProfit: record.netProfit,
        marginPct: record.marginPct,
        note: record.note,
        closedAt: record.closedAt,
        closedByName: record.closedBy?.name ?? record.closedBy?.email ?? null,
        updatedAt: record.updatedAt,
      }
    : null;

  // Final figures = base (snapshot if closed, else live) + manual adjustments
  const baseRevenue = closing ? closing.netRevenue : live.netRevenue;
  const baseCost = closing ? closing.totalCost : live.totalCost;
  const finalRevenue = baseRevenue + adjustRevenue;
  const finalCost = baseCost + adjustCost;
  const finalProfit = finalRevenue - finalCost;
  const final = {
    netRevenue: finalRevenue,
    totalCost: finalCost,
    netProfit: finalProfit,
    marginPct: pct(finalProfit, finalRevenue),
  };

  // Drift: snapshot vs live (only meaningful once closed)
  const drift: ClosingView["drift"] = [];
  if (closing) {
    const cmp: [string, number, number][] = [
      ["รายได้", closing.netRevenue, live.netRevenue],
      ["ต้นทุนวัตถุดิบ (COGS)", closing.cogs, live.cogs],
      ["ค่าแรง (Labor)", closing.labor, live.labor],
      ["ค่าใช้จ่ายประจำ (Fixed)", closing.fixed, live.fixed],
    ];
    for (const [label, snap, liv] of cmp) {
      if (Math.abs(snap - liv) > 1) {
        drift.push({ label, snapshot: snap, live: liv, diff: liv - snap });
      }
    }
  }

  const checks = buildChecks(live, daysWithSales, recon, drift.length > 0);

  // Breakdown: use the frozen snapshot if the month is closed, else compute live
  let breakdown: Breakdown;
  if (record?.detailJson) {
    try {
      breakdown = normalizeBreakdown(JSON.parse(record.detailJson));
    } catch {
      breakdown = await computeBreakdown(businessId, fiscalMonthId);
    }
  } else {
    breakdown = await computeBreakdown(businessId, fiscalMonthId);
  }

  return {
    month: {
      id: month.id,
      label: month.label,
      fullLabel: month.fullLabel,
      daysInMonth: month.daysInMonth,
      yearBE: month.year.yearBE,
    },
    live,
    daysWithSales,
    recon,
    checks,
    closing,
    breakdown,
    adjustments,
    adjustRevenue,
    adjustCost,
    final,
    drift,
    logs: (record?.logs ?? []).map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      byName: l.byUserId ? (userName.get(l.byUserId) ?? null) : null,
      createdAt: l.createdAt,
    })),
  };
}

function buildChecks(
  live: MonthlyTotals,
  daysWithSales: number,
  recon: ReconRow[],
  hasDrift: boolean
): CheckItem[] {
  const checks: CheckItem[] = [];

  // 1) POS data completeness
  const ratio = live.daysInMonth ? daysWithSales / live.daysInMonth : 0;
  checks.push({
    key: "pos_days",
    label: "ความครบของข้อมูล POS",
    status: ratio >= 0.8 ? "pass" : ratio > 0 ? "warn" : "fail",
    detail: `มียอดขาย ${daysWithSales}/${live.daysInMonth} วัน`,
  });

  // 2) Revenue present
  checks.push({
    key: "revenue",
    label: "มีรายได้บันทึก",
    status: live.netRevenue > 0 ? "pass" : "fail",
    detail:
      live.netRevenue > 0
        ? `รายได้ ${live.netRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`
        : "ยังไม่มีข้อมูลยอดขายหน้าร้าน",
  });

  // 3) COGS
  checks.push({
    key: "cogs",
    label: "มีต้นทุนวัตถุดิบ (COGS)",
    status: live.cogs > 0 ? "pass" : "warn",
    detail: live.cogs > 0 ? "มีข้อมูลแล้ว" : "ยังไม่ได้กรอกต้นทุนในสรุปต้นทุน",
  });

  // 4) Labor
  checks.push({
    key: "labor",
    label: "มีค่าแรงพนักงาน (Labor)",
    status: live.labor > 0 ? "pass" : "warn",
    detail: live.labor > 0 ? "มีข้อมูลแล้ว" : "ยังไม่ได้กรอกต้นทุนในสรุปต้นทุน",
  });

  // 5) Fixed
  checks.push({
    key: "fixed",
    label: "มีค่าใช้จ่ายดำเนินงาน (Fixed)",
    status: live.fixed > 0 ? "pass" : "warn",
    detail: live.fixed > 0 ? "มีข้อมูลแล้ว" : "ยังไม่ได้กรอกต้นทุนในสรุปต้นทุน",
  });

  if (live.pendingStatementCost > 0) {
    checks.push({
      key: "statement_pending",
      label: "จัดหมวดรายจ่าย Statement ครบ",
      status: "warn",
      detail: `มีเงินออก ${live.pendingStatementCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาทรอตรวจสอบ ยังไม่รวมในต้นทุน`,
    });
  }

  // 6) Margin sanity
  const m = live.marginPct;
  checks.push({
    key: "margin",
    label: "อัตรากำไรสมเหตุสมผล",
    status: m == null ? "warn" : m < -0.5 || m > 0.6 ? "warn" : "pass",
    detail:
      m == null
        ? "คำนวณไม่ได้ (ไม่มีรายได้)"
        : `Net Margin ${(m * 100).toFixed(1)}%`,
  });

  // 7) POS vs Bank reconciliation
  const bigDiffs = recon.filter((r) => r.status === "diff").length;
  const anyBank = recon.some((r) => r.bankAmount > 0);
  checks.push({
    key: "recon",
    label: "กระทบยอด POS ↔ Bank",
    status: !anyBank ? "warn" : bigDiffs > 0 ? "warn" : "pass",
    detail: !anyBank
      ? "ยังไม่ได้ลง/จับคู่ statement ธนาคาร"
      : bigDiffs > 0
        ? `มีช่องทางที่ต่างมาก ${bigDiffs} รายการ`
        : "ยอดตรง/ใกล้เคียงทุกช่องทาง",
  });

  // 8) Snapshot drift (only when closed and changed)
  if (hasDrift) {
    checks.push({
      key: "drift",
      label: "ข้อมูลตรงกับตอนปิดงบ",
      status: "warn",
      detail: "ข้อมูลรายวันเปลี่ยนหลังปิดงบ — ควรกด Re-sync หรือตรวจสอบ",
    });
  }

  return checks;
}
