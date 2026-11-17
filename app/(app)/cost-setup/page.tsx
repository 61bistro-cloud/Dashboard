import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { getCurrentFiscalMonth } from "@/lib/fiscal-server";
import { getUi } from "@/lib/i18n/server";
import { displayMonth } from "@/lib/i18n/core";
import { getManualCostData } from "@/lib/manual-cost-data";
import { getDetailedStatementExpenses } from "@/lib/statement-cost-details";
import { PageHeader } from "@/components/page-header";
import { MonthPicker } from "./_components/month-picker";
import { PayrollSection } from "./_components/payroll-section";
import { CostPlanner } from "./_components/cost-planner";
import { StatementExpensesPanel } from "./_components/statement-expenses-panel";

type SearchParams = Promise<{ month?: string }>;
export default async function CostSetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { ui, uiLocale } = await getUi();
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!["OWNER", "ACCOUNTANT"].includes(session.user.role)) redirect("/");
  const business = await getCurrentBusiness();
  if (!business)
    return (
      <div className="p-8">
        <PageHeader icon={Settings} title={ui("Cost Setup")} />
        <p>{ui("คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน")}</p>
      </div>
    );
  const params = await searchParams;
  const months = await prisma.fiscalMonth.findMany({
    orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    include: { year: true },
  });
  const month =
    months.find((m) => m.id === Number(params.month)) ??
    (await getCurrentFiscalMonth()) ??
    months[0];
  if (!month)
    return (
      <div className="p-8">
        <PageHeader icon={Settings} title={ui("Cost Setup")} />
        <p>{ui("ไม่พบข้อมูลปีงบ")}</p>
      </div>
    );
  const start = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-01`;
  const end = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-${String(month.daysInMonth).padStart(2, "0")}`;
  const [manual, bank, pos] = await Promise.all([
    getManualCostData(business.id, month.id),
    getDetailedStatementExpenses(month.id, business.id),
    prisma.posBill.groupBy({
      by: ["channel", "paymentType"],
      where: {
        businessId: business.id,
        businessDate: { gte: start, lte: end },
      },
      _sum: { netAmount: true },
      _count: { id: true },
    }),
  ]);
  const payroll = new Map(manual.payroll.map((p) => [p.employeeId, p]));
  const manualTotal =
    manual.items.reduce((n, r) => n + r.amount, 0) +
    manual.laborBase +
    manual.legacyLaborExtra;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        icon={Settings}
        title={ui("Cost Setup")}
        description={ui(
          "รายได้จากยอดขายหน้าร้าน และต้นทุนที่เจ้าของกรอกเอง • ใช้คำนวณภาพรวมและกำไรขาดทุนทุกเดือน"
        )}
        action={
          <MonthPicker
            months={months.map((m) => ({
              id: m.id,
              label: displayMonth(`${m.label} ${m.year.yearBE}`, uiLocale),
            }))}
            currentId={month.id}
          />
        }
      />
      <div className="rounded-input border border-hairline bg-canvas p-4 text-sm">
        <span className="text-muted">{ui("เดือนที่กำลังดู:")}</span>{" "}
        <strong>{displayMonth(month.fullLabel, uiLocale)}</strong>{" "}
        <span className="text-muted">
          {ui("• จำนวนวัน")} {month.daysInMonth} {ui("วัน")}
        </span>
      </div>
      <CostPlanner
        key={`${business.id}:${month.id}`}
        businessId={business.id}
        monthId={month.id}
        items={manual.items}
        revision={manual.revision}
        laborBase={manual.laborBase}
        laborExtra={manual.legacyLaborExtra}
        revenue={pos.map((row) => ({
          channel: row.channel || ui("ไม่ระบุ"),
          payment: row.paymentType || ui("ไม่ระบุ"),
          count: row._count.id,
          amount: row._sum.netAmount ?? 0,
        }))}
        payrollEditor={
          <PayrollSection
            businessId={business.id}
            revision={manual.payrollRevision}
            fiscalMonthId={month.id}
            employees={manual.employees
              .filter((e) => e.active || (payroll.get(e.id)?.amount ?? 0) !== 0)
              .map((e) => ({
                id: e.id,
                name: e.name,
                shortName: e.shortName,
                amount: payroll.get(e.id)?.amount ?? 0,
                nameOverride: payroll.get(e.id)?.nameOverride ?? null,
              }))}
            extras={manual.payrollExtras}
          />
        }
      />
      <StatementExpensesPanel
        summary={bank.summary}
        details={bank.details}
        manualTotal={manualTotal}
        monthId={month.id}
      />
    </div>
  );
}
