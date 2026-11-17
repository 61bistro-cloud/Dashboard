import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isPayrollExtraCategory } from "../lib/flexible-costs.ts";
import * as costPlan from "../lib/cost-plan.ts";
import {
  classifyExpense,
  emptyCosts,
  resolveCostAmounts,
  summarizeStatementCosts,
} from "../lib/statement-costs.ts";

const category = (id: number, name: string, kind = "EXPENSE") => ({
  id,
  name,
  kind,
});
const tx = (
  id: number,
  name: string,
  withdraw: number,
  kind = "EXPENSE",
  card = false,
  fiscalMonthId = 1
) => ({
  businessId: 1,
  fiscalMonthId,
  withdraw,
  category: category(id, name, kind),
  account: { accountType: card ? "CREDIT_CARD" : "BANK" },
});
const transactions = () => [
  tx(1, "🥩 ต้นทุน - วัตถุดิบอาหาร", 100),
  tx(2, "🍹 ต้นทุน - วัตถุดิบเครื่องดื่ม", 20),
  tx(3, "📦 ต้นทุน - แพ็คเกจจิ้ง", 10),
  tx(4, "👥 เงินเดือนพนักงาน", 50),
  tx(5, "👥 ค่าจ้าง/OT/พิเศษ", 5),
  tx(6, "🏠 ค่าเช่า", 30, "EXPENSE", true),
  tx(7, "🔄 โอนระหว่างบัญชี", 500, "TRANSFER"),
  tx(8, "🔴 ชำระบัตรเครดิต", 80),
  tx(9, "👔 เบิกเงิน/โอนให้ผู้บริหาร", 20),
  tx(10, "💊 เบิกล่วงหน้าพนักงาน", 10),
  { ...tx(11, "", 7), category: null },
  tx(12, "รายรับที่ลงผิดฝั่ง", 3, "INCOME"),
];

test("all expense buckets reconcile to statement withdrawals without counting transfers or card repayments twice", () => {
  const s = summarizeStatementCosts(transactions()).get(1)!;
  assert.deepEqual(s.amounts, {
    food: 100,
    bev: 20,
    pack: 10,
    laborBase: 50,
    laborExtra: 5,
    fixed: 30,
  });
  assert.equal(s.grandTotal, 215);
  assert.equal(s.bankTotal, 185);
  assert.equal(s.cardTotal, 30);
  assert.equal(s.pendingTotal, 10);
  assert.equal(s.excludedTotal, 610);
  assert.equal(s.withdrawalTotal, 835);
  assert.equal(
    s.withdrawalTotal,
    s.grandTotal + s.pendingTotal + s.excludedTotal
  );
});

test("manual costs remain the sole P&L source even when statement transactions exist", () => {
  const manual = {
    food: 999,
    bev: 1,
    pack: 2,
    laborBase: 888,
    laborExtra: 3,
    fixed: 777,
  };
  const s = summarizeStatementCosts(transactions()).get(1)!;
  assert.deepEqual(resolveCostAmounts(manual, s), manual);
  assert.deepEqual(resolveCostAmounts(manual), manual);
  assert.notEqual(resolveCostAmounts(manual), manual);
  const receiptOnly = summarizeStatementCosts([
    tx(1, "รับเงิน", 0, "INCOME"),
  ]).get(1)!;
  assert.deepEqual(resolveCostAmounts(manual, receiptOnly), manual);
});

test("unknown expenses default to operating costs; missing/income categories wait for review", () => {
  assert.equal(classifyExpense(category(1, "ค่าซ่อมอุปกรณ์")), "fixed");
  assert.equal(classifyExpense(null), "pending");
  assert.equal(classifyExpense(category(1, "ขาย", "INCOME")), "pending");
  assert.equal(classifyExpense(category(1, "โอน", "TRANSFER")), "excluded");
});

test("aggregation keeps months separate and performs money arithmetic in cents", () => {
  const s = summarizeStatementCosts([
    tx(1, "อาหาร", 0.1),
    tx(1, "อาหาร", 0.2),
    tx(1, "อาหาร", 12, "EXPENSE", false, 2),
  ]);
  assert.equal(s.get(1)!.grandTotal, 0.3);
  assert.equal(s.get(2)!.grandTotal, 12);
  assert.equal(s.get(1)!.rows[0].count, 2);
});

