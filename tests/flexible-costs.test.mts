import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as payrollVersion from "../lib/payroll-revision.ts";
import { z } from "zod";
import * as flexible from "../lib/flexible-costs.ts";
import { PAYROLL_EXTRA_LABELS } from "../lib/payroll-labels.ts";

const plain = (value: any) => JSON.parse(JSON.stringify(value));
async function harness(role = "OWNER") {
  let state = {
    categories: [] as any[],
    costs: [] as any[],
    legacy: [
      { businessId: 1, fiscalMonthId: 1, type: "OT", amount: 100 },
      { businessId: 1, fiscalMonthId: 2, type: "OT", amount: 80 },
    ],
    payroll: [] as any[],
    closed: false,
  };
  const invalidations: string[] = [];
  const tx: any = {
    supplier: { findMany: async () => [{ id: 1 }] },
    monthlyClosing: {
      findUnique: async () => (state.closed ? { status: "CLOSED" } : null),
    },
    fiscalMonth: {
      findUnique: async ({ where }: any) =>
        [1, 2].includes(where.id) ? { id: where.id } : null,
    },
    employee: { findMany: async () => [{ id: 1 }] },
    employeePayroll: {
      findMany: async () => state.payroll,
      deleteMany: async () => {
        state.payroll = [];
      },
      upsert: async ({ create }: any) => {
        state.payroll.push(create);
      },
    },
    fixedCostCategory: {
      findMany: async ({ where }: any) =>
        state.categories
          .filter((c) => c.businessId === where.businessId)
          .map((c) => ({ ...c })),
      create: async ({ data }: any) => {
        if (
          state.categories.some(
            (c) => c.businessId === data.businessId && c.name === data.name
          )
        )
          throw Error("duplicate name");
        const row = {
          ...data,
          id: Math.max(0, ...state.categories.map((c) => c.id)) + 1,
        };
        state.categories.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = state.categories.find((c) => c.id === where.id);
        assert.ok(row);
        if (
          state.categories.some(
            (c) =>
              c.id !== row.id &&
              c.businessId === row.businessId &&
              c.name === data.name
          )
        )
          throw Error("duplicate name");
        Object.assign(row, data);
        return { ...row };
      },
    },
    fixedCost: {
      findMany: async ({ where }: any) =>
        state.costs.filter(
          (c) =>
            c.businessId === where.businessId &&
            c.fiscalMonthId === where.fiscalMonthId
        ),
      upsert: async ({ create, update }: any) => {
        const row = state.costs.find(
          (c) =>
            c.categoryId === create.categoryId &&
            c.fiscalMonthId === create.fiscalMonthId
        );
        if (row) Object.assign(row, update);
        else state.costs.push({ ...create });
      },
      deleteMany: async ({ where }: any) => {
        state.costs = state.costs.filter(
          (c) =>
            !(
              c.businessId === where.businessId &&
              c.categoryId === where.categoryId &&
              c.fiscalMonthId === where.fiscalMonthId
            )
        );
      },
    },
    payrollExtra: {
      findMany: async ({ where }: any) =>
        state.legacy.filter(
          (c) =>
            c.businessId === where.businessId &&
            c.fiscalMonthId === where.fiscalMonthId
        ),
      deleteMany: async ({ where }: any) => {
        state.legacy = state.legacy.filter(
          (c) =>
            !(
              c.businessId === where.businessId &&
              c.fiscalMonthId === where.fiscalMonthId
            )
        );
      },
    },
  };
  const prisma = {
    $transaction: async (fn: any) => {
      const before = structuredClone(state);
      try {
        return await fn(tx);
      } catch (e) {
        state = before;
        throw e;
      }
    },
  };
  const dependencies: any = {
    zod: { z },
    "@/auth": {
      auth: async () => (role === "NONE" ? null : { user: { role } }),
    },
    "@/lib/prisma": { prisma },
    "@/lib/business": { requireBusiness: async () => ({ id: 1 }) },
    "@/lib/flexible-costs": flexible,
    "@/lib/payroll-revision": payrollVersion,
    "@/lib/payroll-labels": { PAYROLL_EXTRA_LABELS },
    "next/cache": {
      revalidatePath: (path: string) => invalidations.push(path),
    },
  };
  const context = vm.createContext({ console });
  const source = ts.transpileModule(
    readFileSync(
      new URL("../app/(app)/cost-setup/actions.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }
  ).outputText;
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name: string) => {
    const exports = dependencies[name];
    assert.ok(exports, name);
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const key of Object.keys(exports))
          this.setExport(key, exports[key]);
      },
      { context }
    );
  });
  await module.evaluate();
  return {
    actions: {
      ...module.namespace,
      savePayroll: async (input: any) =>
        (module.namespace as any).savePayroll({
          revision: await payrollVersion.readPayrollRevision(
            tx,
            1,
            input.fiscalMonthId
          ),
          ...input,
        }),
    } as any,
    state: () => state,
    invalidations,
  };
}

