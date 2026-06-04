import { redirect } from "next/navigation";
import {
  Calendar,
  Wallet,
  Banknote,
  TrendingUp,
  CalendarCheck,
  ChefHat,
  Users,
  Home,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth, fmtTHB } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import { getDailyPL } from "@/lib/pl-calc";
import { MonthPicker } from "../cost-setup/_components/month-picker";
import { PageHeader } from "@/components/page-header";
import type { LucideIcon } from "lucide-react";

type SearchParams = Promise<{ month?: string }>;

export default async function DailyPLPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");

  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={Calendar} title="Daily P&L" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const requested = sp.month ? Number(sp.month) : null;

  const allMonths = await prisma.fiscalMonth.findMany({
    orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    include: { year: true },
  });

  const currentMonth =
    (requested ? allMonths.find((m) => m.id === requested) : null) ??
    (await getCurrentFiscalMonth()) ??
    allMonths[0];

  if (!currentMonth) {
    return (
      <div className="p-8">
        <PageHeader icon={Calendar} title="Daily P&L" />
        <p className="mt-4 text-red-600">ไม่พบข้อมูลปีงบในระบบ</p>
      </div>
    );
  }

  const data = await getDailyPL(currentMonth.id, business.id);
  if (!data) {
    return (
      <div className="p-8">
        <PageHeader icon={Calendar} title="Daily P&L" />
        <p className="mt-4 text-red-600">ไม่สามารถคำนวณข้อมูลได้</p>
      </div>
    );
  }

  const { month, totals, days } = data;
  const profitDays = days.filter((d) => d.profit > 0).length;
  const lossDays = days.filter((d) => d.netSales > 0 && d.profit <= 0).length;
  const noSalesDays = days.filter((d) => d.netSales === 0).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={Calendar}
        title="Daily P&L"
        description={`กำไร/ขาดทุนรายวัน — Net Sales ดึงจาก POS, ต้นทุนกระจายจาก Cost Setup หาร ${month.daysInMonth} วัน`}
        action={
          <MonthPicker
            months={allMonths.map((m) => ({
              id: m.id,
              label: `${m.label} ${m.year.yearBE}`,
            }))}
            currentId={currentMonth.id}
          />
        }
      />

      {/* Month summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={Wallet}
          label="รายได้สุทธิ"
          value={fmtTHB(totals.netRevenue)}
          sub={`${totals.posBillCount.toLocaleString("th-TH")} บิล`}
          tone="mint"
        />
        <SummaryCard
          icon={Banknote}
          label="รวมต้นทุน"
          value={fmtTHB(totals.totalCost)}
          sub="COGS + Labor + Fixed"
          tone="cream"
        />
        <SummaryCard
          icon={TrendingUp}
          label="กำไรสุทธิ"
          value={fmtTHB(totals.netProfit)}
          sub={
            totals.marginPct == null
              ? "-"
              : `${(totals.marginPct * 100).toFixed(1)}% margin`
          }
          tone={totals.netProfit >= 0 ? "lime" : "coral"}
        />
        <SummaryCard
          icon={CalendarCheck}
          label="วันที่ขาย"
          value={`${profitDays + lossDays} / ${month.daysInMonth}`}
          sub={`กำไร ${profitDays} • ขาดทุน ${lossDays} • ไม่ขาย ${noSalesDays}`}
          tone="lilac"
        />
      </div>

      {/* Daily table */}
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3">
          <h2 className="text-sm font-semibold">รายวัน — {month.fullLabel}</h2>
          <p className="text-xs text-muted mt-0.5">
            ต้นทุนต่อวัน: COGS {fmtTHB(totals.cogs / month.daysInMonth)} • Labor{" "}
            {fmtTHB(totals.labor / month.daysInMonth)} • Fixed{" "}
            {fmtTHB(totals.fixed / month.daysInMonth)}
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left">
              <tr>
                <Th>วันที่</Th>
                <Th>วัน</Th>
                <Th align="right">บิล</Th>
                <Th align="right">Gross</Th>
                <Th align="right">ส่วนลด</Th>
                <Th align="right">Net</Th>
                <Th align="right">VAT</Th>
                <Th align="right">COGS</Th>
                <Th align="right">Labor</Th>
                <Th align="right">Fixed</Th>
                <Th align="right">รวมต้นทุน</Th>
                <Th align="right">กำไร/ขาดทุน</Th>
                <Th align="right">Margin %</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {days.map((d) => {
                const isWeekend = d.weekday === "ส" || d.weekday === "อา";
                return (
                  <tr
                    key={d.date}
                    className={
                      "hover:bg-surface " + (isWeekend ? "bg-surface/30" : "")
                    }
                  >
                    <td className="px-3 py-1 whitespace-nowrap">{d.date}</td>
                    <td
                      className={
                        "px-3 py-1 " +
                        (isWeekend ? "text-rose-600 font-medium" : "")
                      }
                    >
                      {d.weekday}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {d.billCount || "-"}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {fmtTHB(d.grossSales)}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-red-600">
                      {d.discount > 0 ? fmtTHB(d.discount) : "-"}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums font-medium">
                      {fmtTHB(d.netSales)}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-muted">
                      {fmtTHB(d.vat)}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-muted">
                      {fmtTHB(d.foodAllocated)}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-muted">
                      {fmtTHB(d.laborAllocated)}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-muted">
                      {fmtTHB(d.fixedAllocated)}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {fmtTHB(d.totalCost)}
                    </td>
                    <td
                      className={
                        "px-3 py-1 text-right tabular-nums font-medium " +
                        (d.profit > 0
                          ? "text-emerald-700"
                          : d.netSales > 0
                            ? "text-red-700"
                            : "text-muted-soft")
                      }
                    >
                      {fmtTHB(d.profit)}
                    </td>
                    <td
                      className={
                        "px-3 py-1 text-right tabular-nums " +
                        (d.marginPct == null
                          ? "text-muted-soft"
                          : d.marginPct >= 0
                            ? "text-emerald-700"
                            : "text-red-700")
                      }
                    >
                      {d.marginPct == null
                        ? "-"
                        : `${(d.marginPct * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface font-semibold">
              <tr>
                <td colSpan={2} className="px-3 py-2">
                  รวม
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totals.posBillCount.toLocaleString("th-TH")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtTHB(days.reduce((s, d) => s + d.grossSales, 0))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">
                  {fmtTHB(days.reduce((s, d) => s + d.discount, 0))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtTHB(totals.netRevenue)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtTHB(days.reduce((s, d) => s + d.vat, 0))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtTHB(totals.cogs)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtTHB(totals.labor)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtTHB(totals.fixed)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtTHB(totals.totalCost)}
                </td>
                <td
                  className={
                    "px-3 py-2 text-right tabular-nums " +
                    (totals.netProfit >= 0
                      ? "text-emerald-700"
                      : "text-red-700")
                  }
                >
                  {fmtTHB(totals.netProfit)}
                </td>
                <td
                  className={
                    "px-3 py-2 text-right tabular-nums " +
                    (totals.marginPct == null
                      ? ""
                      : totals.marginPct >= 0
                        ? "text-emerald-700"
                        : "text-red-700")
                  }
                >
                  {totals.marginPct == null
                    ? "-"
                    : `${(totals.marginPct * 100).toFixed(1)}%`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
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
  tone?: "mint" | "coral" | "lilac" | "lime" | "cream" | "neutral";
  highlight?: "good" | "bad";
}) {
  const finalTone = highlight === "bad" ? "coral" : tone;
  const bg = {
    mint: "bg-mint",
    coral: "bg-coral",
    lilac: "bg-lilac",
    lime: "bg-lime",
    cream: "bg-cream",
    neutral: "bg-surface",
  }[finalTone];
  // Pastel cards always use dark text (pastels stay light even in dark mode)
  const onPastel = finalTone !== "neutral";
  const txtMain = onPastel ? "text-black" : "text-ink";
  const txtIcon = onPastel ? "text-black/70" : "text-muted";
  const txtLabel = onPastel ? "text-black/65" : "text-muted";
  const txtSub = onPastel ? "text-black/60" : "text-muted";
  return (
    <div className={`rounded-card p-5 ${bg} ${txtMain}`}>
      <Icon className={`h-5 w-5 ${txtIcon}`} strokeWidth={1.6} />
      <div
        className={`mt-3 text-[11px] uppercase tracking-[0.06em] font-medium ${txtLabel}`}
      >
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight leading-none">
        {value}
      </div>
      {sub && <div className={`mt-2 text-xs ${txtSub}`}>{sub}</div>}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 font-medium ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}
