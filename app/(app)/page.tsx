import { displayMonth } from "@/lib/i18n/core";

import { useUi } from "@/lib/i18n/use-ui";
import { getUi } from "@/lib/i18n/server";
import { CostSourceNotice } from "@/components/cost-source-notice";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Banknote,
  TrendingUp,
  Percent,
  ChefHat,
  Users,
  Home,
  Zap,
  CalendarRange,
  CalendarCheck,
  Calendar as CalendarIcon,
  AlertTriangle,
  ChartBar,
  Receipt,
  Check,
  Circle,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth } from "@/lib/fiscal-server";
import { fmtTHB } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import {
  getYearlyPL,
  getDataQuality,
  kpiStatusLowerBetter,
  kpiStatusHigherBetter,
  KPI_THRESHOLDS,
  KPI_STATUS_STYLE,
  type MonthlyTotals,
  type KpiStatus,
} from "@/lib/pl-calc";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { StatusDot } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";

export default async function DashboardPage() {
  const { ui, uiLocale } = await getUi();
  const session = await auth();
  if (!session) redirect("/sign-in");

  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={LayoutDashboard} title={ui("Dashboard")} />
        <p className="mt-4 text-red-600">
          {ui(
            "คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้านเพื่อขอสิทธิ์"
          )}
        </p>
      </div>
    );
  }

  const latestYear = await prisma.fiscalYear.findFirst({
    orderBy: { yearBE: "desc" },
  });

  if (!latestYear) {
    return (
      <div className="p-8">
        <PageHeader icon={LayoutDashboard} title={ui("Dashboard")} />
        <p className="mt-4 text-red-600">{ui("ยังไม่มีข้อมูลปีงบในระบบ")}</p>
      </div>
    );
  }

  const [data, dq, currentMonth] = await Promise.all([
    getYearlyPL(latestYear.yearBE, business.id),
    getDataQuality(latestYear.yearBE, business.id),
    getCurrentFiscalMonth(),
  ]);

  if (!data) {
    return (
      <div className="p-8">
        <PageHeader icon={LayoutDashboard} title={ui("Dashboard")} />
        <p className="mt-4 text-red-600">{ui("ไม่สามารถคำนวณ P&L ได้")}</p>
      </div>
    );
  }

  const { months, total } = data;
  const mtd = currentMonth
    ? (months.find((m) => m.fiscalMonthId === currentMonth.id) ?? null)
    : null;
  const dqByMonth = new Map(dq.perMonth.map((d) => [d.fiscalMonthId, d]));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title={ui("Dashboard")}
        description={ui("{v0} — ปีงบ {v1}", {
          v0: business.name,
          v1: displayMonth(latestYear.label, uiLocale),
        })}
      />

      <CostSourceNotice
        source={total.costSource}
        pending={total.pendingStatementCost}
        revenue={total.netRevenue}
        costTotal={total.totalCost}
      />

      <SectionTitle
        icon={ChartBar}
        title={ui("ภาพรวมทั้งปี")}
        description={ui("Year-to-Date")}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigCard
          icon={Wallet}
          label={ui("รายได้รวมทั้งปี")}
          value={fmtTHB(total.netRevenue)}
          sub={ui("YTD")}
          tone="mint"
        />
        <BigCard
          icon={Banknote}
          label={ui("รายจ่ายรวมทั้งปี")}
          value={fmtTHB(total.totalCost)}
          sub={ui("YTD")}
          tone="cream"
        />
        <BigCard
          icon={TrendingUp}
          label={ui("กำไรสุทธิทั้งปี")}
          value={fmtTHB(total.netProfit)}
          sub={ui("YTD")}
          tone={total.netProfit >= 0 ? "lime" : "coral"}
        />
        <BigCard
          icon={Percent}
          label={ui("Net Margin %")}
          value={
            total.marginPct == null
              ? "-"
              : `${(total.marginPct * 100).toFixed(1)}%`
          }
          sub={ui("YTD • เป้า ≥ 10%")}
          tone={
            total.marginPct != null && total.marginPct >= 0.05
              ? "lilac"
              : "coral"
          }
        />
      </div>

      <SectionTitle
        icon={ChefHat}
        title={ui("โครงสร้างต้นทุน YTD")}
        description={ui("เทียบกับเกณฑ์มาตรฐานร้านอาหาร")}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={ChefHat}
          label={ui("ต้นทุนขาย % (สะสมทั้งปี)")}
          pct={total.foodPct}
          status={kpiStatusLowerBetter(total.foodPct, KPI_THRESHOLDS.food)}
          bench="≤ 32%"
        />
        <KpiCard
          icon={Users}
          label={ui("Labor % (YTD)")}
          pct={total.laborPct}
          status={kpiStatusLowerBetter(total.laborPct, KPI_THRESHOLDS.labor)}
          bench={ui("เป้าหมายค่าแรง 15–25%")}
        />
        <KpiCard
          icon={Home}
          label={ui("Fixed % (YTD)")}
          pct={total.fixedPct}
          status={kpiStatusLowerBetter(total.fixedPct, KPI_THRESHOLDS.fixed)}
          bench="≤ 15%"
        />
        <KpiCard
          icon={Zap}
          label={ui("Prime % (YTD)")}
          pct={total.primePct}
          status={kpiStatusLowerBetter(total.primePct, KPI_THRESHOLDS.prime)}
          bench="≤ 60%"
        />
      </div>

      <SectionTitle
        icon={CalendarRange}
        title={ui("เดือนปัจจุบัน")}
        description={ui("Month-To-Date")}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigCard
          icon={CalendarIcon}
          label={ui("เดือนนี้")}
          value={mtd ? displayMonth(mtd.label, uiLocale) : "-"}
          sub={ui("ตามวันที่ปัจจุบัน")}
          tone="neutral"
        />
        <BigCard
          icon={Wallet}
          label={ui("รายได้เดือนนี้")}
          value={mtd ? fmtTHB(mtd.netRevenue) : "-"}
          sub={mtd ? ui("{v0} บิล", { v0: mtd.posBillCount }) : ""}
          tone="mint"
        />
        <BigCard
          icon={TrendingUp}
          label={ui("กำไรเดือนนี้")}
          value={mtd ? fmtTHB(mtd.netProfit) : "-"}
          sub={ui("Revenue − Cost")}
          tone={mtd ? (mtd.netProfit >= 0 ? "lime" : "coral") : "neutral"}
        />
        <BigCard
          icon={Percent}
          label={ui("Margin เดือนนี้")}
          value={
            mtd?.marginPct == null
              ? "-"
              : `${(mtd.marginPct * 100).toFixed(1)}%`
          }
          sub={ui("Real-time")}
          tone={
            mtd?.marginPct != null
              ? mtd.marginPct >= 0.05
                ? "lilac"
                : "coral"
              : "neutral"
          }
        />
      </div>

      <SectionTitle
        icon={ChartBar}
        title={ui("% ต้นทุน-กำไร รายเดือน")}
        description={ui("Real-time")}
      />
      <MonthlyStatusTable months={months} total={total} />

      <SectionTitle
        icon={AlertTriangle}
        title={ui("Data Quality")}
        description={ui("สถานะการกรอกข้อมูล POS")}
      />
      <DataQualityTable
        months={months}
        dqByMonth={dqByMonth}
        total={dq.totalDaysWithSales}
      />

      <SectionTitle
        icon={Receipt}
        title={ui("สรุปรายเดือน")}
        description={ui("P&L absolute amounts")}
      />
      <MonthlyPLSummary months={months} total={total} dqByMonth={dqByMonth} />

      <SectionTitle icon={ChartBar} title={ui("Revenue vs Profit รายเดือน")} />
      <RevenueProfitChart months={months} />
    </div>
  );
}