async function pipeline(snapshot: any = null, structured = false) {
  let rows = transactions();
  const scopes: any[] = [];
  const months = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    monthIndex: i + 1,
    label: `month ${i + 1}`,
    fullLabel: `month ${i + 1}`,
    calendarYear: i < 9 ? 2026 : 2027,
    calendarMonth: ((i + 3) % 12) + 1,
    daysInMonth: 30,
  }));
  const year = { id: 1, yearBE: 2569, label: "2569", months };
  const manualPurchases = [
    {
      fiscalMonthId: 1,
      supplierId: 1,
      amount: 1000,
      nameOverride: null,
      supplier: { id: 1, name: "Manual food", category: "FOOD" },
    },
    {
      fiscalMonthId: 2,
      supplierId: 1,
      amount: 20,
      nameOverride: null,
      supplier: { id: 1, name: "Manual food", category: "FOOD" },
    },
  ];
  const prisma = {
    fiscalYear: { findUnique: async () => year },
    monthlyClosing: { findUnique: async () => snapshot },
    fiscalMonth: {
      findUnique: async ({ where }: any) => ({
        ...months.find((m) => m.id === where.id),
        year,
      }),
    },
    posBill: {
      findMany: async () => [],
      groupBy: async ({ by }: any) =>
        by[0] === "paymentType"
          ? [{ paymentType: "cash", _sum: { netAmount: 500 } }]
          : [
              {
                businessDate: "2026-04-01",
                _sum: {
                  netAmount: 500,
                  grossAmount: 500,
                  totalDiscount: 0,
                  vatAmount: 0,
                },
                _count: { id: 5 },
              },
            ],
    },
    supplierPurchase: {
      findMany: async ({ where }: any) =>
        typeof where.fiscalMonthId === "number"
          ? manualPurchases.filter(
              (p) => p.fiscalMonthId === where.fiscalMonthId
            )
          : manualPurchases,
    },
    supplier: { findMany: async () => [{ id: 1, category: "FOOD" }] },
    employeePayroll: {
      groupBy: async () => [
        { fiscalMonthId: 1, _sum: { amount: 1000 } },
        { fiscalMonthId: 2, _sum: { amount: 10 } },
      ],
      findMany: async ({ where }: any) =>
        [
          {
            fiscalMonthId: 1,
            amount: 1000,
            nameOverride: null,
            employee: { name: "Manual salary" },
          },
          {
            fiscalMonthId: 2,
            amount: 10,
            nameOverride: null,
            employee: { name: "Manual salary" },
          },
        ].filter((row) => row.fiscalMonthId === where.fiscalMonthId),
    },
    payrollExtra: { groupBy: async () => [], findMany: async () => [] },
    fixedCostCategory: {
      findMany: async () =>
        structured ? [{ icon: "cost-setup:supplier-group:1:admin" }] : [],
    },
    fixedCost: {
      groupBy: async () => [
        { fiscalMonthId: 1, _sum: { amount: 1000 } },
        { fiscalMonthId: 2, _sum: { amount: 5 } },
      ],
      findMany: async ({ where }: any) =>
        [
          ...(structured
            ? [
                ["raw", 10],
                ["condiments", 15],
                ["beverage", 8],
                ["packaging", 4],
                ["freight", 6],
                ["labor", 2],
                ["selling", 9],
                ["occupancy", 11],
                ["admin", 13],
              ].map(([group, amount]) => ({
                fiscalMonthId: 2,
                amount: Number(amount),
                category: {
                  name: String(group),
                  icon: `cost-setup:group:${group}`,
                },
              }))
            : []),
          {
            fiscalMonthId: 1,
            amount: 1000,
            category: { name: "Manual rent", icon: null },
          },
          {
            fiscalMonthId: 2,
            amount: 5,
            category: { name: "Manual rent", icon: null },
          },
          {
            fiscalMonthId: 2,
            amount: 7,
            category: {
              name: "Custom overtime",
              icon: "cost-setup:payroll-extra",
            },
          },
          {
            fiscalMonthId: 2,
            amount: 3,
            category: { name: "Shop supplies", icon: "cost-setup:other" },
          },
        ].filter(
          (row) =>
            typeof where.fiscalMonthId !== "number" ||
            row.fiscalMonthId === where.fiscalMonthId
        ),
    },
    monthlyRevenueOverride: {
      findMany: async () => [{ fiscalMonthId: 1, amount: 50000 }],
      findUnique: async () => ({ amount: 50000 }),
    },
    bankTransaction: {
      findMany: async (query: any) => {
        scopes.push(query);
        return rows.filter(
          (r) =>
            r.businessId === query.where.businessId &&
            query.where.fiscalMonthId.in.includes(r.fiscalMonthId)
        );
      },
    },
  };
  const context = vm.createContext({ console });
  const modules = new Map<string, vm.Module>();
  async function load(name: string): Promise<vm.Module> {
    if (modules.has(name)) return modules.get(name)!;
    const mock: Record<string, any> = {
      "@/lib/prisma": { prisma },
      "@/lib/flexible-costs": { isPayrollExtraCategory },
      "@/lib/cost-plan": costPlan,
      "@/lib/fiscal": { PAYROLL_EXTRA_LABELS: {} },
      "@/lib/bank-calc": { getReconciliation: async () => [] },
    };
    if (mock[name]) {
      const exports = mock[name];
      const mod = new vm.SyntheticModule(
        Object.keys(exports),
        function () {
          for (const key of Object.keys(exports))
            this.setExport(key, exports[key]);
        },
        { context }
      );
      modules.set(name, mod);
      return mod;
    }
    assert.ok(name.startsWith("@/lib/"), name);
    const source = readFileSync(
      new URL(`../${name.slice(2)}.ts`, import.meta.url),
      "utf8"
    );
    const code = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context });
    modules.set(name, mod);
    await mod.link(load);
    return mod;
  }
  const pl = await load("@/lib/pl-calc");
  await pl.evaluate();
  const closing = await load("@/lib/closing");
  await closing.evaluate();
  return {
    pl: pl.namespace as any,
    closing: closing.namespace as any,
    scopes,
    replace: (next: any[]) => {
      rows = next;
    },
  };
}

