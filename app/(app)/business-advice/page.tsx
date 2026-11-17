import { redirect, notFound } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { getYearlyPL } from "@/lib/pl-calc";
import { getManualCostData } from "@/lib/manual-cost-data";
import { COST_GROUPS } from "@/lib/cost-plan";
import { monthTiming, type AdviceCost } from "@/lib/business-advice";
import { getUi } from "@/lib/i18n/server";
import { displayMonth } from "@/lib/i18n/core";
import { PageHeader } from "@/components/page-header";
import { MonthPicker } from "../cost-setup/_components/month-picker";
import { AdvicePlanner } from "./_components/advice-planner";

export default async function BusinessAdvice({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!["OWNER", "ACCOUNTANT"].includes(session.user.role)) redirect("/");
  const { ui, uiLocale } = await getUi();
  const business = await getCurrentBusiness();
  if (!business) return null;
  const months = await prisma.fiscalMonth.findMany({
    orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    include: { year: true },
  });
  const sp = await searchParams;
  const today = monthTiming(2000, 1, 31).today;
  const month = sp.month
    ? months.find((m) => String(m.id) === sp.month)
    : (months.find(
        (m) =>
          `${m.calendarYear}-${String(m.calendarMonth).padStart(2, "0")}` ===
          today.slice(0, 7)
      ) ?? months[0]);
  if (!month) notFound();
  const selected = months.find((m) => m.id === month.id)!;
  const timing = monthTiming(
    selected.calendarYear,
    selected.calendarMonth,
    selected.daysInMonth
  );
  const start = `${selected.calendarYear}-${String(selected.calendarMonth).padStart(2, "0")}-01`;
  const end =
    timing.phase === "current"
      ? timing.today
      : `${start.slice(0, 7)}-${selected.daysInMonth}`;
  const [manual, year, bills] = await Promise.all([
    getManualCostData(business.id, selected.id),
    getYearlyPL(selected.year.yearBE, business.id),
    prisma.posBill.groupBy({
      by: ["businessDate"],
      where: {
        businessId: business.id,
        businessDate: { gte: start, lte: end },
      },
      _sum: { netAmount: true },
      _count: { id: true },
    }),
  ]);
  const costs: AdviceCost[] = COST_GROUPS.map((group) => ({
    key: group.id,
    name: group.label,
    amount: manual.items
      .filter((r) => r.group === group.id)
      .reduce((sum, r) => sum + r.amount, 0),
    variable: group.section === "cogs" || group.id === "selling",
  }));
  costs.find((c) => c.key === "labor")!.amount +=
    manual.laborBase + manual.legacyLaborExtra;
  const revenue = bills.reduce((sum, b) => sum + (b._sum.netAmount ?? 0), 0);
  const billCount = bills.reduce((sum, b) => sum + b._count.id, 0);
  const yearRows =
    year?.months.map((m) => {
      const cal = months.find((f) => f.id === m.fiscalMonthId)!;
      return {
        id: m.fiscalMonthId,
        label: displayMonth(cal.fullLabel, uiLocale),
        revenue: m.netRevenue,
        cost: m.totalCost,
        profit: m.netProfit,
        bills: m.posBillCount,
        elapsed:
          `${cal.calendarYear}-${String(cal.calendarMonth).padStart(2, "0")}` <=
          timing.today.slice(0, 7),
      };
    }) ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        icon={Lightbulb}
        title={ui("แนะนำธุรกิจ")}
        description={ui("จากตัวเลขของร้าน สู่เป้าหมายที่ลงมือทำได้")}
        action={
          <MonthPicker
            months={months.map((m) => ({
              id: m.id,
              label: displayMonth(m.fullLabel, uiLocale),
            }))}
            currentId={selected.id}
          />
        }
      />
      <AdvicePlanner
        key={`${business.id}:${selected.id}`}
        monthId={selected.id}
        monthLabel={displayMonth(selected.fullLabel, uiLocale)}
        yearLabel={
          uiLocale === "th"
            ? String(selected.year.yearBE)
            : String(selected.year.yearBE - 543)
        }
        revenue={revenue}
        billCount={billCount}
        salesDays={bills.length}
        costs={costs}
        daysInMonth={selected.daysInMonth}
        timing={timing}
        yearRows={yearRows}
      />
    </div>
  );
}