test("default extras remain readable until a user saves, with no startup migration", () => {
  const rows = flexible.payrollExtraRows([], [], [{ type: "OT", amount: 100 }]);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].amount, 100);
  assert.equal(rows[0].legacyType, "OT");
});
test("payroll saves arbitrary names and extra rows atomically, without double counting or altering another month", async () => {
  const h = await harness();
  await h.actions.savePayroll({
    businessId: 1,
    fiscalMonthId: 1,
    payroll: [{ employeeId: 1, amount: 900 }],
    extras: [
      { legacyType: "OT", name: "Evening overtime", amount: 125 },
      { name: "Holiday allowance", amount: 50 },
    ],
  });
  assert.equal(h.state().legacy.length, 1);
  assert.equal(h.state().legacy[0].fiscalMonthId, 2);
  const rows = flexible.payrollExtraRows(
    h.state().categories,
    h.state().costs,
    []
  );
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce((s, r) => s + r.amount, 0),
    175
  );
  assert.ok(h.state().categories.filter((c) => !c.active).length === 3);
  await h.actions.savePayroll({
    businessId: 1,
    fiscalMonthId: 1,
    payroll: [],
    extras: rows.map((r) => ({ ...r, amount: r.amount + 1 })),
  });
  assert.equal(h.state().costs.length, 2);
  assert.equal(
    h.state().costs.reduce((s, r) => s + r.amount, 0),
    177
  );
  for (const path of ["/", "/daily-pl", "/monthly-pl", "/closing"])
    assert.ok(h.invalidations.includes(path));
});
test("removing every extra persists after reload while historical legacy payments remain visible", async () => {
  const h = await harness();
  await h.actions.savePayroll({
    businessId: 1,
    fiscalMonthId: 1,
    payroll: [],
    extras: [],
  });
  assert.deepEqual(flexible.payrollExtraRows(h.state().categories, [], []), []);
  const history = flexible.payrollExtraRows(
    h.state().categories,
    [],
    h.state().legacy as any
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].amount, 80);
});
test("other shop costs can be added, renamed, changed, removed and restored without deleting historical amounts", async () => {
  const h = await harness();
  await h.actions.saveOtherCosts({
    fiscalMonthId: 1,
    rows: [{ name: "Cleaning supplies", amount: 45 }],
  });
  const id = h.state().categories[0].id;
  assert.equal(h.state().categories[0].icon, flexible.OTHER_MARKER);
  await h.actions.saveOtherCosts({
    fiscalMonthId: 2,
    rows: [{ id, name: "Shop supplies", amount: 60 }],
  });
  await h.actions.saveOtherCosts({ fiscalMonthId: 2, rows: [] });
  assert.equal(h.state().costs.length, 1);
  assert.equal(h.state().costs[0].amount, 45);
  assert.equal(h.state().categories[0].active, false);
  await h.actions.saveOtherCosts({
    fiscalMonthId: 2,
    rows: [{ name: "Shop supplies", amount: 70 }],
  });
  assert.equal(h.state().categories.length, 1);
  assert.equal(h.state().categories[0].active, true);
  assert.equal(h.state().costs.length, 2);
});
test("foreign IDs, category substitution and invalid input cannot mutate costs; payroll rolls back on failure", async () => {
  const h = await harness();
  h.state().categories.push({
    id: 10,
    businessId: 2,
    name: "Foreign",
    icon: flexible.OTHER_MARKER,
    active: true,
    sortOrder: 1,
  });
  const before = plain(h.state());
  await assert.rejects(
    h.actions.saveOtherCosts({
      fiscalMonthId: 1,
      rows: [{ id: 10, name: "Foreign", amount: 1 }],
    })
  );
  await assert.rejects(
    h.actions.savePayroll({
      businessId: 1,
      fiscalMonthId: 1,
      payroll: [{ employeeId: 1, amount: 1000 }],
      extras: [{ id: 10, name: "Wrong", amount: 1 }],
    })
  );
  for (const rows of [
    [{ name: "", amount: 1 }],
    [{ name: "Bad", amount: -1 }],
    [{ name: "Bad", amount: NaN }],
    [
      { name: "Same", amount: 1 },
      { name: "Same", amount: 2 },
    ],
  ])
    await assert.rejects(h.actions.saveOtherCosts({ fiscalMonthId: 1, rows }));
  await assert.rejects(
    h.actions.saveOtherCosts({ fiscalMonthId: 999, rows: [] })
  );
  assert.deepEqual(plain(h.state()), before);
});
test("staff and unauthenticated requests cannot write custom costs", async () => {
  for (const role of ["STAFF", "NONE"]) {
    const h = await harness(role);
    const before = plain(h.state());
    await assert.rejects(
      h.actions.saveOtherCosts({
        fiscalMonthId: 1,
        rows: [{ name: "X", amount: 1 }],
      })
    );
    assert.deepEqual(plain(h.state()), before);
  }
});