test("Cost Setup expense buckets feed monthly, yearly, Daily P&L and closing line items consistently", async () => {
  const h = await pipeline();
  const yearly = await h.pl.getYearlyPL(2569, 1);
  const april = yearly.months[0];
  assert.equal(april.totalCost, 3000);
  assert.equal(april.netProfit, -2500);
  assert.equal(april.netRevenue, 500);
  assert.equal(april.override, 0);
  assert.equal(april.costSource, "manual");
  assert.equal(april.pendingStatementCost, 0);
  assert.equal(april.cogs, 1000);
  assert.equal(april.labor, 1000);
  assert.equal(april.fixed, 1000);
  assert.equal(yearly.months[1].totalCost, 45);
  assert.equal(yearly.months[1].laborExtra, 7);
  assert.equal(yearly.months[1].fixed, 8);
  assert.equal(yearly.months[1].costSource, "manual");
  assert.equal(yearly.total.totalCost, 3045);
  assert.equal(yearly.total.costSource, "manual");
  const daily = await h.pl.getDailyPL(1, 1);
  assert.equal(daily.totals.totalCost, 3000);
  assert.ok(
    Math.abs(
      daily.days.reduce((s: number, d: any) => s + d.totalCost, 0) - 3000
    ) < 0.00001
  );
  const breakdown = await h.closing.computeBreakdown(1, 1);
  assert.equal(breakdown.cogsFood[0].label, "Manual food");
  assert.equal(
    Object.entries(breakdown)
      .filter(([key]) => key !== "revenue")
      .flatMap(([, value]) => value as any[])
      .reduce((sum, row) => sum + row.amount, 0),
    3000
  );
  const mayDaily = await h.pl.getDailyPL(2, 1);
  assert.equal(mayDaily.totals.totalCost, 45);
  assert.ok(
    Math.abs(
      mayDaily.days.reduce((sum: number, row: any) => sum + row.totalCost, 0) -
        45
    ) < 0.00001
  );
  const mayBreakdown = await h.closing.computeBreakdown(1, 2);
  assert.equal(mayBreakdown.laborExtra[0].label, "Custom overtime");
  assert.equal(mayBreakdown.laborExtra[0].amount, 7);
  assert.equal(
    mayBreakdown.fixed.reduce((sum: number, row: any) => sum + row.amount, 0),
    8
  );
  assert.equal(
    Object.entries(mayBreakdown)
      .filter(([key]) => key !== "revenue")
      .flatMap(([, value]) => value as any[])
      .reduce((sum, row) => sum + row.amount, 0),
    45
  );
  for (const query of h.scopes) {
    assert.equal(query.where.businessId, 1);
    assert.ok(Array.isArray(query.where.fiscalMonthId.in));
  }
});

