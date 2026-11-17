import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { z } from "zod";
import * as payrollVersion from "../lib/payroll-revision.ts";
import * as crypto from "node:crypto";
import * as plan from "../lib/cost-plan.ts";
import * as flexible from "../lib/flexible-costs.ts";

const plain = (v: any) => JSON.parse(JSON.stringify(v));
const matches = (row: any, where: any): boolean =>
  Object.entries(where ?? {}).every(([key, value]: any) =>
    value && typeof value === "object"
      ? "in" in value
        ? value.in.includes(row[key])
        : matches(row[key], value)
      : row[key] === value
  );
async function harness(role = "OWNER") {
  let state = {
    suppliers: [
      {
        id: 1,
        businessId: 1,
        name: "Makro",
        category: "FOOD",
        active: true,
        sortOrder: 1,
      },
      {
        id: 2,
        businessId: 2,
        name: "Foreign",
        category: "FOOD",
        active: true,
        sortOrder: 1,
      },
    ],
    purchases: [
      {
        id: 1,
        businessId: 1,
        supplierId: 1,
        fiscalMonthId: 5,
        amount: 100,
        nameOverride: null,
      },
      {
        id: 2,
        businessId: 1,
        supplierId: 1,
        fiscalMonthId: 6,
        amount: 70,
        nameOverride: null,
      },
    ],
    categories: [
      {
        id: 10,
        businessId: 1,
        name: "ค่าเช่า",
        icon: "home",
        active: true,
        sortOrder: 1,
      },
      {
        id: 11,
        businessId: 1,
        name: "น้ำยาล้างจาน",
        icon: "cost-setup:other",
        active: true,
        sortOrder: 2,
      },
      {
        id: 12,
        businessId: 1,
        name: "Holiday extra",
        icon: "cost-setup:payroll-extra",
        active: true,
        sortOrder: 3,
      },
    ],
    costs: [
      { id: 1, businessId: 1, categoryId: 10, fiscalMonthId: 5, amount: 200 },
      { id: 2, businessId: 1, categoryId: 10, fiscalMonthId: 6, amount: 250 },
      { id: 3, businessId: 1, categoryId: 11, fiscalMonthId: 5, amount: 30 },
      { id: 4, businessId: 1, categoryId: 12, fiscalMonthId: 5, amount: 20 },
    ],
    employees: [
      {
        id: 1,
        businessId: 1,
        name: "Employee",
        shortName: null,
        active: true,
        sortOrder: 1,
      },
    ],
    payroll: [
      {
        id: 1,
        businessId: 1,
        employeeId: 1,
        fiscalMonthId: 5,
        amount: 300,
        nameOverride: null,
      },
      {
        id: 2,
        businessId: 1,
        employeeId: 1,
        fiscalMonthId: 6,
        amount: 310,
        nameOverride: null,
      },
    ],
    extras: [
      { id: 1, businessId: 1, fiscalMonthId: 5, type: "OT", amount: 10 },
    ],
    fail: false,
    closed: false,
  };
  const invalidated: string[] = [];
  const find =
    (key: keyof typeof state) =>
    async ({ where }: any) =>
      (state[key] as any[]).filter((r) => matches(r, where));
  const db: any = {
    monthlyClosing: {
      findUnique: async () => (state.closed ? { status: "CLOSED" } : null),
    },
    fiscalMonth: {
      findUnique: async ({ where }: any) =>
        [5, 6].includes(where.id) ? { id: where.id } : null,
    },
    employee: { findMany: find("employees") },
    employeePayroll: { findMany: find("payroll") },
    payrollExtra: { findMany: find("extras") },
    supplier: {
      findMany: find("suppliers"),
      update: async ({ where, data }: any) => {
        const r = state.suppliers.find((r) => matches(r, where));
        assert.ok(r);
        Object.assign(r, data);
        return r;
      },
    },
    supplierPurchase: {
      findMany: find("purchases"),
      upsert: async ({ where, update, create }: any) => {
        const r = state.purchases.find((r) =>
          matches(r, where.supplierId_fiscalMonthId)
        );
        if (r) Object.assign(r, update);
        else
          state.purchases.push({ id: 100 + state.purchases.length, ...create });
      },
      deleteMany: async ({ where }: any) => {
        state.purchases = state.purchases.filter((r) => !matches(r, where));
      },
    },
    fixedCostCategory: {
      findMany: find("categories"),
      update: async ({ where, data }: any) => {
        const r = state.categories.find((r) => matches(r, where));
        assert.ok(r);
        Object.assign(r, data);
        return r;
      },
      create: async ({ data }: any) => {
        if (
          state.categories.some(
            (c) => c.businessId === data.businessId && c.name === data.name
          )
        )
          throw Error("Duplicate name");
        const r = {
          id: Math.max(0, ...state.categories.map((c) => c.id)) + 1,
          ...data,
        };
        state.categories.push(r);
        return r;
      },
      upsert: async ({ where, update, create }: any) => {
        const r = state.categories.find((r) =>
          matches(r, where.businessId_name)
        );
        if (r) {
          Object.assign(r, update);
          return r;
        }
        return db.fixedCostCategory.create({ data: create });
      },
    },
    fixedCost: {
      findMany: find("costs"),
      upsert: async ({ where, update, create }: any) => {
        if (state.fail) throw Error("Database failure");
        const r = state.costs.find((r) =>
          matches(r, where.categoryId_fiscalMonthId)
        );
        if (r) Object.assign(r, update);
        else state.costs.push({ id: 100 + state.costs.length, ...create });
      },
      deleteMany: async ({ where }: any) => {
        state.costs = state.costs.filter((r) => !matches(r, where));
      },
    },
  };
  db.$transaction = async (fn: any) => {
    const before = structuredClone(state);
    try {
      return await fn(db);
    } catch (e) {
      state = before;
      throw e;
    }
  };
  const context = vm.createContext({ console }),
    modules = new Map<string, vm.Module>();
  const dependencies: any = {
    "node:crypto": crypto,
    zod: { z },
    "@/auth": {
      auth: async () => (role === "NONE" ? null : { user: { role } }),
    },
    "@/lib/business": { requireBusiness: async () => ({ id: 1 }) },
    "@/lib/prisma": { prisma: db },
    "next/cache": { revalidatePath: (p: string) => invalidated.push(p) },
    "@/lib/cost-plan": plan,
    "./cost-plan": plan,
    "./flexible-costs": flexible,
    "./payroll-revision": payrollVersion,
  };
  async function load(name: string): Promise<vm.Module> {
    if (modules.has(name)) return modules.get(name)!;
    if (dependencies[name]) {
      const exports = dependencies[name];
      const m = new vm.SyntheticModule(
        Object.keys(exports),
        function () {
          for (const k of Object.keys(exports)) this.setExport(k, exports[k]);
        },
        { context }
      );
      modules.set(name, m);
      return m;
    }
    const path =
      name === "@/lib/manual-cost-data"
        ? "../lib/manual-cost-data.ts"
        : "../app/(app)/cost-setup/manual-actions.ts";
    const code = ts.transpileModule(
      readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }
    ).outputText;
    const m = new vm.SourceTextModule(code, { context });
    modules.set(name, m);
    await m.link(load);
    return m;
  }
  const actions = await load("actions");
  await actions.evaluate();
  const reader = modules.get("@/lib/manual-cost-data")!;
  return {
    state: () => state,
    read: (month = 5) =>
      (reader.namespace as any).getManualCostData(1, month, db),
    save: (actions.namespace as any).saveManualCostPlan,
    invalidated,
  };
}

