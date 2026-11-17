import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
async function harness(role = "OWNER") {
  let state = {
    bills: [
      { businessId: 1, id: "bill1", netAmount: 10, importBatchId: 1 },
      { businessId: 2, id: "bill1", netAmount: 999, importBatchId: 2 },
    ],
    batches: [
      { id: 1, businessId: 1 },
      { id: 2, businessId: 2 },
    ] as any[],
  };
  let fail = false,
    parseCalls = 0;
  const invalidated: string[] = [];
  const tx: any = {
    posBill: {
      findMany: async ({ where }: any) =>
        state.bills.filter(
          (b) => b.businessId === where.businessId && where.id.in.includes(b.id)
        ),
      upsert: async ({ where, update, create }: any) => {
        if (fail && create.id === "bill101")
          throw Error("simulated later-chunk failure");
        const key = where.businessId_id;
        const row = state.bills.find(
          (b) => b.businessId === key.businessId && b.id === key.id
        );
        if (row) Object.assign(row, update);
        else state.bills.push(create);
      },
    },
    posImportBatch: {
      create: async ({ data }: any) => {
        const row = { id: 3, ...data };
        state.batches.push(row);
        return row;
      },
      update: async ({ where, data }: any) =>
        Object.assign(
          state.batches.find((b) => b.id === where.id),
          data
        ),
    },
  };
  const prisma = {
    $transaction: async (fn: any, options: any) => {
      assert.equal(options.isolationLevel, "Serializable");
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
    "@/auth": {
      auth: async () =>
        role === "NONE" ? null : { user: { id: "user1", role } },
    },
    "@/lib/business": { requireBusiness: async () => ({ id: 1 }) },
    "@/lib/prisma": { prisma },
    "@/lib/foodstory-parser": {
      parseFoodstoryBuffer: () => {
        parseCalls++;
        return {
          rows: Array.from({ length: 150 }, (_, i) => ({
            id: "bill" + (i + 1),
            netAmount: 100,
            businessDate: "2026-10-01",
          })),
          errors: [],
          totalDataRows: 150,
        };
      },
    },
    "next/cache": { revalidatePath: (p: string) => invalidated.push(p) },
  };
  const context = vm.createContext({
    console,
    File,
    FormData,
    process: { env: {} },
  });
  const code = ts.transpileModule(
    readFileSync(
      new URL("../app/(app)/pos-sales/actions.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const m = new vm.SourceTextModule(code, { context });
  await m.link(async (name: string) => {
    const exports = dependencies[name];
    assert.ok(exports, name);
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const k of Object.keys(exports)) this.setExport(k, exports[k]);
      },
      { context }
    );
  });
  await m.evaluate();
  const run = (businessId = 1) => {
    const fd = new FormData();
    fd.set("businessId", String(businessId));
    fd.set("file", new File(["fixture"], "sales.xlsx"));
    return (m.namespace as any).importPosBills(fd);
  };
  return {
    run,
    state: () => state,
    fail: () => {
      fail = true;
    },
    invalidated,
    parseCalls: () => parseCalls,
  };
}
test("POS import saves all chunks atomically and reimports without duplicating bills", async () => {
  const h = await harness();
  const result = await h.run();
  assert.equal(result.ok, true);
  assert.equal(result.inserted, 149);
  assert.equal(result.updated, 1);
  assert.equal(h.state().bills.length, 151);
  assert.equal(h.state().bills.find((b) => b.businessId === 2)!.netAmount, 999);
  const again = await h.run();
  assert.equal(again.inserted, 0);
  assert.equal(again.updated, 150);
  assert.equal(h.state().bills.length, 151);
  assert.ok(h.invalidated.includes("/cost-setup"));
  assert.ok(h.invalidated.includes("/monthly-pl"));
});
test("a later chunk failure restores original bills and leaves no partial batch or report refresh", async () => {
  const h = await harness();
  const before = structuredClone(h.state());
  h.fail();
  const result = await h.run();
  assert.equal(result.ok, false);
  assert.deepEqual(h.state(), before);
  assert.deepEqual(h.invalidated, []);
});
test("an old tab targeting a different business cannot parse or write POS data", async () => {
  const h = await harness();
  const before = structuredClone(h.state());
  assert.equal((await h.run(2)).ok, false);
  assert.deepEqual(h.state(), before);
  assert.equal(h.parseCalls(), 0);
});
test("staff and unauthenticated users cannot import POS sales", async () => {
  for (const role of ["STAFF", "NONE"]) {
    const h = await harness(role);
    const before = structuredClone(h.state());
    assert.equal((await h.run()).ok, false);
    assert.deepEqual(h.state(), before);
    assert.equal(h.parseCalls(), 0);
  }
});
