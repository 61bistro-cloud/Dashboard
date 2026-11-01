import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import {
  extractEvidenceRemark,
  suggestRemarkCategories,
  mergeConfirmedRemark,
  getConfirmedRemark,
} from "../lib/evidence-category.ts";
import { readEvidenceOcr, writeEvidenceOcr } from "../lib/evidence-match.ts";

const categories = [
  { id: 1, name: "🥩 ต้นทุน - วัตถุดิบอาหาร", kind: "EXPENSE" },
  { id: 2, name: "⚡ ค่าสาธารณูปโภค (ไฟ/น้ำ)", kind: "EXPENSE" },
  { id: 3, name: "🍹 ต้นทุน - วัตถุดิบเครื่องดื่ม", kind: "EXPENSE" },
  { id: 4, name: "💊 เบิกล่วงหน้าพนักงาน", kind: "EXPENSE" },
  { id: 5, name: "👥 เงินเดือนพนักงาน", kind: "EXPENSE" },
  { id: 6, name: "🔄 โอนระหว่างบัญชี", kind: "TRANSFER" },
  { id: 7, name: "💰 รายรับ - เพิ่มเงินบริหาร", kind: "INCOME" },
];
const out = { deposit: 0, withdraw: 100 },
  incoming = { deposit: 100, withdraw: 0 };
