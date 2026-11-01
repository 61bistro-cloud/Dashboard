import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  decideEvidenceAutomation,
  corroboratesCounterparty,
  readAutoEvidenceStatus,
  writeAutoEvidenceStatus,
} from "../lib/evidence-auto.ts";
import { readEvidenceOcr, writeEvidenceOcr } from "../lib/evidence-match.ts";
import { mergeConfirmedRemark } from "../lib/evidence-category.ts";

const text =
  "01/10/2026\n10:00\nไปยัง\n61 BISTRO\nบัญชี X373172\nจำนวนเงิน 2,000.00\nRemark: ค่าผัก";
const ocr = readEvidenceOcr(writeEvidenceOcr("WEB_UPLOAD:keep", text))!;
const transaction = {
  id: 22,
  date: "2026-10-01T10:00:00.000Z",
  description: "โอนเงิน — KBANK 61 BISTRO — บัญชีปลายทาง : X373172",
  deposit: 0,
  withdraw: 2000,
  accountId: 5,
  accountName: "test",
  categoryId: 9,
  categoryName: "ค่าใช้จ่ายเบ็ดเตล็ด",
  note: null,
};
const categories = [
  { id: 1, name: "🥩 ต้นทุน - วัตถุดิบอาหาร", kind: "EXPENSE" },
];
test("automates only a single corroborated match and single category", () => {
  const result = decideEvidenceAutomation(
    ocr,
    [transaction],
    categories,
    null,
    5
  );
  assert.equal(result.status, "apply");
  if (result.status === "apply") {
    assert.equal(result.categoryId, 1);
    assert.equal(result.transaction.id, 22);
  }
  assert.equal(corroboratesCounterparty(text, transaction), true);
});
test("same amount/date duplicates, absent identity/time and mismatched account require review", () => {
  for (const [fields, rows, account] of [
    [ocr, [transaction, { ...transaction, id: 23 }], undefined],
    [{ ...ocr, text: "amount 2000.00" }, [transaction], undefined],
    [{ ...ocr, time: null }, [transaction], undefined],
    [ocr, [transaction], 6],
  ] as const) {
    assert.equal(
      decideEvidenceAutomation(fields, [...rows], categories, null, account)
        .status,
      "review"
    );
  }
});
test("matching reference can corroborate a unique row without a printed time", () => {
  const result = decideEvidenceAutomation(
    { ...ocr, time: null, text: "Reference No: ABC1234567" },
    [{ ...transaction, description: "reference ABC1234567" }],
    categories,
    null
  );
  assert.equal(result.status, "apply");
});
test("missing or ambiguous remark categories do not change the ledger", () => {
  assert.equal(
    decideEvidenceAutomation(
      { ...ocr, remark: null },
      [transaction],
      categories,
      null
    ).status,
    "review"
  );
  assert.equal(
    decideEvidenceAutomation(
      { ...ocr, remark: "ค่าผัก ค่าไฟ" },
      [transaction],
      [
        ...categories,
        { id: 2, name: "⚡ ค่าสาธารณูปโภค (ไฟ/น้ำ)", kind: "EXPENSE" },
      ],
      null
    ).status,
    "review"
  );
  assert.equal(
    decideEvidenceAutomation(ocr, [transaction], [], null).status,
    "review"
  );
});
test("specific existing categories and confirmed user edits are preserved", () => {
  assert.equal(
    decideEvidenceAutomation(
      ocr,
      [{ ...transaction, categoryName: "ค่าเช่า" }],
      categories,
      22
    ).status,
    "review"
  );
  assert.equal(
    decideEvidenceAutomation(
      ocr,
      [{ ...transaction, note: "หลักฐาน #11 · Remark: ค่าผัก" }],
      categories,
      22
    ).status,
    "skipped"
  );
  assert.equal(
    decideEvidenceAutomation(ocr, [transaction], categories, 999).status,
    "review"
  );
});
test("a manually linked row can be categorized without rematching, and repeated runs skip it", () => {
  const result = decideEvidenceAutomation(
    { ...ocr, time: null, text: "Remark: ค่าผัก" },
    [transaction],
    categories,
    22
  );
  assert.equal(result.status, "apply");
  const saved = {
    ...transaction,
    categoryId: 1,
    note: mergeConfirmedRemark(null, 11, "ค่าผัก"),
  };
  assert.equal(
    decideEvidenceAutomation(ocr, [saved], categories, 22).status,
    "skipped"
  );
});
test("incoming slips corroborate the sender, not an unrelated recipient section", () => {
  const incoming = {
    ...transaction,
    deposit: 2000,
    withdraw: 0,
    description: "รับเงิน — SENDER COMPANY — บัญชีต้นทาง X998877",
  };
  assert.equal(
    corroboratesCounterparty(
      "จาก\nSENDER COMPANY\nX998877\nไปยัง\nMY SHOP",
      incoming
    ),
    true
  );
  assert.equal(
    corroboratesCounterparty("ไปยัง\nSENDER COMPANY\nX998877", incoming),
    false
  );
});
test("automatic audit metadata and OCR cache coexist and preserve the upload retry marker", () => {
  const note = writeAutoEvidenceStatus(
    writeEvidenceOcr("WEB_UPLOAD:keep", text),
    { status: "review", message: "test" }
  );
  assert.equal(readEvidenceOcr(note)!.amount, 2000);
  assert.equal(readAutoEvidenceStatus(note)!.status, "review");
  const reread = writeEvidenceOcr(note, text);
  assert.ok(reread.startsWith("WEB_UPLOAD:keep"));
  assert.equal(readAutoEvidenceStatus(reread)!.message, "test");
});

