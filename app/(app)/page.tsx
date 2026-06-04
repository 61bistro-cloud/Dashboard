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
import { getCurrentFiscalMonth, fmtTHB } from "@/lib/fiscal";
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
  const session = await auth();
  if (!session) redirect("/sign-in");

  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={LayoutDashboard} title="Dashboard" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้านเพื่อขอสิทธิ์
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
        <PageHeader icon={LayoutDashboard} title="Dashboard" />
        <p className="mt-4 text-red-600">ยังไม่มีข้อมูลปีงบในระบบ</p>
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
        <PageHeader icon={LayoutDashboard} title="Dashboard" />
        <p className="mt-4 text-red-600">ไม่สามารถคำนวณ P&L ได้</p>
      </div>
    );
  }

  const { months, total } = data;
  const mtd = currentMonth
    ? (months.find((m) => m.fiscalMonthId === currentMonth.id) ?? null)
    : null;
  const dqByMonth = new Map(dq.perMonth.map((d) => [d.fiscalMonthId, d]));

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description={`${business.name} — ปีงบ ${latestYear.label}`}
      />

      <SectionTitle
        icon={ChartBar}
        title="ภาพรวมทั้งปี"
        description="Year-to-Date"
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigCard
          icon={Wallet}
          label="รายได้รวมทั้งปี"
          value={fmtTHB(total.netRevenue)}
          sub="YTD"
          tone="mint"
        />
        <BigCard
          icon={Banknote}
          label="รายจ่ายรวมทั้งปี"
          value={fmtTHB(total.totalCost)}
          sub="YTD"
          tone="cream"
        />
        <BigCard
          icon={TrendingUp}
          label="กำไรสุทธิทั้งปี"
          value={fmtTHB(total.netProfit)}
          sub="YTD"
          tone={total.netProfit >= 0 ? "lime" : "coral"}
        />
        <BigCard
          icon={Percent}
          label="Net Margin %"
          value={
            total.marginPct == null
              ? "-"
              : `${(total.marginPct * 100).toFixed(1)}%`
          }
          sub="YTD • เป้า ≥ 10%"
          tone={
            total.marginPct != null && total.marginPct >= 0.05
              ? "lilac"
              : "coral"
          }
        />
      </div>

      <SectionTitle
        icon={ChefHat}
        title="โครงสร้างต้นทุน YTD"
        description="เทียบกับเกณฑ์มาตรฐานร้านอาหาร"
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={ChefHat}
          label="Food % (YTD)"
          pct={total.foodPct}
          status={kpiStatusLowerBetter(total.foodPct, KPI_THRESHOLDS.food)}
          bench="≤ 32%"
        />
        <KpiCard
          icon={Users}
          label="Labor % (YTD)"
          pct={total.laborPct}
          status={kpiStatusLowerBetter(total.laborPct, KPI_THRESHOLDS.labor)}
          bench="≤ 30%"
        />
        <KpiCard
          icon={Home}
          label="Fixed % (YTD)"
          pct={total.fixedPct}
          status={kpiStatusLowerBetter(total.fixedPct, KPI_THRESHOLDS.fixed)}
          bench="≤ 15%"
        />
        <KpiCard
          icon={Zap}
          label="Prime % (YTD)"
          pct={total.primePct}
          status={kpiStatusLowerBetter(total.primePct, KPI_THRESHOLDS.prime)}
          bench="≤ 60%"
        />
      </div>

      <SectionTitle
        icon={CalendarRange}
        title="เดือนปัจจุบัน"
        description="Month-To-Date"
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigCard
          icon={CalendarIcon}
          label="เดือนนี้"
          value={mtd ? mtd.label : "-"}
          sub="ตามวันที่ปัจจุบัน"
          tone="neutral"
        />
        <BigCard
          icon={Wallet}
          label="รายได้เดือนนี้"
          value={mtd ? fmtTHB(mtd.netRevenue) : "-"}
          sub={mtd ? `${mtd.posBillCount} บิล` : ""}
          tone="mint"
        />
        <BigCard
          icon={TrendingUp}
          label="กำไรเดือนนี้"
          value={mtd ? fmtTHB(mtd.netProfit) : "-"}
          sub="Revenue − Cost"
          tone={mtd ? (mtd.netProfit >= 0 ? "lime" : "coral") : "neutral"}
        />
        <BigCard
          icon={Percent}
          label="Margin เดือนนี้"
          value={
            mtd?.marginPct == null
              ? "-"
              : `${(mtd.marginPct * 100).toFixed(1)}%`
          }
          sub="Real-time"
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
        title="% ต้นทุน-กำไร รายเดือน"
        description="Real-time"
      />
      <MonthlyStatusTable months={months} total={total} />

      <SectionTitle
        icon={AlertTriangle}
        title="Data Quality"
        description="สถานะการกรอกข้อมูล POS"
      />
      <DataQualityTable
        months={months}
        dqByMonth={dqByMonth}
        total={dq.totalDaysWithSales}
      />

      <SectionTitle
        icon={Receipt}
        title="สรุปรายเดือน"
        description="P&L absolute amounts"
      />
      <MonthlyPLSummary months={months} total={total} dqByMonth={dqByMonth} />

      <SectionTitle icon={ChartBar} title="Revenue vs Profit รายเดือน" />
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
  const style = KPI_STATUS_STYLE[status];
  return (
    <div className="rounded-card border border-hairline bg-canvas p-5">
      <div className="flex items-start justify-between">
        <Icon className="h-5 w-5 text-muted" strokeWidth={1.6} />
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-[11px] font-medium">
          <StatusDot tone={style.tone} />
          {style.label}
        </span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-[0.06em] text-muted font-medium">
        {label}
      </div>
      <div className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight leading-none">
        {pct == null ? "-" : `${(pct * 100).toFixed(1)}%`}
      </div>
      <div className="mt-2 text-xs text-muted">เกณฑ์ {bench}</div>
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
              <th className="px-3 py-2 font-medium text-left">เดือน</th>
              <th className="px-3 py-2 font-medium text-right">รายได้</th>
              <th className="px-2 py-2 font-medium">Food %</th>
              <th className="px-2 py-2 font-medium">Labor %</th>
              <th className="px-2 py-2 font-medium">Fixed %</th>
              <th className="px-2 py-2 font-medium">Prime %</th>
              <th className="px-2 py-2 font-medium">Margin %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {months.map((m) => (
              <tr key={m.fiscalMonthId} className="hover:bg-surface">
                <td className="px-3 py-1.5 font-medium">{m.label}</td>
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
              <td className="px-3 py-2">รวมทั้งปี</td>
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
          <StatusDot tone="emerald" /> ดีมาก
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="sky" /> ดี
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="amber" /> พอใช้
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="red" /> ต้องปรับ
        </span>
        <span className="text-muted-soft">|</span>
        <span>
          Food 28/32/35% • Labor 25/30/35% • Prime 55/60/65% • Margin ≥15/10/5%
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
              <th className="px-3 py-2 font-medium text-left">เดือน</th>
              {months.map((m) => (
                <th key={m.fiscalMonthId} className="px-2 py-2 font-medium">
                  {m.label}
                </th>
              ))}
              <th className="px-3 py-2 font-medium bg-surface">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            <tr>
              <td className="px-3 py-1.5 text-left">วันมี POS</td>
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
              <td className="px-3 py-1.5 text-left">สถานะ</td>
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
          <Check className="h-3 w-3 text-emerald-600" strokeWidth={2.5} /> ครบ
          (≥90%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Circle className="h-3 w-3 text-amber-500" strokeWidth={2} /> พอใช้
          (≥50%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Circle className="h-3 w-3 text-red-500" strokeWidth={2} /> น้อย
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Circle className="h-3 w-3 text-muted-soft" strokeWidth={2} />{" "}
          ยังไม่กรอก
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
  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface text-right">
            <tr>
              <th className="px-3 py-2 font-medium text-left">เดือน</th>
              <th className="px-2 py-2 font-medium">วันขาย</th>
              <th className="px-2 py-2 font-medium">บิล</th>
              <th className="px-2 py-2 font-medium">รายได้</th>
              <th className="px-2 py-2 font-medium">COGS</th>
              <th className="px-2 py-2 font-medium">Labor</th>
              <th className="px-2 py-2 font-medium">Fixed</th>
              <th className="px-2 py-2 font-medium">รวมต้นทุน</th>
              <th className="px-2 py-2 font-medium">กำไรสุทธิ</th>
              <th className="px-2 py-2 font-medium">Margin %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {months.map((m) => (
              <tr key={m.fiscalMonthId} className="hover:bg-surface">
                <td className="px-3 py-1.5 font-medium">{m.label}</td>
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
              <td className="px-3 py-2">รวมทั้งปี</td>
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
        <Legend color="bg-emerald-500" label="รายได้" />
        <Legend color="bg-red-400" label="รายจ่าย" />
        <Legend color="bg-sky-500" label="กำไรสุทธิ" />
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
                  title={`รายได้ ${fmtTHB(m.netRevenue)}`}
                />
                <Bar
                  v={m.totalCost}
                  max={maxVal}
                  color="bg-red-400"
                  title={`รายจ่าย ${fmtTHB(m.totalCost)}`}
                />
                <Bar
                  v={Math.max(m.netProfit, 0)}
                  max={maxVal}
                  color="bg-sky-500"
                  title={`กำไร ${fmtTHB(m.netProfit)}`}
                  negative={m.netProfit < 0 ? Math.abs(m.netProfit) : 0}
                />
              </div>
              <div className="text-[10px] text-muted">{m.label}</div>
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
