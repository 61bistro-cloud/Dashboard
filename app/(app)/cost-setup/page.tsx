import {
  payrollExtraRows,
  isPayrollExtraCategory,
  isOtherCostCategory,
} from "@/lib/flexible-costs";
import { OtherCostsSection } from "./_components/other-costs-section";
import { displayMonth } from "@/lib/i18n/core";

import { getUi } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import { getDetailedStatementExpenses } from "@/lib/statement-cost-details";
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
        <PageHeader icon={Settings} title={ui("Cost Setup")} />
        <p className="mt-4 text-red-600">
          {ui("คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน")}
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
        <PageHeader icon={Settings} title={ui("Cost Setup")} />
        <p className="mt-4 text-red-600">
          {ui("ไม่พบข้อมูลปีงบในระบบ กรุณา seed ก่อน")}
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
      where: { businessId: business.id },
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

  const { summary: statementExpenses, details: statementDetails } =
    await getDetailedStatementExpenses(currentMonth.id, business.id);

  const payrollByEmp = new Map(
    payrollRows.map((p) => [
      p.employeeId,
      { amount: p.amount, nameOverride: p.nameOverride },
    ])
  );
  const flexibleExtras = payrollExtraRows(fixedCats, fixedCosts, extras);
  const extraCategoryIds = new Set(
    fixedCats.filter((c) => isPayrollExtraCategory(c.icon)).map((c) => c.id)
  );
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
    laborExtra: flexibleExtras.reduce((s, p) => s + p.amount, 0),
    fixed: fixedCosts
      .filter((p) => !extraCategoryIds.has(p.categoryId))
      .reduce((s, p) => s + p.amount, 0),
  };
  const effectiveCosts = resolveCostAmounts(manualAmounts, statementExpenses);
  const manualTotal = Object.values(manualAmounts).reduce((s, v) => s + v, 0);
  const totalCost = Object.values(effectiveCosts).reduce((s, v) => s + v, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        icon={Settings}
        title={ui("Cost Setup")}
        description={ui(
          "สรุปค่าใช้จ่ายรายเดือนจาก Bank & Reconcile — ใช้ยอดเดียวกันใน Dashboard และ P&L"
        )}
        action={
          <MonthPicker
            months={allMonths.map((m) => ({
              id: m.id,
              label: displayMonth(
                `${displayMonth(m.label, uiLocale)} ${m.year.yearBE}`,
                uiLocale
              ),
            }))}
            currentId={currentMonth.id}
          />
        }
      />

      <div className="rounded-input border border-hairline bg-canvas p-4">
        <div className="text-sm">
          <span className="text-muted">{ui("เดือนที่กำลังดู:")}</span>{" "}
          <span className="font-semibold">
            {displayMonth(currentMonth.fullLabel, uiLocale)}
          </span>{" "}
          <span className="text-muted">
            {ui("• จำนวนวัน")} {currentMonth.daysInMonth} {ui("วัน")}
          </span>
        </div>
      </div>

      <section className="rounded-card border border-hairline bg-canvas p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              {ui("ค่าใช้จ่ายที่ใช้คำนวณ P&L —")}{" "}
              {displayMonth(currentMonth.fullLabel, uiLocale)}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {statementExpenses.hasTransactions
                ? ui(
                    "ใช้รายจ่ายที่จัดหมวดใน Bank & Reconcile เป็นหลัก • ไม่บวกยอดกรอกเดิมซ้ำ"
                  )
                : ui(
                    "ยังไม่มีรายการใน Bank & Reconcile • ใช้ยอดกรอกเองด้านล่างชั่วคราว"
                  )}
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
                {ui(COST_BUCKET_LABELS[bucket])}
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
        details={statementDetails}
        manualTotal={manualTotal}
        monthId={currentMonth.id}
      />
      <details
        className="rounded-card border border-hairline p-4"
        open={!statementExpenses.hasTransactions}
      >
        <summary className="cursor-pointer text-sm font-medium">
          {ui("ยอดกรอกเองเดิม —")} {fmtTHB(manualTotal)}{" "}
          {statementExpenses.hasTransactions
            ? ui("(เก็บไว้เทียบ ไม่นับซ้ำใน P&L)")
            : ui("(ใช้ใน P&L จนกว่าจะมีรายการธนาคาร)")}
        </summary>
        <p className="text-xs text-muted mt-3 mb-4">
          {statementExpenses.hasTransactions
            ? ui(
                "เดือนนี้ใช้ยอดจาก Bank & Reconcile แล้ว หากมีรายจ่ายเงินสดให้บันทึกในบัญชีเงินสดของ Bank & Reconcile และจัดหมวด เพื่อรวมในสรุปเดียวกัน"
              )
            : ui(
                "กรอกค่าใช้จ่ายได้เมื่อยังไม่มีข้อมูลธนาคาร เมื่อเริ่มลง Bank & Reconcile ระบบจะเปลี่ยนมาใช้ยอดธนาคารทั้งเดือน กรุณาลงให้ครบทุกบัญชีรวมถึงเงินสด"
              )}
        </p>
        {statementExpenses.hasTransactions && (
          <p className="mb-4 text-xs text-amber-700">
            {ui(
              "เพิ่มหรือแก้รายการด้านล่างได้เพื่อเก็บเทียบ แต่รายงานยังใช้ยอด Statement เท่านั้น หากต้องการเพิ่มค่าใช้จ่ายจริง ให้บันทึกใน Bank & Reconcile"
            )}
          </p>
        )}
        <fieldset className="space-y-6">
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
            extras={flexibleExtras}
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

          <OtherCostsSection
            fiscalMonthId={currentMonth.id}
            items={fixedCats
              .filter(
                (c) =>
                  isOtherCostCategory(c.icon) &&
                  (c.active || (fixedByCat.get(c.id) ?? 0) !== 0)
              )
              .map((c) => ({
                id: c.id,
                name: c.name,
                amount: fixedByCat.get(c.id) ?? 0,
              }))}
          />

          <FixedCostSection
            fiscalMonthId={currentMonth.id}
            categories={fixedCats
              .filter(
                (c) =>
                  c.active &&
                  !isPayrollExtraCategory(c.icon) &&
                  !isOtherCostCategory(c.icon)
              )
              .map((c) => ({
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