async function service(
  options: {
    linkRace?: boolean;
    transactionRace?: boolean;
    wrongScope?: boolean;
    conflict?: boolean;
    wrongCalendarMonth?: boolean;
  } = {}
) {
  let file: any = {
    id: 11,
    businessId: 7,
    fiscalMonthId: 7,
    kind: "SLIP",
    refType: null,
    refId: null,
    note: writeEvidenceOcr("WEB_UPLOAD:keep", text),
  };
  let row: any = {
    ...transaction,
    date: new Date(transaction.date),
    businessId: 7,
    fiscalMonthId: 7,
    account: { name: "test" },
    category: { name: options.conflict ? "ค่าเช่า" : "ค่าใช้จ่ายเบ็ดเตล็ด" },
  };
  const writes: any[] = [];
  const prisma = {
    $transaction: async (fn: any) => {
      const previousFile = { ...file },
        previousRow = { ...row };
      try {
        return await fn({
          fiscalMonth: {
            findUnique: async () => ({
              calendarYear: 2026,
              calendarMonth: options.wrongCalendarMonth ? 9 : 10,
            }),
          },
          driveFile: {
            findFirst: async ({ where }: any) => {
              assert.equal(where.businessId, 7);
              assert.equal(where.fiscalMonthId, 7);
              return options.wrongScope ? null : { ...file };
            },
            updateMany: async (query: any) => {
              assert.equal(query.where.businessId, 7);
              assert.equal(query.where.fiscalMonthId, 7);
              writes.push(["file", query.data]);
              if (options.linkRace) return { count: 0 };
              file = { ...file, ...query.data };
              return { count: 1 };
            },
          },
          bankTransaction: {
            findMany: async ({ where }: any) => {
              assert.equal(where.businessId, 7);
              assert.equal(where.fiscalMonthId, 7);
              return [{ ...row }];
            },
            updateMany: async (query: any) => {
              assert.equal(query.where.businessId, 7);
              assert.equal(query.where.fiscalMonthId, 7);
              assert.deepEqual(Object.keys(query.data).sort(), [
                "categoryId",
                "note",
              ]);
              writes.push(["transaction", query.data]);
              if (options.transactionRace) return { count: 0 };
              row = { ...row, ...query.data };
              return { count: 1 };
            },
          },
          transactionCategory: {
            findMany: async ({ where }: any) => {
              assert.equal(where.businessId, 7);
              assert.equal(where.active, true);
              return categories;
            },
          },
        });
      } catch (error) {
        file = previousFile;
        row = previousRow;
        throw error;
      }
    },
  };
  const context = vm.createContext({ console });
  const dependencies: Record<string, any> = {
    "@/lib/prisma": { prisma },
    "@/lib/evidence-match": { readEvidenceOcr },
    "@/lib/evidence-category": { mergeConfirmedRemark },
    "@/lib/evidence-auto": {
      decideEvidenceAutomation,
      writeAutoEvidenceStatus,
    },
  };
  const code = ts.transpileModule(
    readFileSync(
      new URL("../lib/evidence-auto-service.ts", import.meta.url),
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
    apply: (module.namespace as any).applyEvidenceAutomation,
    file: () => file,
    row: () => row,
    writes,
  };
}
test("link, category and audit status commit together; no amount is modified and no transaction is created", async () => {
  const h = await service();
  const result = await h.apply(7, 7, 11, 5);
  assert.equal(result.status, "applied");
  assert.equal(h.file().refId, "22");
  assert.equal(h.row().categoryId, 1);
  assert.equal(h.row().withdraw, 2000);
  assert.equal(h.row().deposit, 0);
  assert.equal(readAutoEvidenceStatus(h.file().note)!.status, "applied");
  assert.equal((await h.apply(7, 7, 11, 5)).status, "skipped");
});
test("stale proof or changed bank row rolls back the complete operation", async () => {
  for (const options of [{ linkRace: true }, { transactionRace: true }]) {
    const h = await service(options);
    await assert.rejects(h.apply(7, 7, 11));
    assert.equal(h.row().categoryId, 9);
    assert.equal(h.file().refId, null);
  }
});
test("wrong scope and category conflicts cannot alter financial records", async () => {
  const missing = await service({ wrongScope: true });
  assert.equal((await missing.apply(7, 7, 11)).status, "review");
  assert.equal(missing.writes.length, 0);
  const conflict = await service({ conflict: true });
  assert.equal((await conflict.apply(7, 7, 11)).status, "review");
  assert.equal(conflict.row().categoryId, 9);
  assert.equal(conflict.file().refId, null);
  assert.ok(!conflict.writes.some(([type]) => type === "transaction"));
});

test("a slip assigned to the wrong calendar month cannot be posted automatically", async () => {
  const h = await service({ wrongCalendarMonth: true });
  assert.equal((await h.apply(7, 7, 11)).status, "review");
  assert.equal(h.row().categoryId, 9);
  assert.ok(!h.writes.some(([type]) => type === "transaction"));
});

test("matching recipient names cannot override contradictory account digits", () => {
  assert.equal(
    corroboratesCounterparty("ไปยัง\n61 BISTRO\nบัญชี X999999", transaction),
    false
  );
});
