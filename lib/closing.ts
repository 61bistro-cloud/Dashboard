import { prisma } from "@/lib/prisma";
import { getYearlyPL, getDataQuality, type MonthlyTotals } from "@/lib/pl-calc";
import { getReconciliation, type ReconRow } from "@/lib/bank-calc";

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
        : "ยังไม่มีรายได้ (POS หรือ Override)",
  });

  // 3) COGS
  checks.push({
    key: "cogs",
    label: "กรอกต้นทุนวัตถุดิบ (COGS)",
    status: live.cogs > 0 ? "pass" : "warn",
    detail: live.cogs > 0 ? "กรอกแล้ว" : "ยังไม่ได้กรอกใน Cost Setup",
  });

  // 4) Labor
  checks.push({
    key: "labor",
    label: "กรอกค่าแรงพนักงาน (Labor)",
    status: live.labor > 0 ? "pass" : "warn",
    detail: live.labor > 0 ? "กรอกแล้ว" : "ยังไม่ได้กรอกใน Cost Setup",
  });

  // 5) Fixed
  checks.push({
    key: "fixed",
    label: "กรอกค่าใช้จ่ายประจำ (Fixed)",
    status: live.fixed > 0 ? "pass" : "warn",
    detail: live.fixed > 0 ? "กรอกแล้ว" : "ยังไม่ได้กรอกใน Cost Setup",
  });

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