test("extracts explicit Thai/English remark labels and next-line memos without consuming bank fields", () => {
  for (const text of [
    "Remark: ค่าผัก ต.ค.\nจำนวนเงิน 100.00",
    "หมายเหตุ\nค่าผัก ต.ค.\nเลขอ้างอิง 1234",
    "Memo ค่าผัก ต.ค.\nบันทึกสลิป",
  ])
    assert.equal(extractEvidenceRemark(text), "ค่าผัก ต.ค.");
  assert.equal(
    extractEvidenceRemark("บันทึกช่วยจำ: ค่าไฟเดือนตุลาคม\nธนาคารกรุงศรี"),
    "ค่าไฟเดือนตุลาคม"
  );
  assert.equal(extractEvidenceRemark("Remark\nค่าผัก\n100.00"), "ค่าผัก");
});
test("missing/empty remarks and bank footer instructions remain unknown", () => {
  for (const text of [
    "ธนาคาร\nค่าสาธารณูปโภค\n100.00",
    "Remark: -",
    "หมายเหตุ: ไม่มี",
    "Note: Please verify this payment",
    "บันทึกสลิป\nค่าไฟ",
  ])
    assert.equal(extractEvidenceRemark(text), null);
});
test("suggests only actual business categories using the remark and money direction", () => {
  assert.deepEqual(
    suggestRemarkCategories("ค่าผัก", out, categories).map((r) => r.categoryId),
    [1]
  );
  assert.deepEqual(
    suggestRemarkCategories("ค่าไฟ ต.ค.", out, categories).map(
      (r) => r.categoryId
    ),
    [2]
  );
  assert.deepEqual(
    suggestRemarkCategories("ค่าไฟ ต.ค.", incoming, categories),
    []
  );
  assert.deepEqual(suggestRemarkCategories("ค่าผัก", out, []), []);
  assert.deepEqual(suggestRemarkCategories("ขอบคุณมาก", out, categories), []);
  assert.deepEqual(suggestRemarkCategories("ค่าผัก", null, categories), []);
});
test("avoids water/ice confusion, treats staff advances separately and preserves ambiguous categories", () => {
  assert.deepEqual(
    suggestRemarkCategories("ค่าน้ำแข็ง", out, categories).map(
      (r) => r.categoryId
    ),
    [3]
  );
  assert.deepEqual(
    suggestRemarkCategories("เบิกล่วงหน้าเงินเดือน", out, categories).map(
      (r) => r.categoryId
    ),
    [4]
  );
  assert.deepEqual(
    suggestRemarkCategories("ค่าผัก และค่าไฟ", out, categories)
      .map((r) => r.categoryId)
      .sort(),
    [1, 2]
  );
  assert.deepEqual(
    suggestRemarkCategories("โอนค่าผักเข้าบัญชีร้านค้า", out, categories).map(
      (r) => r.categoryId
    ),
    [1]
  );
  assert.deepEqual(
    suggestRemarkCategories("เพิ่มเงินบริหาร", incoming, categories).map(
      (r) => r.categoryId
    ),
    [7]
  );
  assert.deepEqual(
    suggestRemarkCategories("โอนระหว่างบัญชี", out, categories).map(
      (r) => r.categoryId
    ),
    [6]
  );
});
test("old cached OCR text yields remarks immediately without re-reading the image", () => {
  const saved = writeEvidenceOcr(
    "WEB_UPLOAD:keep",
    "01/10/2026\n100.00\nRemark: ค่าผัก"
  );
  assert.equal(readEvidenceOcr(saved)!.remark, "ค่าผัก");
  assert.ok(saved.startsWith("WEB_UPLOAD:keep"));
});
test("confirmed remarks preserve existing notes and other files, replacing only the same evidence note", () => {
  const existing = "manual note\nหลักฐาน #12 · Remark: ค่าไฟ";
  const saved = mergeConfirmedRemark(existing, 11, "ค่าผัก\nต.ค.")!;
  assert.ok(saved.startsWith(existing));
  assert.equal(getConfirmedRemark(saved, 11), "ค่าผัก ต.ค.");
  const corrected = mergeConfirmedRemark(saved, 11, "ค่าวัตถุดิบ")!;
  assert.equal(getConfirmedRemark(corrected, 11), "ค่าวัตถุดิบ");
  assert.equal(getConfirmedRemark(corrected, 12), "ค่าไฟ");
  assert.equal(corrected.split("หลักฐาน #11").length, 2);
});
async function server(
  options: {
    linked?: boolean;
    validFile?: boolean;
    validTx?: boolean;
    validCategory?: boolean;
    role?: string;
    businessId?: number;
    currentCategoryId?: number | null;
    count?: number;
  } = {}
) {
  const writes: any[] = [];
  const paths: string[] = [];
  const prisma = {
    driveFile: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.businessId, 7);
        assert.equal(where.fiscalMonthId, 7);
        return options.validFile === false
          ? null
          : {
              id: 11,
              refType: options.linked === false ? null : "BANK_TX",
              refId: "22",
            };
      },
    },
    bankTransaction: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.businessId, 7);
        assert.equal(where.fiscalMonthId, 7);
        return options.validTx === false
          ? null
          : {
              id: 22,
              categoryId:
                options.currentCategoryId === undefined
                  ? 9
                  : options.currentCategoryId,
              note: "original bank note",
            };
      },
      updateMany: async (query: any) => {
        writes.push(query);
        return { count: options.count ?? 1 };
      },
    },
    transactionCategory: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.businessId, 7);
        assert.equal(where.active, true);
        return options.validCategory === false ? null : { id: 1 };
      },
    },
  };
  const context = vm.createContext({ console });
  const deps: Record<string, any> = {
    "@/lib/evidence-category": { mergeConfirmedRemark },
    zod: { z },
    "@/auth": {
      auth: async () => ({ user: { role: options.role ?? "OWNER" } }),
    },
    "@/lib/business": {
      requireBusiness: async () => ({ id: options.businessId ?? 7 }),
    },
    "@/lib/prisma": { prisma },
    "next/cache": { revalidatePath: (path: string) => paths.push(path) },
    "@/lib/evidence-match": { readEvidenceOcr, writeEvidenceOcr },
  };
  const code = ts.transpileModule(
    readFileSync(
      new URL("../app/(app)/bank/evidence/actions.ts", import.meta.url),
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
  await module.link(async (name) => {
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
    save: (module.namespace as any).saveEvidenceCategory,
    writes,
    paths,
  };
}
const input = {
  businessId: 7,
  monthId: 7,
  fileId: 11,
  transactionId: 22,
  categoryId: 1,
  expectedCategoryId: 9,
  remark: "ค่าผัก ต.ค.",
};
test("explicit save changes category and memo only, invalidating all cost/P&L consumers", async () => {
  const h = await server();
  assert.equal((await h.save(input)).ok, true);
  assert.equal(h.writes.length, 1);
  const write = h.writes[0];
  assert.equal(write.where.businessId, 7);
  assert.equal(write.where.fiscalMonthId, 7);
  assert.equal(write.where.categoryId, 9);
  assert.equal(write.where.note, "original bank note");
  assert.deepEqual(Object.keys(write.data).sort(), ["categoryId", "note"]);
  assert.equal(write.data.categoryId, 1);
  assert.ok(write.data.note.startsWith("original bank note"));
  for (const path of [
    "/bank",
    "/bank/evidence",
    "/cost-setup",
    "/",
    "/daily-pl",
    "/monthly-pl",
    "/closing",
  ])
    assert.ok(h.paths.includes(path));
});
test("unconfirmed links, wrong business/month/category, permissions and stale categories cannot change the ledger", async () => {
  for (const options of [
    { linked: false },
    { validFile: false },
    { validTx: false },
    { validCategory: false },
    { role: "STAFF" },
    { businessId: 8 },
    { currentCategoryId: 5 },
  ]) {
    const h = await server(options);
    assert.equal((await h.save(input)).ok, false);
    assert.equal(h.writes.length, 0);
  }
  const h = await server({ count: 0 });
  assert.equal((await h.save(input)).ok, false);
  assert.equal(h.paths.length, 0);
});
