import { displayMonth } from "@/lib/i18n/core";

import { useUi } from "@/lib/i18n/use-ui";
import { getUi } from "@/lib/i18n/server";
import { CostSourceNotice } from "@/components/cost-source-notice";
import { redirect } from "next/navigation";
import { TrendingUp, ChefHat, Users, Zap, Home, Percent } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fmtTHB } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import {
  getYearlyPL,
  type MonthlyTotals,
  kpiStatusLowerBetter,
  kpiStatusHigherBetter,
  KPI_THRESHOLDS,
  KPI_STATUS_STYLE,
} from "@/lib/pl-calc";
import { PageHeader } from "@/components/page-header";
import { StatusDot } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";

type SearchParams = Promise<{ year?: string }>;

export default async function MonthlyPLPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { ui, uiLocale } = await getUi();
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    redirect("/");
  }

  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={TrendingUp} title={ui("Monthly P&L")} />
        <p className="mt-4 text-red-600">
          {ui("คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน")}
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const years = await prisma.fiscalYear.findMany({
    orderBy: { yearBE: "desc" },
  });
  if (years.length === 0) {
    return (
      <div className="p-8">
        <PageHeader icon={TrendingUp} title={ui("Monthly P&L")} />
        <p className="mt-4 text-red-600">{ui("ไม่พบข้อมูลปีงบ")}</p>
      </div>
    );
  }

  const requestedYearBE = sp.year ? Number(sp.year) : null;
  const currentYear =
    (requestedYearBE
      ? years.find((y) => y.yearBE === requestedYearBE)
      : null) ?? years[0];

  const data = await getYearlyPL(currentYear.yearBE, business.id);
  if (!data) {
    return (
      <div className="p-8">
        <PageHeader icon={TrendingUp} title={ui("Monthly P&L")} />
        <p className="mt-4 text-red-600">{ui("ไม่สามารถคำนวณข้อมูลได้")}</p>
      </div>
    );
  }

  const { months, total } = data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        icon={TrendingUp}
        title={ui("Monthly P&L")}
        description={ui(
          "งบกำไรขาดทุน — Revenue, COGS, Labor, Fixed, Net Profit, KPI ratios"
        )}
        action={
          years.length > 1 ? (
            <form>
              <select
                name="year"
                defaultValue={currentYear.yearBE}
                className="rounded-input border border-hairline bg-canvas px-3 py-2 text-sm"
              >
                {years.map((y) => (
                  <option key={y.yearBE} value={y.yearBE}>
                    {displayMonth(y.label, uiLocale)}
                  </option>
                ))}
              </select>
            </form>
          ) : undefined
        }
      />

      <CostSourceNotice
        source={data.total.costSource}
        pending={data.total.pendingStatementCost}
        revenue={data.total.netRevenue}
        costTotal={data.total.totalCost}
      />

      {/* KPI cards */}
      <KpiPanel total={total} />

      {/* Main P&L matrix */}
      <PLMatrix months={months} total={total} />
    </div>
  );
}

function KpiPanel({ total }: { total: MonthlyTotals }) {
  const { ui } = useUi();
  const kpis: Array<{
    icon: LucideIcon;
    label: string;
    pct: number | null;
    status: ReturnType<typeof kpiStatusLowerBetter>;
    bench: string;
  }> = [
    {
      icon: ChefHat,
      label: ui("ต้นทุนขาย %"),
      pct: total.foodPct,
      status: kpiStatusLowerBetter(total.foodPct, KPI_THRESHOLDS.food),
      bench: ui("เป้า ≤ 32%"),
    },
    {
      icon: Users,
      label: ui("Labor %"),
      pct: total.laborPct,
      status: kpiStatusLowerBetter(total.laborPct, KPI_THRESHOLDS.labor),
      bench: ui("เป้าหมายค่าแรง 15–25%"),
    },
    {
      icon: Zap,
      label: ui("Prime % (Food+Labor)"),
      pct: total.primePct,
      status: kpiStatusLowerBetter(total.primePct, KPI_THRESHOLDS.prime),
      bench: ui("เป้า ≤ 60%"),
    },
    {
      icon: Home,
      label: ui("Fixed %"),
      pct: total.fixedPct,
      status: kpiStatusLowerBetter(total.fixedPct, KPI_THRESHOLDS.fixed),
      bench: ui("เป้า ≤ 15%"),
    },
    {
      icon: Percent,
      label: ui("Net Margin %"),
      pct: total.marginPct,
      status: kpiStatusHigherBetter(total.marginPct, KPI_THRESHOLDS.margin),
      bench: ui("เป้า ≥ 10%"),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map((k) => {
        const style = KPI_STATUS_STYLE[k.status];
        const Icon = k.icon;
        return (
          <div
            key={ui(k.label)}
            className="rounded-card border border-hairline bg-canvas p-4"
          >
            <div className="flex items-start justify-between">
              <Icon className="h-5 w-5 text-muted-soft" strokeWidth={1.75} />
              <span
                className={`inline-flex items-center gap-1.5 text-xs rounded-pill px-2 py-0.5 ${style.bg}`}
              >
                <StatusDot tone={style.tone} />
                {ui(style.label)}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted">{ui(k.label)}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">
              {k.pct == null ? "-" : `${(k.pct * 100).toFixed(1)}%`}
            </div>
            <div className="mt-0.5 text-xs text-muted">{k.bench}</div>
          </div>
        );
      })}
    </div>
  );
}

