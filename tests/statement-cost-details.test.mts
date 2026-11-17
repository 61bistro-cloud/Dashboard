import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as costs from "../lib/statement-costs.ts";

async function setup(rows: any[], files: any[] = []) {
  const queries: any[] = [];
  const prisma = {
    bankTransaction: {
      findMany: async (query: any) => {
        queries.push(["transactions", query]);
        return rows.filter(
          (row) =>
            row.businessId === query.where.businessId &&
            row.fiscalMonthId === query.where.fiscalMonthId
        );
      },
    },
    driveFile: {
      findMany: async (query: any) => {
        queries.push(["files", query]);
        return files.filter(
          (file) =>
            file.businessId === query.where.businessId &&
            file.fiscalMonthId === query.where.fiscalMonthId &&
            file.refType === query.where.refType &&
            query.where.refId.in.includes(file.refId)
        );
      },
    },
  };
  const context = vm.createContext({ console });
  const code = ts.transpileModule(
    readFileSync(
      new URL("../lib/statement-cost-details.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }
  ).outputText;
  const module = new vm.SourceTextModule(code, { context });
  await module.link(async (name: string) => {
    const deps: any = {
      "@/lib/prisma": { prisma },
      "@/lib/statement-costs": costs,
    };
    const exports = deps[name];
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
    read: (module.namespace as any).getDetailedStatementExpenses,
    queries,
  };
}
const transaction = (
  id: number,
  categoryId: number | null = 1,
  withdraw = 100.25
) => ({
  id,
  businessId: 5,
  fiscalMonthId: 7,
  categoryId,
  withdraw,
  date: new Date(`2026-10-${String(id).padStart(2, "0")}T13:45:00Z`),
  description: `ซื้อวัตถุดิบ ${id}`,
  note: id === 1 ? "ค่าผัก ต้นฉบับ" : null,
  channel: "MOBILE",
  category:
    categoryId === null
      ? null
      : { id: categoryId, name: "วัตถุดิบอาหาร", kind: "EXPENSE" },
  account: { name: "Krungsri", code: "ACCT", accountType: "BANK" },
});
const file = (id: number, refId: string) => ({
  id,
  businessId: 5,
  fiscalMonthId: 7,
  refType: "BANK_TX",
  refId,
  name: `slip-${id}.jpg`,
  webViewLink: `https://drive.google.com/file/d/${id}/view`,
});

test("seven displayed costs drill down to exactly seven rows and the same total, including bank/card splits", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => transaction(i + 1));
  rows[6].account = { name: "Card", code: "CARD", accountType: "CREDIT_CARD" };
  const h = await setup(rows, [file(1, "1"), file(2, "1"), file(3, "7")]);
  const { summary, details } = await h.read(7, 5);
  assert.equal(summary.rows[0].count, 7);
  assert.equal(details.length, 7);
  assert.equal(summary.rows[0].total, 701.75);
  assert.equal(summary.rows[0].bankAmount, 601.5);
  assert.equal(summary.rows[0].cardAmount, 100.25);
  assert.equal(
    details.reduce((sum: number, row: any) => sum + row.amount, 0),
    summary.rows[0].total
  );
  assert.equal(details[0].note, "ค่าผัก ต้นฉบับ");
  assert.equal(details[0].date, "2026-10-01T13:45:00.000Z");
  assert.equal(details[0].evidence.length, 2);
  assert.equal(details[6].accountCode, "CARD");
  assert.equal(details[1].evidence.length, 0);
});
test("details include pending and excluded withdrawals but never include credits as costs", async () => {
  const pending = transaction(2, null, 20);
  const excluded = {
    ...transaction(3, 3, 50),
    category: { id: 3, name: "Transfer", kind: "TRANSFER" },
  };
  const h = await setup([
    transaction(1),
    pending,
    excluded,
    transaction(4, 1, 0),
  ]);
  const { summary, details } = await h.read(7, 5);
  assert.equal(details.length, 3);
  assert.equal(summary.pendingTotal, 20);
  assert.equal(summary.excludedTotal, 50);
  assert.equal(summary.grandTotal, 100.25);
  assert.equal(summary.withdrawalTotal, 170.25);
  for (const row of summary.rows)
    assert.equal(
      details.filter((d: any) => d.categoryId === row.categoryId).length,
      row.count
    );
});
test("transaction/evidence reads are scoped to current business, month, type and linked IDs", async () => {
  const h = await setup(
    [
      transaction(1),
      { ...transaction(2), businessId: 6 },
      { ...transaction(3), fiscalMonthId: 8 },
    ],
    [
      file(1, "1"),
      { ...file(2, "1"), businessId: 6 },
      { ...file(3, "1"), fiscalMonthId: 8 },
      { ...file(4, "1"), refType: "POS" },
      file(5, "999"),
    ]
  );
  const { details } = await h.read(7, 5);
  assert.equal(details.length, 1);
  assert.equal(details[0].evidence.length, 1);
  for (const [, query] of h.queries) {
    assert.equal(query.where.businessId, 5);
    assert.equal(query.where.fiscalMonthId, 7);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(h.queries[1][1].where.refId.in)), [
    "1",
  ]);
});
test("receipt-only and empty months retain existing statement-first semantics without unnecessary evidence reads", async () => {
  for (const rows of [[], [transaction(1, 1, 0)]]) {
    const h = await setup(rows);
    const result = await h.read(7, 5);
    assert.equal(result.summary.hasTransactions, rows.length > 0);
    assert.equal(result.details.length, 0);
    assert.equal(result.summary.grandTotal, 0);
    assert.equal(h.queries.length, 1);
  }
});