test("five COGS groups and four OPEX groups classify exactly once, including supplier overrides", () => {
  assert.equal(plan.COST_GROUPS.filter((g) => g.section === "cogs").length, 5);
  assert.equal(plan.COST_GROUPS.filter((g) => g.section === "opex").length, 4);
  assert.equal(
    plan.categoryBucket({ icon: plan.GROUP_MARKER + "freight" }),
    "food"
  );
  assert.equal(
    plan.categoryBucket({ icon: plan.GROUP_MARKER + "condiments" }),
    "food"
  );
  assert.equal(plan.categoryGroup({ name: "น้ำยาล้างจาน" }), "admin");
  assert.equal(plan.categoryGroup({ name: "ค่าน้ำประปา" }), "occupancy");
  assert.equal(plan.categoryGroup({ name: "ค่า GP และ Ads" }), "selling");
  assert.equal(plan.categoryGroup({ name: "ประกันสังคม" }), "labor");
  const overrides = plan.supplierGroups([
    { icon: plan.SUPPLIER_GROUP_MARKER + "1:condiments" },
  ]);
  assert.equal(
    plan.supplierGroup({ id: 1, category: "FOOD" }, overrides),
    "condiments"
  );
});
test("legacy manual rows and payroll are read without migration writes or duplicate extra pay", async () => {
  const h = await harness(),
    before = plain(h.state()),
    data = await h.read();
  assert.equal(data.items.length, 3);
  assert.equal(data.laborBase, 300);
  assert.equal(data.legacyLaborExtra, 30);
  assert.equal(
    data.items.reduce((s: number, r: any) => s + r.amount, 0),
    330
  );
  assert.deepEqual(plain(h.state()), before);
});
test("saving adds freight/social security, reclassifies existing suppliers, and preserves other months", async () => {
  const h = await harness(),
    data = await h.read();
  const items = data.items
    .filter((r: any) => r.id !== 11)
    .map((r: any) =>
      r.source === "supplier"
        ? { ...r, group: "condiments" }
        : { ...r, name: "ค่าเช่าใหม่", amount: 220 }
    );
  items.push(
    {
      source: "category",
      name: "ค่าส่งวัตถุดิบ",
      amount: 50,
      group: "freight",
    },
    { source: "category", name: "ประกันสังคม", amount: 40, group: "labor" }
  );
  const result = await h.save({
    businessId: 1,
    fiscalMonthId: 5,
    revision: data.revision,
    items,
  });
  assert.equal(result.ok, true, result.message);
  const after = await h.read();
  assert.equal(
    after.items.reduce((s: number, r: any) => s + r.amount, 0) +
      after.laborBase +
      after.legacyLaborExtra,
    740
  );
  assert.equal(
    h.state().purchases.find((p) => p.fiscalMonthId === 6)!.amount,
    70
  );
  assert.equal(
    h.state().costs.find((c) => c.categoryId === 10 && c.fiscalMonthId === 6)!
      .amount,
    250
  );
  assert.equal(h.state().categories.find((c) => c.id === 11)!.active, false);
  assert.equal(
    h.state().costs.some((c) => c.categoryId === 11 && c.fiscalMonthId === 5),
    false
  );
  assert.ok(
    h
      .state()
      .categories.some(
        (c) => c.icon === plan.SUPPLIER_GROUP_MARKER + "1:condiments"
      )
  );
  assert.equal(
    (await h.read(6)).items.find((r: any) => r.source === "supplier").group,
    "condiments"
  );
  assert.notEqual(result.revision, data.revision);
  assert.equal(
    (
      await h.save({
        businessId: 1,
        fiscalMonthId: 5,
        revision: data.revision,
        items,
      })
    ).ok,
    false
  );
  for (const p of ["/", "/daily-pl", "/monthly-pl", "/closing-print"])
    assert.ok(h.invalidated.includes(p));
});
test("supplier costs can move from COGS to operating supplies without copying amounts", async () => {
  const h = await harness(),
    data = await h.read();
  const items = data.items.map((r: any) =>
    r.source === "supplier" ? { ...r, group: "admin" } : r
  );
  assert.equal(
    (
      await h.save({
        businessId: 1,
        fiscalMonthId: 5,
        revision: data.revision,
        items,
      })
    ).ok,
    true
  );
  const after = await h.read();
  assert.equal(
    after.items.filter((r: any) => r.source === "supplier").length,
    1
  );
  assert.equal(
    after.items.find((r: any) => r.source === "supplier").group,
    "admin"
  );
});
test("foreign IDs, invalid values, duplicate IDs, stale revisions and business changes cannot write", async () => {
  const h = await harness(),
    data = await h.read();
  const base = {
    businessId: 1,
    fiscalMonthId: 5,
    revision: data.revision,
    items: data.items,
  };
  const before = plain(h.state());
  for (const input of [
    { ...base, businessId: 2 },
    { ...base, revision: "0".repeat(64) },
    {
      ...base,
      items: [
        { id: 2, source: "supplier", name: "Foreign", amount: 1, group: "raw" },
      ],
    },
    { ...base, items: [...data.items, data.items[0]] },
    {
      ...base,
      items: [{ source: "category", name: "", amount: 1, group: "raw" }],
    },
    {
      ...base,
      items: [{ source: "category", name: "Bad", amount: -1, group: "raw" }],
    },
    {
      ...base,
      items: [{ source: "category", name: "Bad", amount: NaN, group: "raw" }],
    },
  ]) {
    assert.equal((await h.save(input)).ok, false);
    assert.deepEqual(plain(h.state()), before);
  }
});
test("a failed save rolls back amounts, category edits and classification metadata", async () => {
  const h = await harness(),
    data = await h.read();
  h.state().fail = true;
  const before = plain(h.state());
  const items = data.items.map((r: any) => ({
    ...r,
    amount: r.amount + 50,
    group: r.source === "supplier" ? "condiments" : r.group,
  }));
  assert.equal(
    (
      await h.save({
        businessId: 1,
        fiscalMonthId: 5,
        revision: data.revision,
        items,
      })
    ).ok,
    false
  );
  assert.deepEqual(plain(h.state()), before);
});
test("staff and unauthenticated users cannot save costs", async () => {
  for (const role of ["STAFF", "NONE"]) {
    const h = await harness(role),
      data = await h.read(),
      before = plain(h.state());
    assert.equal(
      (
        await h.save({
          businessId: 1,
          fiscalMonthId: 5,
          revision: data.revision,
          items: [],
        })
      ).ok,
      false
    );
    assert.deepEqual(plain(h.state()), before);
  }
});

test("closed months reject the entire cost plan without mutation", async () => {
  const h = await harness();
  h.state().closed = true;
  const before = plain(h.state());
  const current = await h.read();
  const result = await h.save({
    businessId: 1,
    fiscalMonthId: 5,
    revision: current.revision,
    items: current.items,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(plain(h.state()), before);
});
