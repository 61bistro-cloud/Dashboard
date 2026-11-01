import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

// Execute the actual server action with in-memory dependencies. No database or
// production credentials are used; failed transactions restore the mock state.
async function harness({ role = "OWNER", loggedIn = true } = {}) {
  let records = [
    { id: 1, businessId: 1, accountId: 10, fiscalMonthId: 20 },
    { id: 2, businessId: 1, accountId: 10, fiscalMonthId: 20 },
    { id: 3, businessId: 1, accountId: 11, fiscalMonthId: 20 },
    { id: 4, businessId: 1, accountId: 10, fiscalMonthId: 21 },
    { id: 5, businessId: 2, accountId: 10, fiscalMonthId: 20 },
  ];
  let openings = records.slice(1).map(({ id, ...scope }) => scope);
  let calls = 0;
  const invalidated: string[] = [];
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([key, value]: [string, any]) =>
      key === "id" ? value.in.includes(row.id) : row[key] === value
    );
  const prisma = {
    $transaction: async (fn: any) => {
      calls++;
      const beforeRecords = [...records],
        beforeOpenings = [...openings];
      try {
        return await fn({
          bankTransaction: {
            deleteMany: async ({ where }: any) => {
              const before = records.length;
              records = records.filter((row) => !matches(row, where));
              return { count: before - records.length };
            },
            count: async ({ where }: any) =>
              records.filter((row) => matches(row, where)).length,
          },
          accountOpening: {
            deleteMany: async ({ where }: any) => {
              openings = openings.filter((row) => !matches(row, where));
            },
          },
        });
      } catch (e) {
        records = beforeRecords;
        openings = beforeOpenings;
        throw e;
      }
    },
  };
  const context = vm.createContext({
    process: { env: { APPROVE_PASSWORD: "test-approval" } },
    console,
  });
  const source = ts.transpileModule(
    readFileSync(
      new URL("../app/(app)/bank/actions.ts", import.meta.url),
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
  const dependencies: Record<string, any> = {
    zod: { z },
    "@/auth": {
      auth: async () => (loggedIn ? { user: { role, id: 1 } } : null),
    },
    "@/lib/prisma": { prisma },
    "next/cache": { revalidatePath: (path: string) => invalidated.push(path) },
    "@/lib/kbank-parser": { parseKbankPdf() {}, suggestCategoryName() {} },
    "@/lib/business": { requireBusiness: async () => ({ id: 1 }) },
  };
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
    remove: (module.namespace as any).bulkDeleteTransactions,
    records: () => records,
    openings: () => openings,
    calls: () => calls,
    invalidated,
  };
}
const input = {
  fiscalMonthId: 20,
  accountId: 10,
  ids: [1, 2],
  password: "test-approval",
};

test("select all deletes only the selected business/account/month, retaining opening by default", async () => {
  const h = await harness();
  const result = await h.remove(input);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 2);
  assert.deepEqual(
    h.records().map((r) => r.id),
    [3, 4, 5]
  );
  assert.equal(h.openings().length, 4);
  assert.ok(h.invalidated.includes("/bank"));
});
test("partial selection and repeated IDs delete only those rows", async () => {
  const h = await harness();
  const result = await h.remove({ ...input, ids: [1, 1] });
  assert.equal(result.deleted, 1);
  assert.deepEqual(
    h.records().map((r) => r.id),
    [2, 3, 4, 5]
  );
});
test("cross-account, cross-month, cross-business and stale IDs roll back the entire deletion", async () => {
  for (const id of [3, 4, 5, 999]) {
    const h = await harness();
    assert.equal((await h.remove({ ...input, ids: [1, id] })).ok, false);
    assert.equal(h.records().length, 5);
    assert.equal(h.invalidated.length, 0);
  }
});
test("opening reset requires every transaction and rolls back partial deletion", async () => {
  const h = await harness();
  assert.equal(
    (await h.remove({ ...input, ids: [1], resetOpening: true })).ok,
    false
  );
  assert.equal(h.records().length, 5);
  assert.equal(h.openings().length, 4);
  assert.equal((await h.remove({ ...input, resetOpening: true })).ok, true);
  assert.equal(h.openings().length, 3);
  assert.ok(
    h
      .openings()
      .every(
        (row) =>
          row.businessId !== 1 ||
          row.accountId !== 10 ||
          row.fiscalMonthId !== 20
      )
  );
});
test("bad password and malformed selection cannot reach database mutations", async () => {
  for (const patch of [
    { password: "wrong" },
    { ids: [] },
    { ids: [-1] },
    { accountId: 0 },
    { fiscalMonthId: 0 },
    { resetOpening: "yes" },
  ]) {
    const h = await harness();
    assert.equal((await h.remove({ ...input, ...patch })).ok, false);
    assert.equal(h.calls(), 0);
  }
});
test("authentication and allowed roles are required before mutation", async () => {
  for (const options of [{ loggedIn: false }, { role: "STAFF" }]) {
    const h = await harness(options);
    await assert.rejects(h.remove(input));
    assert.equal(h.calls(), 0);
  }
  const h = await harness({ role: "ACCOUNTANT" });
  assert.equal((await h.remove(input)).ok, true);
});
