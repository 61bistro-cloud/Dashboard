import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { z } from "zod";
import * as remarks from "../lib/transaction-remark.ts";
import {
  getConfirmedRemark,
  mergeConfirmedRemark,
} from "../lib/evidence-category.ts";
const original =
  'นำเข้าจากธนาคาร\nหลักฐาน #8 · Remark: ค่าผัก\nEVIDENCE_AUTO_V1:{"status":"applied"}';
const hash = (s: string | null) =>
  crypto
    .createHash("sha256")
    .update(s ?? "")
    .digest("hex");
const plain = (v: any) => JSON.parse(JSON.stringify(v));
test("legacy notes and confirmed evidence remarks remain readable without internal JSON", () => {
  assert.equal(remarks.transactionRemark(original), "นำเข้าจากธนาคาร\nค่าผัก");
  assert.equal(remarks.transactionRemark(null), "");
  assert.equal(remarks.transactionRemark("BANK_REMARK_V1:bad\nhello"), "hello");
});
test("manual edits and explicit clearing preserve imported notes and confirmed evidence audit", () => {
  const edited = remarks.withTransactionRemark(
    original,
    "  ซื้อผัก\r\nสำหรับครัว  "
  );
  assert.equal(remarks.transactionRemark(edited), "ซื้อผัก\nสำหรับครัว");
  assert.ok(edited.includes("EVIDENCE_AUTO_V1:"));
  assert.equal(getConfirmedRemark(edited, 8), "ค่าผัก");
  const cleared = remarks.withTransactionRemark(edited, "");
  assert.equal(remarks.transactionRemark(cleared), "");
  assert.ok(cleared.includes("นำเข้าจากธนาคาร"));
  assert.equal(
    cleared.split("\n").filter((s) => s.startsWith("BANK_REMARK_V1:")).length,
    1
  );
  assert.equal(
    remarks.transactionRemark(mergeConfirmedRemark(edited, 8, "updated slip")),
    "ซื้อผัก\nสำหรับครัว"
  );
});
async function setup(role = "OWNER") {
  let state = {
    rows: [
      {
        id: 1,
        businessId: 2,
        accountId: 10,
        fiscalMonthId: 7,
        note: original,
        deposit: 0,
        withdraw: 1200,
        balanceAfter: 5000,
        description: "ซื้อผัก",
        categoryId: 8,
      },
      {
        id: 2,
        businessId: 3,
        accountId: 20,
        fiscalMonthId: 7,
        note: "foreign private",
        deposit: 0,
        withdraw: 99,
        balanceAfter: 10,
        description: "foreign",
        categoryId: 9,
      },
    ],
    closed: false,
    casFail: false,
  };
  const writes: any[] = [],
    invalidated: string[] = [];
  const match = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const db: any = {
    bankAccount: {
      findFirst: async ({ where }: any) =>
        [
          { id: 10, businessId: 2 },
          { id: 11, businessId: 2 },
          { id: 20, businessId: 3 },
        ].find((r) => match(r, where)) ?? null,
    },
    bankTransaction: {
      findFirst: async ({ where }: any) => {
        const r = state.rows.find((r) => match(r, where));
        return r ? plain(r) : null;
      },
      updateMany: async ({ where, data }: any) => {
        writes.push({ where, data });
        assert.deepEqual(Object.keys(data), ["note"]);
        if (state.casFail) return { count: 0 };
        const r = state.rows.find((r) => match(r, where));
        if (!r) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      },
    },
    monthlyClosing: {
      findUnique: async () => (state.closed ? { status: "CLOSED" } : null),
    },
  };
  db.$transaction = async (fn: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    const before = plain(state);
    try {
      return await fn(db);
    } catch (e) {
      state = before;
      throw e;
    }
  };
  const context = vm.createContext({ console });
  const modules = new Map<string, vm.Module>();
  const dependencies: any = {
    "server-only": {},
    "node:crypto": crypto,
    zod: { z },
    "@/auth": {
      auth: async () =>
        role === "NONE" ? null : { user: { id: "owner", role } },
    },
    "@/lib/business": { requireBusiness: async () => ({ id: 2 }) },
    "@/lib/prisma": { prisma: db },
    "@/lib/transaction-remark": remarks,
    "next/cache": { revalidatePath: (path: string) => invalidated.push(path) },
  };
  async function load(name: string): Promise<vm.Module> {
    if (modules.has(name)) return modules.get(name)!;
    const exports = dependencies[name];
    if (exports) {
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
      name === "@/lib/transaction-remark-server"
        ? "../lib/transaction-remark-server.ts"
        : "../app/(app)/bank/remark-actions.ts";
    const code = ts.transpileModule(
      readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText;
    const m = new vm.SourceTextModule(code, { context });
    modules.set(name, m);
    await m.link(load);
    return m;
  }
  const m = await load("actions");
  await m.evaluate();
  return {
    save: (m.namespace as any).saveTransactionRemark,
    state: () => state,
    writes,
    invalidated,
  };
}
const input = () => ({
  businessId: 2,
  accountId: 10,
  fiscalMonthId: 7,
  transactionId: 1,
  version: hash(original),
  remark: "ค่าผักและวัตถุดิบ",
});
test("saving a remark changes only the scoped note and refreshes Cost Setup without changing money or category", async () => {
  for (const role of ["OWNER", "ACCOUNTANT"]) {
    const h = await setup(role),
      before = plain(h.state().rows);
    const r = await h.save(input());
    assert.equal(r.ok, true);
    assert.equal(r.remark, "ค่าผักและวัตถุดิบ");
    assert.equal(r.version, hash(h.state().rows[0].note));
    assert.deepEqual({ ...h.state().rows[0], note: before[0].note }, before[0]);
    assert.deepEqual(h.state().rows[1], before[1]);
    assert.ok(h.invalidated.includes("/cost-setup"));
    assert.ok(h.state().rows[0].note.includes("หลักฐาน #8"));
  }
});
test("stale tabs receive the current remark and cannot overwrite newer notes", async () => {
  const h = await setup();
  await h.save(input());
  const current = plain(h.state());
  const r = await h.save({ ...input(), remark: "stale overwrite" });
  assert.equal(r.ok, false);
  assert.equal(r.current.remark, "ค่าผักและวัตถุดิบ");
  assert.deepEqual(h.state(), current);
  assert.equal(h.writes.length, 1);
});
test("wrong business, month, account and record IDs cannot mutate notes", async () => {
  const h = await setup();
  const before = plain(h.state());
  for (const patch of [
    { businessId: 3 },
    { fiscalMonthId: 8 },
    { accountId: 11 },
    { accountId: 20 },
    { transactionId: 2 },
  ])
    assert.equal((await h.save({ ...input(), ...patch })).ok, false);
  assert.deepEqual(h.state(), before);
  assert.equal(h.writes.length, 0);
});
test("closed months, unauthorized users and invalid/oversized payloads are rejected", async () => {
  for (const role of ["STAFF", "NONE"]) {
    const h = await setup(role);
    assert.equal((await h.save(input())).ok, false);
    assert.equal(h.writes.length, 0);
  }
  const h = await setup();
  for (const patch of [
    { version: "invalid" },
    { remark: "x".repeat(2001) },
    { deposit: 999 },
  ])
    assert.equal((await h.save({ ...input(), ...patch })).ok, false);
  h.state().closed = true;
  assert.equal((await h.save(input())).ok, false);
  assert.equal(h.writes.length, 0);
});
test("clearing is explicit and failed compare-and-swap never reports a successful save", async () => {
  const h = await setup();
  const r = await h.save({ ...input(), remark: "" });
  assert.equal(r.ok, true);
  assert.equal(remarks.transactionRemark(h.state().rows[0].note), "");
  assert.ok(h.state().rows[0].note.includes("หลักฐาน #8"));
  const fail = await setup();
  fail.state().casFail = true;
  const before = plain(fail.state());
  assert.equal((await fail.save(input())).ok, false);
  assert.deepEqual(fail.state(), before);
  assert.equal(fail.invalidated.length, 0);
});
