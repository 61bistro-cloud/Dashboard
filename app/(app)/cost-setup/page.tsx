import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth } from "@/lib/fiscal";
import { getStatementExpenses } from "@/lib/bank-calc";
import { MonthPicker } from "./_components/month-picker";
import { PayrollSection } from "./_components/payroll-section";
import { SupplierSection } from "./_components/supplier-section";
import { FixedCostSection } from "./_components/fixed-section";
import { RevenueOverrideSection } from "./_components/override-section";
import { StatementExpensesPanel } from "./_components/statement-expenses-panel";
import { PageHeader } from "@/components/page-header";

type SearchParams = Promise<{ month?: string }>;

export default async function CostSetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    redirect("/");
  }

  const sp = await searchParams;
  const requested = sp.month ? Number(sp.month) : null;

  // Load all months for the picker
  const allMonths = await prisma.fiscalMonth.findMany({
    orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    include: { year: true },
  });

  // Resolve current month: query param wins, else current calendar fiscal month, else first
  let currentMonth =
    (requested ? allMonths.find((m) => m.id === requested) : null) ??
    (await getCurrentFiscalMonth()) ??
    allMonths[0];

  if (!currentMonth) {
    return (
      <div className="p-8">
        <PageHeader icon={Settings} title="Cost Setup" />
        <p className="mt-4 text-red-600">
          ไม่พบข้อมูลปีงบในระบบ กรุณา seed ก่อน
        </p>
      </div>
    );
  }

  const [
    employees,
    payrollRows,
    extras,
    suppliers,
    purchases,
    fixedCats,
    fixedCosts,
    override,
  ] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.employeePayroll.findMany({
      where: { fiscalMonthId: currentMonth.id },
    }),
    prisma.payrollExtra.findMany({
      where: { fiscalMonthId: currentMonth.id },
    }),
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.supplierPurchase.findMany({
      where: { fiscalMonthId: currentMonth.id },
    }),
    prisma.fixedCostCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.fixedCost.findMany({
      where: { fiscalMonthId: currentMonth.id },
    }),
    prisma.monthlyRevenueOverride.findUnique({
      where: { fiscalMonthId: currentMonth.id },
    }),
  ]);

  const statementExpenses = await getStatementExpenses(currentMonth.id);

  const payrollByEmp = new Map(
    payrollRows.map((p) => [
      p.employeeId,
      { amount: p.amount, nameOverride: p.nameOverride },
    ])
  );
  const extraByType = new Map(extras.map((e) => [e.type, e.amount]));
  const purchaseBySupplier = new Map(
    purchases.map((p) => [
      p.supplierId,
      { amount: p.amount, nameOverride: p.nameOverride },
    ])
  );
  const fixedByCat = new Map(fixedCosts.map((f) => [f.categoryId, f.amount]));

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        icon={Settings}
        title="Cost Setup"
        description="ตั้งค่าต้นทุนรายเดือน — กรอกตัวเลขแล้วบันทึกได้เลย ระบบจะคำนวณ P&L อัตโนมัติ"
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

      <div className="rounded-input border border-hairline bg-canvas p-4">
        <div className="text-sm">
          <span className="text-muted">เดือนที่กำลังกรอก:</span>{" "}
          <span className="font-semibold">{currentMonth.fullLabel}</span>{" "}
          <span className="text-muted">
            • จำนวนวัน {currentMonth.daysInMonth} วัน
          </span>
        </div>
      </div>

      <PayrollSection
        fiscalMonthId={currentMonth.id}
        employees={employees.map((e) => {
          const row = payrollByEmp.get(e.id);
          return {
            id: e.id,
            name: e.name,
            shortName: e.shortName,
            amount: row?.amount ?? 0,
            nameOverride: row?.nameOverride ?? null,
          };
        })}
        extras={(["OT", "BONUS", "EXTRA", "SERVICE_CHARGE"] as const).map(
          (t) => ({ type: t, amount: extraByType.get(t) ?? 0 })
        )}
      />

      <SupplierSection
        fiscalMonthId={currentMonth.id}
        suppliers={suppliers.map((s) => {
          const row = purchaseBySupplier.get(s.id);
          return {
            id: s.id,
            name: s.name,
            category: s.category,
            amount: row?.amount ?? 0,
            nameOverride: row?.nameOverride ?? null,
          };
        })}
      />

      <FixedCostSection
        fiscalMonthId={currentMonth.id}
        categories={fixedCats.map((c) => ({
          id: c.id,
          name: c.name,
          amount: fixedByCat.get(c.id) ?? 0,
        }))}
      />

      <RevenueOverrideSection
        fiscalMonthId={currentMonth.id}
        amount={override?.amount ?? 0}
        note={override?.note ?? ""}
      />

      <StatementExpensesPanel
        summary={statementExpenses}
        manualFixed={Array.from(fixedByCat.values()).reduce((s, v) => s + v, 0)}
      />
    </div>
  );
}