// ─────────────────────────── components ───────────────────────────

type Tone = "mint" | "coral" | "lilac" | "lime" | "cream" | "pink" | "neutral";

function toneClasses(tone: Tone): string {
  switch (tone) {
    case "mint":
      return "bg-mint";
    case "coral":
      return "bg-coral";
    case "lilac":
      return "bg-lilac";
    case "lime":
      return "bg-lime";
    case "cream":
      return "bg-cream";
    case "pink":
      return "bg-pink";
    default:
      return "bg-surface";
  }
}

function BigCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
  highlight,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  highlight?: "good" | "bad";
}) {
  const actualTone: Tone = highlight === "bad" ? "coral" : tone;
  // Pastel cards always use dark text (pastels are intentionally light, even in dark mode)
  const onPastel = actualTone !== "neutral";
  const txtMain = onPastel ? "text-black" : "text-ink";
  const txtIcon = onPastel ? "text-black/70" : "text-muted";
  const txtLabel = onPastel ? "text-black/65" : "text-muted";
  const txtSub = onPastel ? "text-black/60" : "text-muted";
  return (
    <div className={`rounded-card p-5 ${toneClasses(actualTone)} ${txtMain}`}>
      <Icon className={`h-5 w-5 ${txtIcon}`} strokeWidth={1.6} />
      <div
        className={`mt-3 text-[11px] uppercase tracking-[0.06em] font-medium ${txtLabel}`}
      >
        {label}
      </div>
      <div className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight leading-none">
        {value}
      </div>
      {sub && <div className={`mt-2 text-xs ${txtSub}`}>{sub}</div>}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  pct,
  status,
  bench,
}: {
  icon: LucideIcon;
  label: string;
  pct: number | null;
  status: KpiStatus;
  bench: string;
}) {
  const { ui } = useUi();
  const style = KPI_STATUS_STYLE[status];
  return (
    <div className="rounded-card border border-hairline bg-canvas p-5">
      <div className="flex items-start justify-between">
        <Icon className="h-5 w-5 text-muted" strokeWidth={1.6} />
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-[11px] font-medium">
          <StatusDot tone={style.tone} />
          {ui(style.label)}
        </span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-[0.06em] text-muted font-medium">
        {label}
      </div>
      <div className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight leading-none">
        {pct == null ? "-" : `${(pct * 100).toFixed(1)}%`}
      </div>
      <div className="mt-2 text-xs text-muted">
        {ui("เกณฑ์")} {bench}
      </div>
    </div>
  );
}