test("payroll rejects stale tabs, changed business and invalid money without clearing existing amounts", async () => {
  const h = await harness();
  const before = plain(h.state());
  for (const patch of [
    { revision: "0".repeat(64) },
    { businessId: 2 },
    { payroll: [{ employeeId: 1, amount: "not-money" }] },
  ]) {
    await assert.rejects(
      h.actions.savePayroll({
        businessId: 1,
        fiscalMonthId: 1,
        payroll: [{ employeeId: 1, amount: 50 }],
        extras: [],
        ...patch,
      })
    );
    assert.deepEqual(plain(h.state()), before);
  }
});
test("closed months block payroll and legacy supplier/category endpoints atomically", async () => {
  const h = await harness();
  h.state().closed = true;
  const before = plain(h.state());
  for (const [action, input] of [
    [
      "savePayroll",
      {
        businessId: 1,
        fiscalMonthId: 1,
        payroll: [{ employeeId: 1, amount: 50 }],
        extras: [],
      },
    ],
    [
      "saveSuppliers",
      { fiscalMonthId: 1, purchases: [{ supplierId: 1, amount: 50 }] },
    ],
    ["saveFixed", { fiscalMonthId: 1, costs: [{ categoryId: 1, amount: 50 }] }],
  ] as const)
    await assert.rejects(h.actions[action](input));
  assert.deepEqual(plain(h.state()), before);
});
test("legacy supplier and category upserts reject foreign IDs before any write", async () => {
  const h = await harness();
  const before = plain(h.state());
  await assert.rejects(
    h.actions.saveSuppliers({
      fiscalMonthId: 1,
      purchases: [{ supplierId: 2, amount: 50 }],
    })
  );
  await assert.rejects(
    h.actions.saveFixed({
      fiscalMonthId: 1,
      costs: [{ categoryId: 2, amount: 50 }],
    })
  );
  assert.deepEqual(plain(h.state()), before);
});
