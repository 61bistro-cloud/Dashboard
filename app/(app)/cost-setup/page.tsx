import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import { getStatementExpenses } from "@/lib/bank-calc";
import { MonthPicker } from "./_components/month-picker";
import { PayrollSection } from "./_components/payroll-section";
import { SupplierSection } from "./_components/supplier-section";
import { FixedCostSection } from "./_components/fixed-section";
import { RevenueOverrideSection } from "./_components/override-section";
import { StatementExpensesPanel } from "./_components/statement-expenses-panel";
import {
  COST_BUCKET_LABELS,
  resolveCostAmounts,
  type CostBucket,
} from "@/lib/statement-costs";
import { fmtTHB } from "@/lib/fiscal";
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

  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={Settings} title="Cost Setup" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน
        </p>
      </div>
    );
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
      where: { active: true, businessId: business.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.employeePayroll.findMany({
      where: { businessId: business.id, fiscalMonthId: currentMonth.id },
    }),
    prisma.payrollExtra.findMany({
      where: { businessId: business.id, fiscalMonthId: currentMonth.id },
    }),
    prisma.supplier.findMany({
      where: { active: true, businessId: business.id },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.supplierPurchase.findMany({
      where: { businessId: business.id, fiscalMonthId: currentMonth.id },
      include: { supplier: { select: { category: true } } },
    }),
    prisma.fixedCostCategory.findMany({
      where: { active: true, businessId: business.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.fixedCost.findMany({
      where: { businessId: business.id, fiscalMonthId: currentMonth.id },
    }),
    prisma.monthlyRevenueOverride.findUnique({
      where: {
        businessId_fiscalMonthId: {
          businessId: business.id,
          fiscalMonthId: currentMonth.id,
        },
      },
    }),
  ]);

  const statementExpenses = await getStatementExpenses(
    currentMonth.id,
    business.id
  );

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

  const manualAmounts = {
    food: purchases
      .filter((p) => p.supplier.category === "FOOD")
      .reduce((s, p) => s + p.amount, 0),
    bev: purchases
      .filter((p) => p.supplier.category === "BEVERAGE")
      .reduce((s, p) => s + p.amount, 0),
    pack: purchases
      .filter((p) => p.supplier.category === "PACKAGING")
      .reduce((s, p) => s + p.amount, 0),
    laborBase: payrollRows.reduce((s, p) => s + p.amount, 0),
    laborExtra: extras.reduce((s, p) => s + p.amount, 0),
    fixed: fixedCosts.reduce((s, p) => s + p.amount, 0),
  };
  const effectiveCosts = resolveCostAmounts(manualAmounts, statementExpenses);
  const manualTotal = Object.values(manualAmounts).reduce((s, v) => s + v, 0);
  const totalCost = Object.values(effectiveCosts).reduce((s, v) => s + v, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        icon={Settings}
        title="Cost Setup"
        description="สรุปค่าใช้จ่ายรายเดือนจาก Bank & Reconcile — ใช้ยอดเดียวกันใน Dashboard และ P&L"
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
          <span className="text-muted">เดือนที่กำลังดู:</span>{" "}
          <span className="font-semibold">{currentMonth.fullLabel}</span>{" "}
          <span className="text-muted">
            • จำนวนวัน {currentMonth.daysInMonth} วัน
          </span>
        </div>
      </div>

      <section className="rounded-card border border-hairline bg-canvas p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              ค่าใช้จ่ายที่ใช้คำนวณ P&L — {currentMonth.fullLabel}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {statementExpenses.hasTransactions
                ? "ใช้รายจ่ายที่จัดหมวดใน Bank & Reconcile เป็นหลัก • ไม่บวกยอดกรอกเดิมซ้ำ"
                : "ยังไม่มีรายการใน Bank & Reconcile • ใช้ยอดกรอกเองด้านล่างชั่วคราว"}
            </p>
          </div>
          <strong className="text-xl tabular-nums">{fmtTHB(totalCost)}</strong>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(Object.keys(COST_BUCKET_LABELS) as CostBucket[]).map((bucket) => (
            <div
              key={bucket}
              className="rounded-input border border-hairline p-3"
            >
              <div className="text-xs text-muted">
                {COST_BUCKET_LABELS[bucket]}
              </div>
              <div className="mt-1 font-semibold tabular-nums">
                {fmtTHB(effectiveCosts[bucket])}
              </div>
            </div>
          ))}
        </div>
      </section>
      <StatementExpensesPanel
        summary={statementExpenses}
        manualTotal={manualTotal}
        monthId={currentMonth.id}
      />
      <details
        className="rounded-card border border-hairline p-4"
        open={!statementExpenses.hasTransactions}
      >
        <summary className="cursor-pointer text-sm font-medium">
          ยอดกรอกเองเดิม — {fmtTHB(manualTotal)}{" "}
          {statementExpenses.hasTransactions
            ? "(เก็บไว้เทียบ ไม่นับซ้ำใน P&L)"
            : "(ใช้ใน P&L จนกว่าจะมีรายการธนาคาร)"}
        </summary>
        <p className="text-xs text-muted mt-3 mb-4">
          {statementExpenses.hasTransactions
            ? "เดือนนี้ใช้ยอดจาก Bank & Reconcile แล้ว หากมีรายจ่ายเงินสดให้บันทึกในบัญชีเงินสดของ Bank & Reconcile และจัดหมวด เพื่อรวมในสรุปเดียวกัน"
            : "กรอกค่าใช้จ่ายได้เมื่อยังไม่มีข้อมูลธนาคาร เมื่อเริ่มลง Bank & Reconcile ระบบจะเปลี่ยนมาใช้ยอดธนาคารทั้งเดือน กรุณาลงให้ครบทุกบัญชีรวมถึงเงินสด"}
        </p>
        <fieldset
          disabled={statementExpenses.hasTransactions}
          className="space-y-6 disabled:opacity-60"
        >
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
        </fieldset>
      </details>

      <RevenueOverrideSection
        fiscalMonthId={currentMonth.id}
        amount={override?.amount ?? 0}
        note={override?.note ?? ""}
      />
    </div>
  );
}