function MonthlyStatusTable({
  months,
  total,
}: {
  months: MonthlyTotals[];
  total: MonthlyTotals;
}) {
  const { ui, uiLocale } = useUi();
  const cell = (
    m: MonthlyTotals,
    valFn: (m: MonthlyTotals) => number | null,
    statusFn: (m: MonthlyTotals) => KpiStatus
  ) => {
    const v = valFn(m);
    const style = KPI_STATUS_STYLE[statusFn(m)];
    return (
      <td className="px-2 py-1.5 text-center text-xs">
        {m.netRevenue === 0 ? (
          <span className="text-muted-soft">-</span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 ${style.bg}`}
          >
            <StatusDot tone={style.tone} size="sm" />
            {v == null ? "-" : `${(v * 100).toFixed(1)}%`}
          </span>
        )}
      </td>
    );
  };

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface text-center">
            <tr>
              <th className="px-3 py-2 font-medium text-left">{ui("เดือน")}</th>
              <th className="px-3 py-2 font-medium text-right">
                {ui("รายได้")}
              </th>
              <th className="px-2 py-2 font-medium">{ui("ต้นทุนขาย %")}</th>
              <th className="px-2 py-2 font-medium">{ui("Labor %")}</th>
              <th className="px-2 py-2 font-medium">{ui("Fixed %")}</th>
              <th className="px-2 py-2 font-medium">{ui("Prime %")}</th>
              <th className="px-2 py-2 font-medium">{ui("Margin %")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {months.map((m) => (
              <tr key={m.fiscalMonthId} className="hover:bg-surface">
                <td className="px-3 py-1.5 font-medium">
                  {displayMonth(m.label, uiLocale)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {m.netRevenue > 0 ? fmtTHB(m.netRevenue) : "-"}
                </td>
                {cell(
                  m,
                  (x) => x.foodPct,
                  (x) => kpiStatusLowerBetter(x.foodPct, KPI_THRESHOLDS.food)
                )}
                {cell(
                  m,
                  (x) => x.laborPct,
                  (x) => kpiStatusLowerBetter(x.laborPct, KPI_THRESHOLDS.labor)
                )}
                {cell(
                  m,
                  (x) => x.fixedPct,
                  (x) => kpiStatusLowerBetter(x.fixedPct, KPI_THRESHOLDS.fixed)
                )}
                {cell(
                  m,
                  (x) => x.primePct,
                  (x) => kpiStatusLowerBetter(x.primePct, KPI_THRESHOLDS.prime)
                )}
                {cell(
                  m,
                  (x) => x.marginPct,
                  (x) =>
                    kpiStatusHigherBetter(x.marginPct, KPI_THRESHOLDS.margin)
                )}
              </tr>
            ))}
            <tr className="bg-surface font-semibold">
              <td className="px-3 py-2">{ui("รวมทั้งปี")}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtTHB(total.netRevenue)}
              </td>
              {cell(
                total,
                (x) => x.foodPct,
                (x) => kpiStatusLowerBetter(x.foodPct, KPI_THRESHOLDS.food)
              )}
              {cell(
                total,
                (x) => x.laborPct,
                (x) => kpiStatusLowerBetter(x.laborPct, KPI_THRESHOLDS.labor)
              )}
              {cell(
                total,
                (x) => x.fixedPct,
                (x) => kpiStatusLowerBetter(x.fixedPct, KPI_THRESHOLDS.fixed)
              )}
              {cell(
                total,
                (x) => x.primePct,
                (x) => kpiStatusLowerBetter(x.primePct, KPI_THRESHOLDS.prime)
              )}
              {cell(
                total,
                (x) => x.marginPct,
                (x) => kpiStatusHigherBetter(x.marginPct, KPI_THRESHOLDS.margin)
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-xs text-muted border-t border-hairline-soft flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="emerald" /> {ui("ดีมาก")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="sky" /> {ui("ดี")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="amber" /> {ui("พอใช้")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="red" /> {ui("ต้องปรับ")}
        </span>
        <span className="text-muted-soft">|</span>
        <span>
          {ui(
            "COGS 28/32/35% • Labor 15/20/25% • Prime 55/60/65% • Margin ≥15/10/5%"
          )}
        </span>
      </div>
    </section>
  );
}

function DataQualityTable({
  months,
  dqByMonth,
  total,
}: {
  months: MonthlyTotals[];
  dqByMonth: Map<number, { daysWithSales: number; daysInMonth: number }>;
  total: number;
}) {
  const { ui, uiLocale } = useUi();
  const statusFor = (
    ratio: number
  ): { tone: "emerald" | "amber" | "red" | "slate"; icon: typeof Check } => {
    if (ratio >= 0.9) return { tone: "emerald", icon: Check };
    if (ratio >= 0.5) return { tone: "amber", icon: Circle };
    if (ratio > 0) return { tone: "red", icon: Circle };
    return { tone: "slate", icon: Circle };
  };

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-center">
          <thead className="bg-surface">
            <tr>
              <th className="px-3 py-2 font-medium text-left">{ui("เดือน")}</th>
              {months.map((m) => (
                <th key={m.fiscalMonthId} className="px-2 py-2 font-medium">
                  {displayMonth(m.label, uiLocale)}
                </th>
              ))}
              <th className="px-3 py-2 font-medium bg-surface">{ui("รวม")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            <tr>
              <td className="px-3 py-1.5 text-left">{ui("วันมี POS")}</td>
              {months.map((m) => {
                const d = dqByMonth.get(m.fiscalMonthId);
                return (
                  <td
                    key={m.fiscalMonthId}
                    className="px-2 py-1.5 tabular-nums"
                  >
                    {d && d.daysWithSales > 0 ? d.daysWithSales : "-"}
                  </td>
                );
              })}
              <td className="px-3 py-1.5 font-semibold bg-surface tabular-nums">
                {total}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-left">{ui("สถานะ")}</td>
              {months.map((m) => {
                const d = dqByMonth.get(m.fiscalMonthId);
                const ratio = d ? d.daysWithSales / d.daysInMonth : 0;
                const { tone, icon: Icon } = statusFor(ratio);
                return (
                  <td key={m.fiscalMonthId} className="px-2 py-1.5">
                    <Icon
                      className={
                        "inline-block h-3.5 w-3.5 " +
                        (tone === "emerald"
                          ? "text-emerald-600"
                          : tone === "amber"
                            ? "text-amber-500"
                            : tone === "red"
                              ? "text-red-500"
                              : "text-muted-soft")
                      }
                      strokeWidth={2.5}
                      fill={
                        tone === "slate" || tone === "red" ? "none" : "none"
                      }
                    />
                  </td>
                );
              })}
              <td className="px-3 py-1.5 bg-surface"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-xs text-muted border-t border-hairline-soft flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
          {ui("ครบ (≥90%)")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Circle className="h-3 w-3 text-amber-500" strokeWidth={2} />
          {ui("พอใช้ (≥50%)")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Circle className="h-3 w-3 text-red-500" strokeWidth={2} />
          {ui("น้อย")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Circle className="h-3 w-3 text-muted-soft" strokeWidth={2} />
          {ui("ยังไม่กรอก")}
        </span>
      </div>
    </section>
  );
}

function MonthlyPLSummary({
  months,
  total,
  dqByMonth,
}: {
  months: MonthlyTotals[];
  total: MonthlyTotals;
  dqByMonth: Map<number, { daysWithSales: number }>;
}) {
  const { ui, uiLocale } = useUi();
  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface text-right">
            <tr>
              <th className="px-3 py-2 font-medium text-left">{ui("เดือน")}</th>
              <th className="px-2 py-2 font-medium">{ui("วันขาย")}</th>
              <th className="px-2 py-2 font-medium">{ui("บิล")}</th>
              <th className="px-2 py-2 font-medium">{ui("รายได้")}</th>
              <th className="px-2 py-2 font-medium">{ui("COGS")}</th>
              <th className="px-2 py-2 font-medium">{ui("Labor")}</th>
              <th className="px-2 py-2 font-medium">{ui("Fixed")}</th>
              <th className="px-2 py-2 font-medium">{ui("รวมต้นทุน")}</th>
              <th className="px-2 py-2 font-medium">{ui("กำไรสุทธิ")}</th>
              <th className="px-2 py-2 font-medium">{ui("Margin %")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {months.map((m) => (
              <tr key={m.fiscalMonthId} className="hover:bg-surface">
                <td className="px-3 py-1.5 font-medium">
                  {displayMonth(m.label, uiLocale)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {dqByMonth.get(m.fiscalMonthId)?.daysWithSales || "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {m.posBillCount || "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {m.netRevenue > 0 ? fmtTHB(m.netRevenue) : "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {m.cogs > 0 ? fmtTHB(m.cogs) : "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {m.labor > 0 ? fmtTHB(m.labor) : "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {m.fixed > 0 ? fmtTHB(m.fixed) : "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {m.totalCost > 0 ? fmtTHB(m.totalCost) : "-"}
                </td>
                <td
                  className={
                    "px-2 py-1.5 text-right tabular-nums font-medium " +
                    (m.netProfit > 0
                      ? "text-emerald-700"
                      : m.totalCost > 0 || m.netRevenue > 0
                        ? "text-red-700"
                        : "text-muted-soft")
                  }
                >
                  {m.totalCost > 0 || m.netRevenue > 0
                    ? fmtTHB(m.netProfit)
                    : "-"}
                </td>
                <td
                  className={
                    "px-2 py-1.5 text-right tabular-nums " +
                    (m.marginPct == null
                      ? "text-muted-soft"
                      : m.marginPct >= 0
                        ? "text-emerald-700"
                        : "text-red-700")
                  }
                >
                  {m.marginPct == null
                    ? "-"
                    : `${(m.marginPct * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
            <tr className="bg-surface font-semibold">
              <td className="px-3 py-2">{ui("รวมทั้งปี")}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {[...dqByMonth.values()].reduce(
                  (s, x) => s + x.daysWithSales,
                  0
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {total.posBillCount}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmtTHB(total.netRevenue)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmtTHB(total.cogs)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmtTHB(total.labor)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmtTHB(total.fixed)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmtTHB(total.totalCost)}
              </td>
              <td
                className={
                  "px-2 py-2 text-right tabular-nums " +
                  (total.netProfit >= 0 ? "text-emerald-700" : "text-red-700")
                }
              >
                {fmtTHB(total.netProfit)}
              </td>
              <td
                className={
                  "px-2 py-2 text-right tabular-nums " +
                  (total.marginPct == null
                    ? ""
                    : total.marginPct >= 0
                      ? "text-emerald-700"
                      : "text-red-700")
                }
              >
                {total.marginPct == null
                  ? "-"
                  : `${(total.marginPct * 100).toFixed(1)}%`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RevenueProfitChart({ months }: { months: MonthlyTotals[] }) {
  const { ui, uiLocale } = useUi();
  const maxVal = Math.max(
    ...months.flatMap((m) => [
      Math.abs(m.netRevenue),
      Math.abs(m.totalCost),
      Math.abs(m.netProfit),
    ]),
    1
  );

  return (
    <section className="rounded-card border border-hairline bg-canvas p-5">
      <div className="flex items-center gap-4 text-xs mb-4 flex-wrap">
        <Legend color="bg-emerald-500" label={ui("รายได้")} />
        <Legend color="bg-red-400" label={ui("รายจ่าย")} />
        <Legend color="bg-sky-500" label={ui("กำไรสุทธิ")} />
      </div>
      <div className="grid grid-cols-12 gap-2">
        {months.map((m) => {
          const hasData = m.netRevenue > 0 || m.totalCost > 0;
          return (
            <div
              key={m.fiscalMonthId}
              className="flex flex-col items-center gap-1"
            >
              <div className="relative w-full h-32 flex items-end gap-0.5">
                <Bar
                  v={m.netRevenue}
                  max={maxVal}
                  color="bg-emerald-500"
                  title={ui("รายได้ {v0}", { v0: fmtTHB(m.netRevenue) })}
                />
                <Bar
                  v={m.totalCost}
                  max={maxVal}
                  color="bg-red-400"
                  title={ui("รายจ่าย {v0}", { v0: fmtTHB(m.totalCost) })}
                />
                <Bar
                  v={Math.max(m.netProfit, 0)}
                  max={maxVal}
                  color="bg-sky-500"
                  title={ui("กำไร {v0}", { v0: fmtTHB(m.netProfit) })}
                  negative={m.netProfit < 0 ? Math.abs(m.netProfit) : 0}
                />
              </div>
              <div className="text-[10px] text-muted">
                {displayMonth(m.label, uiLocale)}
              </div>
              {hasData && (
                <div
                  className={
                    "text-[10px] tabular-nums " +
                    (m.netProfit >= 0 ? "text-emerald-700" : "text-red-700")
                  }
                >
                  {m.netProfit >= 1000
                    ? `${(m.netProfit / 1000).toFixed(0)}K`
                    : m.netProfit <= -1000
                      ? `${(m.netProfit / 1000).toFixed(0)}K`
                      : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Bar({
  v,
  max,
  color,
  title,
  negative,
}: {
  v: number;
  max: number;
  color: string;
  title: string;
  negative?: number;
}) {
  const h = (Math.abs(v) / max) * 100;
  const nh = negative ? (negative / max) * 100 : 0;
  if (negative) {
    return (
      <div className="flex-1 flex flex-col items-stretch" title={title}>
        <div
          className="bg-red-300"
          style={{ height: `${nh}%` }}
          aria-label={title}
        />
      </div>
    );
  }
  return (
    <div
      className={`flex-1 ${color}`}
      style={{ height: `${h}%` }}
      title={title}
      aria-label={title}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-sm ${color}`} />
      <span className="text-ink/75">{label}</span>
    </div>
  );
}
