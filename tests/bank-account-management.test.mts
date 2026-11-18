import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as crypto from "node:crypto";
import * as options from "../lib/bank-account-options.ts";

const plain = (v: any) => JSON.parse(JSON.stringify(v));
const matches = (row: any, where: any): boolean =>
  Object.entries(where).every(([key, value]: any) =>
    value && typeof value === "object"
      ? "in" in value
        ? value.in.includes(row[key])
        : "not" in value
          ? row[key] !== value.not
          : matches(row[key], value)
      : row[key] === value
  );
async function load(
  file: string,
  dependencies: Record<string, any>,
  env: any = {}
) {
  const context = vm.createContext({
    console,
    File,
    FormData,
    process: { env },
  });
  const code = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const module = new vm.SourceTextModule(code, { context });
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
  return module.namespace as any;
}
async function harness(role = "OWNER") {
  let state = {
    accounts: [
      {
        id: 10,
        businessId: 1,
        name: "Kbank",
        code: "KBANK",
        accountType: "BANK",
        active: true,
        sortOrder: 1,
      },
      {
        id: 11,
        businessId: 1,
        name: "Hidden",
        code: "SCB",
        accountType: "BANK",
        active: false,
        sortOrder: 2,
      },
      {
        id: 20,
        businessId: 2,
        name: "Foreign",
        code: "KBANK",
        accountType: "BANK",
        active: true,
        sortOrder: 1,
      },
    ],
    transactions: [
      { id: 1, businessId: 1, accountId: 10, fiscalMonthId: 5, withdraw: 100 },
      { id: 2, businessId: 1, accountId: 10, fiscalMonthId: 6, withdraw: 200 },
      { id: 3, businessId: 1, accountId: 11, fiscalMonthId: 5, withdraw: 50 },
      { id: 4, businessId: 2, accountId: 20, fiscalMonthId: 5, withdraw: 80 },
    ],
    openings: [
      { id: 1, businessId: 1, accountId: 10, fiscalMonthId: 5, amount: 500 },
      { id: 2, businessId: 2, accountId: 20, fiscalMonthId: 5, amount: 500 },
    ],
    files: [
      {
        id: 1,
        businessId: 1,
        refType: "BANK_TX",
        refId: "1",
        note: 'OCR retained\nEVIDENCE_AUTO_V1:{"transactionId":1}',
      },
      { id: 2, businessId: 1, refType: "BANK_TX", refId: "2", note: "OCR 2" },
      {
        id: 3,
        businessId: 1,
        refType: "BANK_TX",
        refId: "3",
        note: "Unrelated",
      },
      { id: 4, businessId: 2, refType: "BANK_TX", refId: "1", note: "Foreign" },
    ],
    closed: false,
    fail: false,
  };
  const invalidations: string[] = [];
  const tx: any = {
    bankAccount: {
      findFirst: async ({ where }: any) =>
        state.accounts.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }: any) =>
        state.accounts.filter((r) => matches(r, where)),
      create: async ({ data }: any) => {
        state.accounts.push({ id: 30 + state.accounts.length, ...data });
      },
      delete: async ({ where }: any) => {
        state.accounts = state.accounts.filter((r) => !matches(r, where));
      },
    },
    bankTransaction: {
      findMany: async ({ where }: any) =>
        state.transactions.filter((r) => matches(r, where)),
      count: async ({ where }: any) =>
        state.transactions.filter((r) => matches(r, where)).length,
      deleteMany: async ({ where }: any) => {
        if (state.fail) throw Error("Simulated database failure");
        const count = state.transactions.filter((r) =>
          matches(r, where)
        ).length;
        state.transactions = state.transactions.filter(
          (r) => !matches(r, where)
        );
        return { count };
      },
    },
    accountOpening: {
      findMany: async ({ where }: any) =>
        state.openings.filter((r) => matches(r, where)),
      count: async ({ where }: any) =>
        state.openings.filter((r) => matches(r, where)).length,
      deleteMany: async ({ where }: any) => {
        const count = state.openings.filter((r) => matches(r, where)).length;
        state.openings = state.openings.filter((r) => !matches(r, where));
        return { count };
      },
    },
    driveFile: {
      findMany: async ({ where }: any) =>
        state.files.filter((r) => matches(r, where)),
      update: async ({ where, data }: any) => {
        Object.assign(state.files.find((r) => r.id === where.id)!, data);
      },
    },
    monthlyClosing: { count: async () => (state.closed ? 1 : 0) },
  };
  const prisma = {
    $transaction: async (fn: any) => {
      const original = structuredClone(state);
      try {
        return await fn(tx);
      } catch (e) {
        state = original;
        throw e;
      }
    },
  };
  const actions = await load(
    "../app/(app)/bank/account-actions.ts",
    {
      "node:crypto": crypto,
      zod: { z },
      "@/auth": {
        auth: async () => (role === "NONE" ? null : { user: { role } }),
      },
      "@/lib/prisma": { prisma },
      "@/lib/business": { requireBusiness: async () => ({ id: 1 }) },
      "next/cache": { revalidatePath: (p: string) => invalidations.push(p) },
      "@/lib/bank-account-options": options,
    },
    { DELETE_PASSWORD: "test-delete", APPROVE_PASSWORD: "test-approval" }
  );
  return { state: () => state, actions, invalidations };
}
const scope = { businessId: 1, id: 10 };
test("only supported templates can create accounts; multiple bank accounts get distinct codes", async () => {
  const h = await harness();
  const before = plain(h.state());
  assert.equal(
    (await h.actions.addBankAccount({ businessId: 1, kind: "BANGKOK" })).ok,
    false
  );
  assert.equal(
    (
      await h.actions.addBankAccount({
        businessId: 1,
        name: "Anything",
        accountType: "BANK",
      })
    ).ok,
    false
  );
  assert.deepEqual(plain(h.state()), before);
  for (const kind of [
    "KBANK",
    "SCB",
    "KRUNGSRI",
    "KTB",
    "BBL",
    "CASH",
    "GRAB",
    "LINEMAN",
    "SHOPEEFOOD",
    "DELIVERY",
  ])
    assert.equal(
      (await h.actions.addBankAccount({ businessId: 1, kind })).ok,
      true
    );
  assert.ok(h.state().accounts.some((a) => a.code === "KBANK2"));
  assert.ok(h.state().accounts.some((a) => a.code === "SCB2"));
  assert.ok(h.state().accounts.some((a) => a.code === "KTB"));
  assert.ok(h.state().accounts.some((a) => a.code === "BBL"));
});
test("deletion requires the deletion password and explicit preview token, even for empty accounts", async () => {
  const h = await harness();
  const preview = await h.actions.previewAccountDeletion(scope);
  const before = plain(h.state());
  assert.equal(preview.transactions, 2);
  assert.equal(preview.openings, 1);
  assert.equal(preview.evidence, 2);
  assert.equal(preview.months, 2);
  for (const password of ["", "wrong", "test-approval"])
    assert.equal(
      (
        await h.actions.deleteBankAccount({
          ...scope,
          password,
          token: preview.token,
        })
      ).ok,
      false
    );
  assert.equal(
    (
      await h.actions.deleteBankAccount({
        ...scope,
        password: "test-delete",
        token: "x",
      })
    ).ok,
    false
  );
  assert.deepEqual(plain(h.state()), before);
});
test("confirmed deletion removes all months' transactions and openings, unlinks evidence and preserves other businesses", async () => {
  const h = await harness();
  const preview = await h.actions.previewAccountDeletion(scope);
  const result = await h.actions.deleteBankAccount({
    ...scope,
    password: "test-delete",
    token: preview.token,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 2);
  assert.deepEqual(
    h.state().transactions.map((r) => r.id),
    [3, 4]
  );
  assert.deepEqual(
    h.state().openings.map((r) => r.id),
    [2]
  );
  assert.deepEqual(
    h.state().accounts.map((r) => r.id),
    [11, 20]
  );
  assert.equal(h.state().files.length, 4);
  assert.equal(h.state().files[0].refId, null);
  assert.equal(h.state().files[0].refType, null);
  assert.equal(h.state().files[0].note, "OCR retained");
  assert.equal(h.state().files[2].refId, "3");
  assert.equal(h.state().files[3].refId, "1");
  for (const path of [
    "/bank",
    "/bank/evidence",
    "/cost-setup",
    "/",
    "/daily-pl",
    "/monthly-pl",
  ])
    assert.ok(h.invalidations.includes(path));
});
test("stale previews, closed months and database failures leave all records intact", async () => {
  for (const change of ["stale", "closed", "failure"] as const) {
    const h = await harness();
    let preview = await h.actions.previewAccountDeletion(scope);
    if (change === "stale") h.state().transactions[0].withdraw++;
    if (change === "closed") {
      h.state().closed = true;
      preview = await h.actions.previewAccountDeletion(scope);
    }
    if (change === "failure") h.state().fail = true;
    const before = plain(h.state());
    assert.equal(
      (
        await h.actions.deleteBankAccount({
          ...scope,
          password: "test-delete",
          token: preview.token,
        })
      ).ok,
      false
    );
    assert.deepEqual(plain(h.state()), before);
  }
});
test("cross-business IDs, changed business and unauthorized roles cannot preview or delete", async () => {
  for (const role of ["OWNER", "STAFF", "NONE"]) {
    const h = await harness(role);
    const before = plain(h.state());
    for (const input of [
      { businessId: 1, id: 20 },
      { businessId: 2, id: 20 },
    ])
      assert.equal((await h.actions.previewAccountDeletion(input)).ok, false);
    if (role !== "OWNER") {
      assert.equal((await h.actions.previewAccountDeletion(scope)).ok, false);
      assert.equal(
        (await h.actions.addBankAccount({ businessId: 1, kind: "CASH" })).ok,
        false
      );
    }
    assert.deepEqual(plain(h.state()), before);
  }
});
test("inconsistent foreign child rows block cascade deletion; hidden legacy accounts are explicitly deletable", async () => {
  const h = await harness();
  h.state().transactions.push({
    id: 99,
    businessId: 2,
    accountId: 10,
    fiscalMonthId: 5,
    withdraw: 1,
  });
  assert.equal((await h.actions.previewAccountDeletion(scope)).ok, false);
  const hiddenScope = { businessId: 1, id: 11 };
  const preview = await h.actions.previewAccountDeletion(hiddenScope);
  assert.equal(
    (
      await h.actions.deleteBankAccount({
        ...hiddenScope,
        password: "test-delete",
        token: preview.token,
      })
    ).ok,
    true
  );
  assert.ok(h.state().accounts.some((a) => a.id === 10));
});
test("account classification preserves supported legacy banks and keeps cash/delivery/manual/credit separate", () => {
  assert.equal(
    options.supportsStatement({
      code: "KBANK2",
      name: "x",
      accountType: "BANK",
    }),
    true
  );
  assert.equal(
    options.supportsStatement({
      code: "ACCT",
      name: "กรุงศรี",
      accountType: "BANK",
    }),
    true
  );
  for (const account of [
    { code: "BBL", name: "ธนาคารกรุงเทพ", accountType: "BANK" },
    { code: "BBL2", name: "Custom name", accountType: "BANK" },
    { code: "ACCT", name: "กรุงเทพ", accountType: "BANK" },
    { code: "KTB", name: "ธนาคารกรุงไทย", accountType: "BANK" },
    { code: "KTB2", name: "Custom name", accountType: "BANK" },
    { code: "ACCT", name: "กรุงไทย", accountType: "BANK" },
  ])
    assert.equal(options.supportsStatement(account), true);
  for (const code of ["CASH", "GRAB", "DELIVERY", "ACCT", "BANGKOK"])
    assert.equal(
      options.supportsStatement({ code, name: "Bank", accountType: "BANK" }),
      false
    );
  assert.equal(
    options.supportsStatement({
      code: "KBANK",
      name: "Bank",
      accountType: "CREDIT_CARD",
    }),
    false
  );
  assert.equal(
    options.rowsMatchMonth([{ date: "2025-02-01" }], {
      calendarYear: 2026,
      calendarMonth: 8,
      daysInMonth: 31,
    }),
    false
  );
  assert.equal(
    options.rowsMatchMonth([{ date: "2026-08-31" }], {
      calendarYear: 2026,
      calendarMonth: 8,
      daysInMonth: 31,
    }),
    true
  );
});

test("statement actions reject unsupported accounts, wrong issuing banks and wrong months before writing", async () => {
  let writes = 0,
    issuingBank = "KBANK",
    rowDate = "2026-08-01";
  let account = {
    id: 10,
    businessId: 1,
    active: true,
    code: "KBANK",
    name: "Bank",
    accountType: "BANK",
  };
  const actions = await load("../app/(app)/bank/actions.ts", {
    zod: { z },
    "@/auth": { auth: async () => ({ user: { role: "OWNER", id: "owner" } }) },
    "@/lib/prisma": {
      prisma: {
        bankAccount: {
          findFirst: async ({ where }: any) =>
            matches(account, where) ? account : null,
        },
        fiscalMonth: {
          findUnique: async ({ where }: any) =>
            where.id === 5
              ? { calendarYear: 2026, calendarMonth: 8, daysInMonth: 31 }
              : null,
        },
        transactionCategory: { findMany: async () => [], count: async () => 0 },
        bankTransaction: {
          findMany: async () => [],
          create: async () => {
            writes++;
          },
          createMany: async ({ data }: any) => {
            writes += data.length;
            return { count: data.length };
          },
        },
      },
    },
    "@/lib/business": { requireBusiness: async () => ({ id: 1 }) },
    "next/cache": { revalidatePath() {} },
    "@/lib/bank-account-options": options,
    "@/lib/kbank-parser": {
      parseKbankPdf: async () => ({
        ok: true,
        bank: issuingBank,
        rows: [
          {
            date: rowDate,
            time: "10:00",
            description: "test",
            deposit: 0,
            withdraw: 10,
            balance: 100,
            channel: "MOBILE",
          },
        ],
        rawText: [],
      }),
      suggestCategoryName: () => null,
    },
  });
  const parse = () => {
    const form = new FormData();
    form.set("accountId", "10");
    form.set("fiscalMonthId", "5");
    form.set("file", new File(["pdf"], "statement.pdf"));
    return actions.parseStatementPdf(form);
  };
  const input = () => ({
    fiscalMonthId: 5,
    accountId: 10,
    rows: [
      {
        date: rowDate,
        description: "test",
        deposit: 0,
        withdraw: 10,
        categoryId: null,
      },
    ],
  });
  rowDate = "2025-02-01";
  assert.equal((await parse()).ok, false);
  assert.equal((await actions.importStatementRows(input())).ok, false);
  rowDate = "2026-08-01";
  issuingBank = "SCB";
  assert.equal((await parse()).ok, false);
  issuingBank = "KBANK";
  account.code = "CASH";
  assert.equal((await parse()).ok, false);
  assert.equal((await actions.importStatementRows(input())).ok, false);
  account.code = "KBANK";
  account.businessId = 2;
  assert.equal((await actions.importStatementRows(input())).ok, false);
  assert.equal(writes, 0);
  account.businessId = 1;
  assert.equal((await parse()).ok, true);
  assert.equal((await actions.importStatementRows(input())).ok, true);
  assert.equal(writes, 1);
  account.code = "KTB";
  assert.equal((await parse()).ok, false);
  issuingBank = "KTB";
  assert.equal((await parse()).ok, true);
  account.code = "KBANK";
  assert.equal((await parse()).ok, false);
  issuingBank = "BBL";
  assert.equal((await parse()).ok, false);
  account.code = "BBL";
  assert.equal((await parse()).ok, true);
  issuingBank = "SCB";
  assert.equal((await parse()).ok, false);
  account.code = "KBANK";
  issuingBank = "KBANK";
  for (const code of ["CASH", "GRAB", "DELIVERY"]) {
    account.code = code;
    await actions.addTransaction({
      ...input(),
      date: rowDate,
      description: "Manual",
      deposit: 0,
      withdraw: 50,
      categoryId: null,
    });
  }
  assert.equal(writes, 4);
  await assert.rejects(
    actions.addTransaction({
      ...input(),
      date: "2025-02-01",
      description: "Wrong month",
      deposit: 0,
      withdraw: 50,
      categoryId: null,
    })
  );
  account.businessId = 2;
  await assert.rejects(
    actions.addTransaction({
      ...input(),
      date: rowDate,
      description: "Foreign",
      deposit: 0,
      withdraw: 50,
      categoryId: null,
    })
  );
  await assert.rejects(
    actions.setOpeningBalance({ fiscalMonthId: 5, accountId: 10, amount: 100 })
  );
  assert.equal(writes, 4);
});

test("KTB and BBL multi-month previews select only the chosen month and derive its own opening; imports still reject foreign dates", async () => {
  let bank = "KTB",
    month = 10,
    writes = 0;
  const rows = [
    { date: "2026-06-10", deposit: 100, withdraw: 0, balance: 100.07 },
    { date: "2026-06-30", deposit: 5.58, withdraw: 0, balance: 105.65 },
    { date: "2026-07-08", deposit: 0, withdraw: 100, balance: 5.65 },
    { date: "2026-10-23", deposit: 200, withdraw: 0, balance: 205.65 },
    { date: "2026-10-23", deposit: 0, withdraw: 200, balance: 5.65 },
  ].map((r, i) => ({
    ...r,
    time: `10:0${i}`,
    description: "synthetic reference",
    channel: null,
  }));
  const actions = await load("../app/(app)/bank/actions.ts", {
    zod: { z },
    "@/auth": { auth: async () => ({ user: { role: "OWNER", id: "owner" } }) },
    "@/lib/business": { requireBusiness: async () => ({ id: 1 }) },
    "next/cache": { revalidatePath() {} },
    "@/lib/bank-account-options": options,
    "@/lib/kbank-parser": {
      parseKbankPdf: async () => ({
        ok: true,
        bank,
        rows,
        openingBalance: 0.07,
        rawText: [],
      }),
      suggestCategoryName: () => null,
    },
    "@/lib/prisma": {
      prisma: {
        bankAccount: {
          findFirst: async () => ({
            id: 10,
            businessId: 1,
            active: true,
            code: bank,
            name: "Bank",
            accountType: "BANK",
          }),
        },
        fiscalMonth: {
          findUnique: async () => ({
            calendarYear: 2026,
            calendarMonth: month,
            daysInMonth: 31,
          }),
        },
        transactionCategory: { findMany: async () => [] },
        bankTransaction: {
          findMany: async () => [],
          createMany: async () => {
            writes++;
            return { count: 1 };
          },
        },
      },
    },
  });
  const parse = () => {
    const f = new FormData();
    f.set("accountId", "10");
    f.set("fiscalMonthId", "7");
    f.set("file", new File(["pdf"], "statement.pdf"));
    return actions.parseStatementPdf(f);
  };
  let result = await parse();
  assert.equal(result.ok, true);
  assert.equal(result.preview.length, 2);
  assert.equal(result.openingBalance, 5.65);
  assert.ok(result.preview.every((r: any) => r.date === "2026-10-23"));
  assert.match(result.scopeNotice, /2.*5/);
  assert.equal(writes, 0);
  bank = "BBL";
  result = await parse();
  assert.equal(result.ok, true);
  assert.equal(result.preview.length, 2);
  assert.equal(result.openingBalance, 5.65);
  assert.match(result.scopeNotice, /2.*5/);
  bank = "KTB";
  month = 7;
  result = await parse();
  assert.equal(result.preview.length, 1);
  assert.equal(result.openingBalance, 105.65);
  month = 8;
  assert.equal((await parse()).ok, false);
  month = 10;
  bank = "KBANK";
  assert.equal((await parse()).ok, false);
  bank = "KTB";
  assert.equal(
    (
      await actions.importStatementRows({
        accountId: 10,
        fiscalMonthId: 7,
        rows: [{ ...rows[0], categoryId: null }],
        setOpening: false,
      })
    ).ok,
    false
  );
  assert.equal(writes, 0);
});
