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
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    redirect("/");
  }

  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={TrendingUp} title="Monthly P&L" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน
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
        <PageHeader icon={TrendingUp} title="Monthly P&L" />
        <p className="mt-4 text-red-600">ไม่พบข้อมูลปีงบ</p>
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
        <PageHeader icon={TrendingUp} title="Monthly P&L" />
        <p className="mt-4 text-red-600">ไม่สามารถคำนวณข้อมูลได้</p>
      </div>
    );
  }

  const { months, total } = data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        icon={TrendingUp}
        title="Monthly P&L"
        description="งบกำไรขาดทุน — Revenue, COGS, Labor, Fixed, Net Profit, KPI ratios"
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
                    {y.label}
                  </option>
                ))}
              </select>
            </form>
          ) : undefined
        }
      />

      {/* KPI cards */}
      <KpiPanel total={total} />

      {/* Main P&L matrix */}
      <PLMatrix months={months} total={total} />
    </div>
  );
}

function KpiPanel({ total }: { total: MonthlyTotals }) {
  const kpis: Array<{
    icon: LucideIcon;
    label: string;
    pct: number | null;
    status: ReturnType<typeof kpiStatusLowerBetter>;
    bench: string;
  }> = [
    {
      icon: ChefHat,
      label: "Food Cost %",
      pct: total.foodPct,
      status: kpiStatusLowerBetter(total.foodPct, KPI_THRESHOLDS.food),
      bench: "เป้า ≤ 32%",
    },
    {
      icon: Users,
      label: "Labor %",
      pct: total.laborPct,
      status: kpiStatusLowerBetter(total.laborPct, KPI_THRESHOLDS.labor),
      bench: "เป้า ≤ 30%",
    },
    {
      icon: Zap,
      label: "Prime % (Food+Labor)",
      pct: total.primePct,
      status: kpiStatusLowerBetter(total.primePct, KPI_THRESHOLDS.prime),
      bench: "เป้า ≤ 60%",
    },
    {
      icon: Home,
      label: "Fixed %",
      pct: total.fixedPct,
      status: kpiStatusLowerBetter(total.fixedPct, KPI_THRESHOLDS.fixed),
      bench: "เป้า ≤ 15%",
    },
    {
      icon: Percent,
      label: "Net Margin %",
      pct: total.marginPct,
      status: kpiStatusHigherBetter(total.marginPct, KPI_THRESHOLDS.margin),
      bench: "เป้า ≥ 10%",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map((k) => {
        const style = KPI_STATUS_STYLE[k.status];
        const Icon = k.icon;
        return (
          <div
            key={k.label}
            className="rounded-card border border-hairline bg-canvas p-4"
          >
            <div className="flex items-start justify-between">
              <Icon className="h-5 w-5 text-muted-soft" strokeWidth={1.75} />
              <span
                className={`inline-flex items-center gap-1.5 text-xs rounded-pill px-2 py-0.5 ${style.bg}`}
              >
                <StatusDot tone={style.tone} />
                {style.label}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted">{k.label}</div>
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
    { label: "รายได้ (Revenue)", section: true, values: () => ({ num: null }) },
    {
      label: "ยอดขายสุทธิ (Net Sales)",
      indent: 1,
      bold: true,
      values: (m) => ({ num: m.netRevenue }),
      pctOfRevenue: true,
    },
    {
      label: "ต้นทุนวัตถุดิบ (COGS)",
      section: true,
      values: () => ({ num: null }),
    },
    {
      label: "Food + Bev + Pack",
      indent: 1,
      values: (m) => ({ num: m.cogs, pct: m.foodPct }),
    },
    {
      label: "ค่าแรงพนักงาน (Labor)",
      indent: 1,
      values: (m) => ({ num: m.labor, pct: m.laborPct }),
    },
    {
      label: "กำไรขั้นต้น (Gross Profit) = Revenue − COGS − Labor",
      indent: 0,
      bold: true,
      cls: "bg-surface",
      values: (m) => ({
        num: m.netRevenue - m.cogs - m.labor,
        pct:
          m.netRevenue === 0
            ? null
            : (m.netRevenue - m.cogs - m.labor) / m.netRevenue,
      }),
    },
    {
      label: "Operating Expenses",
      section: true,
      values: () => ({ num: null }),
    },
    {
      label: "Fixed Cost (เช่า/ไฟ/Sub/Platform/อื่นๆ)",
      indent: 1,
      values: (m) => ({ num: m.fixed, pct: m.fixedPct }),
    },
    {
      label: "รวมรายจ่ายทั้งหมด",
      indent: 0,
      bold: true,
      cls: "bg-surface",
      values: (m) => ({
        num: m.totalCost,
        pct: m.netRevenue === 0 ? null : m.totalCost / m.netRevenue,
      }),
    },
    {
      label: "กำไรสุทธิ (Net Profit)",
      indent: 0,
      bold: true,
      cls: "bg-surface",
      values: (m) => ({ num: m.netProfit, pct: m.marginPct }),
    },
    {
      label: "Net Profit Margin %",
      indent: 0,
      values: (m) => ({ num: null, pct: m.marginPct }),
    },
  ];

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="text-sm font-semibold">งบกำไรขาดทุนรายเดือน</h2>
        <p className="text-xs text-muted mt-0.5">
          เปรียบเทียบ 12 เดือน • รวมทั้งปี • % รายรับ
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface text-right">
            <tr>
              <th className="px-3 py-2 font-medium text-left sticky left-0 bg-surface min-w-[260px]">
                รายการ
              </th>
              {months.map((m) => (
                <th
                  key={m.fiscalMonthId}
                  className="px-2 py-2 font-medium whitespace-nowrap min-w-[80px]"
                >
                  {m.label}
                </th>
              ))}
              <th className="px-3 py-2 font-semibold bg-surface min-w-[100px]">
                รวมทั้งปี
              </th>
              <th className="px-3 py-2 font-semibold bg-surface min-w-[80px]">
                %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {rows.map((r, idx) => {
              if (r.section) {
                return (
                  <tr key={idx} className="bg-surface/60">
                    <td
                      colSpan={months.length + 3}
                      className="px-3 py-1.5 text-xs font-semibold text-ink/90"
                    >
                      {r.label}
                    </td>
                  </tr>
                );
              }
              const totalVals = r.values(total);
              const indentCls = r.indent ? `pl-${r.indent * 4}` : "";
              return (
                <tr key={idx} className={r.cls ?? "hover:bg-surface"}>
                  <td
                    className={
                      "px-3 py-1.5 sticky left-0 bg-inherit " +
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
