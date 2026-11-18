import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as grab from "../lib/grab-report.ts";
import * as recon from "../lib/grab-reconciliation.ts";
import * as accounts from "../lib/bank-account-options.ts";
import { fixtureCsv } from "./fixtures/grab-csv.ts";
const original = grab.parseGrabCsv(fixtureCsv()).rows[0];
async function service() {
  const rows = [
    original,
    {
      ...original,
      transactionId: "nov-tx",
      saleDate: "2026-11-01",
      sales: 20400,
      commission: -4366,
      net: 16034,
    },
  ];
  const reports = rows.map((r, i) => ({
    id: i + 1,
    fiscalMonthId: i + 7,
    note: grab.encodeGrabReport({ version: 1, rows: [r] }),
    name: "file.csv",
    createdAt: new Date(),
    webViewLink: "https://drive.google.com/test",
  }));
  const credit = {
    id: 44,
    businessId: 2,
    fiscalMonthId: 8,
    date: new Date("2026-11-01T03:00:00Z"),
    deposit: 323.83,
    description: "Grab settlement",
    account: { code: "ACCT", name: "กรุงศรี", accountType: "BANK" },
    category: { businessId: 2, posChannel: "GRAB" },
  };
  const calls: any[] = [];
  const db = {
    driveFile: {
      findMany: async (q: any) => {
        calls.push(["reports", q]);
        assert.equal(q.where.businessId, 2);
        assert.equal(q.where.kind, "GRAB_REPORT");
        return reports;
      },
    },
    posBill: {
      findMany: async (q: any) => {
        calls.push(["pos", q]);
        assert.equal(q.where.businessId, 2);
        return [
          {
            id: "POS1",
            businessDate: "2026-10-31",
            netAmount: 208,
            grandTotal: 208,
            channel: "Grab",
            paymentType: "Cash",
            invoiceNo: null,
            note: null,
          },
        ];
      },
    },
    bankTransaction: {
      findMany: async (q: any) => {
        calls.push(["bank", q]);
        assert.equal(q.where.businessId, 2);
        assert.equal(q.where.account.businessId, 2);
        return [
          credit,
          {
            ...credit,
            id: 45,
            account: { code: "CASH", name: "Cash", accountType: "BANK" },
          },
        ];
      },
    },
  };
  const context = vm.createContext({ Date, console });
  const deps: any = {
    "server-only": {},
    "./prisma": { prisma: db },
    "./grab-report": grab,
    "./grab-reconciliation": recon,
    "./bank-account-options": accounts,
  };
  const code = ts.transpileModule(
    readFileSync(new URL("../lib/grab-data.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const m = new vm.SourceTextModule(code, { context });
  await m.link(async (name) => {
    const exp = deps[name];
    assert.ok(exp, name);
    return new vm.SyntheticModule(
      Object.keys(exp),
      function () {
        for (const k of Object.keys(exp)) this.setExport(k, exp[k]);
      },
      { context }
    );
  });
  await m.evaluate();
  return { get: (m.namespace as any).getGrabMonth, calls, reports };
}
test("sales-month view reconciles the full known cross-month payout and links its actual bank month", async () => {
  const h = await service();
  const d = await h.get(2, {
    id: 7,
    calendarYear: 2026,
    calendarMonth: 10,
    daysInMonth: 31,
  });
  assert.equal(d.rows.length, 1);
  assert.equal(d.crossMonth, 16349);
  assert.equal(d.receivedInMonth, 0);
  assert.equal(d.reports.length, 1);
  assert.ok(!("note" in d.reports[0]));
  assert.equal(d.payouts.length, 1);
  assert.equal(d.payouts[0].count, 2);
  assert.equal(d.payouts[0].net, 32383);
  assert.equal(d.payouts[0].status, "suggested");
  assert.equal(d.payouts[0].candidates.length, 1);
  assert.equal(d.payouts[0].candidates[0].fiscalMonthId, 8);
  assert.equal(
    h.calls.find((c) => c[0] === "pos")[1].where.businessDate.lte,
    "2026-10-31"
  );
  const bank = h.calls.find((c) => c[0] === "bank")[1];
  assert.equal(bank.where.date.gte.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(bank.where.date.lt.toISOString(), "2026-11-02T00:00:00.000Z");
});
test("corrupted durable report metadata is surfaced instead of silently reporting zero", async () => {
  const h = await service();
  h.reports[0].note = "GRAB_REPORT_V1:broken";
  await assert.rejects(
    () =>
      h.get(2, {
        id: 7,
        calendarYear: 2026,
        calendarMonth: 10,
        daysInMonth: 31,
      }),
    /grab.stored/
  );
});