test("statement category changes and deletions never change manual P&L costs", async () => {
  const h = await pipeline();
  const rows = transactions();
  rows[0].category = category(1, "โอนระหว่างบัญชี", "TRANSFER");
  h.replace(rows);
  assert.equal((await h.pl.getYearlyPL(2569, 1)).months[0].totalCost, 3000);
  h.replace(rows.filter((r) => r.category?.id !== 6));
  assert.equal((await h.pl.getYearlyPL(2569, 1)).months[0].totalCost, 3000);
  h.replace([]);
  assert.equal((await h.pl.getYearlyPL(2569, 1)).months[0].totalCost, 3000);
  const breakdown = await h.closing.computeBreakdown(1, 1);
  assert.equal(breakdown.cogsFood[0].label, "Manual food");
  // A different business must never consume business 1's statement costs.
  h.replace(transactions());
  assert.equal(
    (await h.pl.getYearlyPL(2569, 2)).months[0].costSource,
    "manual"
  );
});

test("existing closing snapshots stay frozen after switching live reports to owner-entered costs", async () => {
  const snapshot = {
    id: 1,
    status: "CLOSED",
    netRevenue: 500,
    posBillCount: 5,
    food: 90,
    bev: 0,
    pack: 0,
    cogs: 90,
    laborBase: 0,
    laborExtra: 0,
    labor: 0,
    fixed: 0,
    totalCost: 90,
    netProfit: 410,
    marginPct: 0.82,
    note: null,
    closedAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
    closedBy: null,
    adjustments: [],
    logs: [],
    detailJson: JSON.stringify({
      revenue: [],
      cogsFood: [{ label: "Frozen food", amount: 90 }],
    }),
  };
  const h = await pipeline(snapshot);
  const view = await h.closing.getClosingView(1, 1);
  assert.equal(view.live.totalCost, 3000);
  assert.equal(view.final.totalCost, 90);
  assert.equal(view.breakdown.cogsFood[0].label, "Frozen food");
  assert.ok(view.drift.length > 0);
  assert.equal(
    view.checks.some((check: any) => check.key === "statement_pending"),
    false
  );
});

test("all nine manual groups feed COGS/OPEX and closing exactly once, independent of statement amounts", async () => {
  const h = await pipeline(null, true);
  h.replace([
    ...transactions(),
    tx(90, "วัตถุดิบ", 99999, "EXPENSE", false, 2),
  ]);
  const yearly = await h.pl.getYearlyPL(2569, 1),
    may = yearly.months[1];
  assert.equal(may.cogs, 43);
  assert.equal(may.food, 31);
  assert.equal(may.bev, 8);
  assert.equal(may.pack, 4);
  assert.equal(may.labor, 19);
  assert.equal(may.fixed, 61);
  assert.equal(may.totalCost, 123);
  assert.equal(may.costSource, "manual");
  assert.equal(yearly.total.totalCost, 3123);
  const breakdown = await h.closing.computeBreakdown(1, 2);
  const sum = (rows: any[]) => rows.reduce((s, r) => s + r.amount, 0);
  assert.equal(
    sum(breakdown.cogsFood) + sum(breakdown.cogsBev) + sum(breakdown.cogsPack),
    43
  );
  assert.equal(sum(breakdown.laborSalary) + sum(breakdown.laborExtra), 19);
  assert.equal(sum(breakdown.fixed), 61);
  const daily = await h.pl.getDailyPL(2, 1);
  assert.equal(daily.totals.totalCost, 123);
  assert.ok(
    Math.abs(
      daily.days.reduce((s: number, d: any) => s + d.totalCost, 0) - 123
    ) < 0.00001
  );
});