function PLMatrix({
  months,
  total,
}: {
  months: MonthlyTotals[];
  total: MonthlyTotals;
}) {
  const { ui, uiLocale } = useUi();
  // Rows in order matching Excel Monthly P&L
  type Row = {
    label: string;
    indent?: number;
    bold?: boolean;
    section?: boolean;
    cls?: string;
    values: (m: MonthlyTotals) => { num: number | null; pct?: number | null };
    pctOfRevenue?: boolean;
  };

  const rows: Row[] = [
    {
      label: ui("รายได้ (Revenue)"),
      section: true,
      values: () => ({ num: null }),
    },
    {
      label: ui("ยอดขายสุทธิ (Net Sales)"),
      indent: 1,
      bold: true,
      values: (m) => ({ num: m.netRevenue }),
      pctOfRevenue: true,
    },
    {
      label: ui("ต้นทุนวัตถุดิบ (COGS)"),
      section: true,
      values: () => ({ num: null }),
    },
    {
      label: ui("ต้นทุนขายรวม 5 หมวด"),
      indent: 1,
      values: (m) => ({ num: m.cogs, pct: m.foodPct }),
    },
    {
      label: ui("กำไรขั้นต้น = รายได้ − ต้นทุนขาย"),
      indent: 0,
      bold: true,
      cls: "bg-surface",
      values: (m) => ({
        num: m.netRevenue - m.cogs,
        pct: m.netRevenue === 0 ? null : (m.netRevenue - m.cogs) / m.netRevenue,
      }),
    },
    {
      label: ui("Operating Expenses"),
      section: true,
      values: () => ({ num: null }),
    },
    {
      label: ui("ค่าแรงพนักงาน (Labor)"),
      indent: 1,
      values: (m) => ({ num: m.labor, pct: m.laborPct }),
    },
    {
      label: ui("ค่าใช้จ่ายดำเนินงานอื่น (ไม่รวมค่าแรง)"),
      indent: 1,
      values: (m) => ({ num: m.fixed, pct: m.fixedPct }),
    },
    {
      label: ui("รวมรายจ่ายทั้งหมด"),
      indent: 0,
      bold: true,
      cls: "bg-surface",
      values: (m) => ({
        num: m.totalCost,
        pct: m.netRevenue === 0 ? null : m.totalCost / m.netRevenue,
      }),
    },
    {
      label: ui("กำไรสุทธิ (Net Profit)"),
      indent: 0,
      bold: true,
      cls: "bg-surface",
      values: (m) => ({ num: m.netProfit, pct: m.marginPct }),
    },
    {
      label: ui("Net Profit Margin %"),
      indent: 0,
      values: (m) => ({ num: null, pct: m.marginPct }),
    },
  ];

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="text-sm font-semibold">{ui("งบกำไรขาดทุนรายเดือน")}</h2>
        <p className="text-xs text-muted mt-0.5">
          {ui("เปรียบเทียบ 12 เดือน • รวมทั้งปี • % รายรับ")}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface text-right">
            <tr>
              <th className="px-3 py-2 font-medium text-left sticky left-0 z-20 bg-surface min-w-[260px]">
                {ui("รายการ")}
              </th>
              {months.map((m) => (
                <th
                  key={m.fiscalMonthId}
                  className="px-2 py-2 font-medium whitespace-nowrap min-w-[80px]"
                >
                  {displayMonth(m.label, uiLocale)}
                </th>
              ))}
              <th className="px-3 py-2 font-semibold bg-surface min-w-[100px]">
                {ui("รวมทั้งปี")}
              </th>
              <th className="px-3 py-2 font-semibold bg-surface min-w-[80px]">
                %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            <tr className="text-muted">
              <td className="px-3 py-2 sticky left-0 z-10 bg-canvas">
                {ui("แหล่งต้นทุน")}
              </td>
              {months.map((m) => (
                <td
                  key={m.fiscalMonthId}
                  className="px-2 py-2 text-right text-[10px]"
                >
                  {m.costSource === "statement" ? "Statement" : ui("กรอกเอง")}
                </td>
              ))}
              <td colSpan={2} />
            </tr>

            {rows.map((r, idx) => {
              if (r.section) {
                return (
                  <tr key={idx} className="bg-surface/60">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-xs font-semibold text-ink/90">
                      {r.label}
                    </td>
                    <td colSpan={months.length + 2} aria-hidden="true" />
                  </tr>
                );
              }
              const totalVals = r.values(total);
              const indentCls = r.indent ? `pl-${r.indent * 4}` : "";
              return (
                <tr key={idx} className={r.cls ?? "group hover:bg-surface"}>
                  <td
                    className={
                      "px-3 py-1.5 sticky left-0 z-10 " +
                      (r.cls
                        ? "bg-surface "
                        : "bg-canvas group-hover:bg-surface ") +
                      (r.bold ? "font-semibold " : "") +
                      indentCls
                    }
                  >
                    {r.label}
                  </td>
                  {months.map((m) => {
                    const v = r.values(m);
                    return (
                      <td
                        key={m.fiscalMonthId}
                        className={
                          "px-2 py-1.5 text-right tabular-nums " +
                          numClass(v.num)
                        }
                      >
                        {v.num != null
                          ? fmtTHB(v.num)
                          : v.pct != null
                            ? `${(v.pct * 100).toFixed(1)}%`
                            : "-"}
                      </td>
                    );
                  })}
                  <td
                    className={
                      "px-3 py-1.5 text-right tabular-nums font-semibold bg-surface/50 " +
                      numClass(totalVals.num)
                    }
                  >
                    {totalVals.num != null
                      ? fmtTHB(totalVals.num)
                      : totalVals.pct != null
                        ? `${(totalVals.pct * 100).toFixed(1)}%`
                        : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink/75 bg-surface/50">
                    {r.pctOfRevenue
                      ? "100.0%"
                      : totalVals.pct != null
                        ? `${(totalVals.pct * 100).toFixed(1)}%`
                        : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function numClass(n: number | null | undefined): string {
  if (n == null || n === 0) return "";
  return n < 0 ? "text-red-700" : "";
}
