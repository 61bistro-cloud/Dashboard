import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import * as review from "../lib/document-review.ts";
import * as match from "../lib/evidence-match.ts";
const text =
  "ใบเสร็จ\nวันที่ 01/10/2569\nยอดรวม 1,200.00 บาท\nกระดาษเช็ดปาก\nเลขอ้างอิง: ABC123456";
const plain = (v: any) => JSON.parse(JSON.stringify(v));
async function harness(
  options: {
    ocrFailure?: boolean;
    aiUnavailable?: boolean;
    fresh?: boolean;
    stale?: boolean;
  } = {}
) {
  const files: any[] = [
    {
      id: 10,
      businessId: 2,
      fiscalMonthId: 7,
      kind: "SLIP",
      driveFileId: "original-drive-file",
      refType: null,
      refId: null,
      note: options.fresh
        ? review.writeDocumentReview("LINE", review.queuedReview())
        : match.writeEvidenceOcr("LINE", text),
    },
    {
      id: 11,
      businessId: 3,
      fiscalMonthId: 7,
      kind: "SLIP",
      driveFileId: "foreign-drive-file",
      note: match.writeEvidenceOcr("foreign", text),
    },
    {
      id: 12,
      businessId: 2,
      fiscalMonthId: 7,
      kind: "BILL",
      driveFileId: "receipt-partner",
      note: review.writeDocumentReview("BILL", {
        ...review.queuedReview(),
        state: "review",
        reference: "ABC123456",
        ai: "rules",
      }),
    },
  ];
  const calls = { ocr: 0, ai: 0, financial: 0 };
  const matches = (r: any, w: any) =>
    Object.entries(w).every(([k, v]: any) =>
      typeof v === "object" && v !== null
        ? "in" in v
          ? v.in.includes(r[k])
          : "not" in v
            ? r[k] !== v.not
            : "contains" in v
              ? typeof r[k] === "string" && r[k].includes(v.contains)
              : false
        : r[k] === v
    );
  const db: any = {
    driveFile: {
      findFirst: async ({ where }: any) =>
        files.find((f) => matches(f, where))
          ? plain(files.find((f) => matches(f, where)))
          : null,
      findMany: async ({ where }: any) =>
        files.filter((f) => matches(f, where)).map(plain),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const f of files)
          if (matches(f, where)) {
            Object.assign(f, data);
            count++;
          }
        return { count };
      },
    },
    fiscalMonth: {
      findUnique: async () => ({ calendarYear: 2026, calendarMonth: 10 }),
    },
  };
  for (const model of [
    "bankTransaction",
    "employeePayroll",
    "supplierPurchase",
    "fixedCost",
    "monthlyClosing",
  ])
    db[model] = new Proxy(
      {},
      {
        get() {
          calls.financial++;
          throw Error("No financial writes permitted");
        },
      }
    );
  const dependencies: any = {
    "server-only": {},
    "node:crypto": crypto,
    "./prisma": { prisma: db },
    "./document-review": review,
    "./evidence-match": match,
    "./openrouter-documents": {
      documentAiConfig: () => ({ enabled: true, model: "openrouter/free" }),
      askDocumentAi: async () => {
        calls.ai++;
        if (options.stale) files[0].note += "\nUSER_EDIT";
        if (options.aiUnavailable) return { status: "unavailable" };
        return {
          status: "complete",
          model: "openrouter/free",
          result: {
            kind: "receipt",
            amount: 1200,
            date: "2026-10-01",
            merchant: null,
            reference: "ABC123456",
            remark: null,
            group: "admin",
            quotes: { category: "กระดาษเช็ดปาก" },
            flags: [],
          },
        };
      },
    },
  };
  const context = vm.createContext({ console, process: { env: {} } });
  const synthetic = (obj: any) =>
    new vm.SyntheticModule(
      Object.keys(obj),
      function () {
        for (const k of Object.keys(obj)) this.setExport(k, obj[k]);
      },
      { context }
    );
  const code = ts.transpileModule(
    readFileSync(
      new URL("../lib/document-processing.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const m = new vm.SourceTextModule(code, {
    context,
    importModuleDynamically: async (name) => {
      assert.equal(name, "./google");
      const module = synthetic({
        readEvidenceText: async (biz: number, id: string) => {
          assert.equal(biz, 2);
          assert.equal(id, "original-drive-file");
          calls.ocr++;
          if (options.ocrFailure) throw Error("OCR offline");
          return text;
        },
      });
      await module.link(() => {
        throw Error("unexpected import");
      });
      await module.evaluate();
      return module;
    },
  });
  await m.link(async (name) => {
    assert.ok(dependencies[name], name);
    return synthetic(dependencies[name]);
  });
  await m.evaluate();
  return {
    run: (biz = 2, month = 7, force = false) =>
      (m.namespace as any).processEvidenceDocument(biz, 10, month, force),
    files,
    calls,
  };
}
test("OCR then AI only write review metadata, keep originals/links and flag companion evidence", async () => {
  const h = await harness({ fresh: true });
  const before = plain(h.files);
  const result = await h.run();
  assert.equal(result.review.ai, "complete");
  assert.equal(result.review.group, "admin");
  assert.equal(h.calls.ocr, 1);
  assert.equal(h.calls.ai, 1);
  assert.equal(h.calls.financial, 0);
  assert.equal(h.files.length, 3);
  assert.equal(h.files[0].driveFileId, before[0].driveFileId);
  assert.equal(h.files[0].refId, null);
  assert.deepEqual(plain(result.review.duplicateIds), [12]);
  assert.ok(result.review.flags.includes("same_payment_reference"));
  assert.deepEqual(h.files[1], before[1]);
  const cached = await h.run();
  assert.equal(h.calls.ai, 1);
  assert.equal(cached.review.group, "admin");
});
test("quota failure preserves OCR and waits for review without changing any financial model", async () => {
  const h = await harness({ fresh: true, aiUnavailable: true });
  const r = await h.run();
  assert.equal(r.review.ai, "unavailable");
  assert.equal(r.review.state, "review");
  assert.ok(match.readEvidenceOcr(h.files[0].note));
  assert.equal(h.calls.financial, 0);
  await h.run();
  assert.equal(h.calls.ai, 1);
});
test("failed OCR retains original document and a durable retry status", async () => {
  const h = await harness({ fresh: true, ocrFailure: true });
  const r = await h.run();
  assert.equal(r.review.state, "failed");
  assert.equal(h.calls.ai, 0);
  assert.equal(h.files[0].driveFileId, "original-drive-file");
  assert.ok(review.readDocumentReview(h.files[0].note)!.retryAfter);
});
test("wrong business/month cannot claim or read an original; live leases prevent duplicate processing", async () => {
  const h = await harness();
  const before = plain(h.files);
  await assert.rejects(h.run(3));
  await assert.rejects(h.run(2, 8));
  assert.deepEqual(h.files, before);
  assert.equal(h.calls.ai, 0);
  h.files[0].note = review.writeDocumentReview(h.files[0].note, {
    ...review.queuedReview(),
    state: "processing",
  });
  const r = await h.run();
  assert.equal(r.busy, true);
  assert.equal(h.calls.ai, 0);
});
test("a concurrent human edit is never overwritten by a delayed AI result", async () => {
  const h = await harness({ stale: true });
  await h.run();
  assert.ok(h.files[0].note.endsWith("USER_EDIT"));
  assert.equal(h.calls.financial, 0);
});

test("queue endpoint requires a server secret and returns counts without exposing documents", async () => {
  const code = ts.transpileModule(
    readFileSync(
      new URL("../app/api/evidence/process-queue/route.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  let reads = 0,
    processed = 0;
  const dependencies: any = {
    "node:crypto": crypto,
    "@/lib/prisma": {
      prisma: {
        driveFile: {
          findMany: async () => {
            reads++;
            return [
              {
                id: 1,
                businessId: 2,
                note: review.writeDocumentReview("LINE", review.queuedReview()),
              },
            ];
          },
        },
      },
    },
    "@/lib/document-review": review,
    "@/lib/document-processing": {
      processEvidenceDocument: async (b: number, id: number) => {
        assert.equal(b, 2);
        assert.equal(id, 1);
        processed++;
      },
    },
  };
  const context = vm.createContext({
    Request,
    Response,
    process: { env: { CRON_SECRET: "test-only-cron-secret" } },
  });
  const m = new vm.SourceTextModule(code, { context });
  await m.link(async (name) => {
    const values = dependencies[name];
    assert.ok(values, name);
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const k of Object.keys(values)) this.setExport(k, values[k]);
      },
      { context }
    );
  });
  await m.evaluate();
  for (const auth of ["", "Bearer wrong"]) {
    const r = await (m.namespace as any).GET(
      new Request("https://example.test/api/evidence/process-queue", {
        headers: { authorization: auth },
      })
    );
    assert.equal(r.status, 401);
  }
  assert.equal(reads, 0);
  const result = await (m.namespace as any).GET(
    new Request("https://example.test/api/evidence/process-queue", {
      headers: { authorization: "Bearer test-only-cron-secret" },
    })
  );
  assert.deepEqual(await result.json(), { processed: 1 });
  assert.equal(processed, 1);
});

test("expired repeated failures leave the background queue for manual review instead of starving later files", async () => {
  const h = await harness();
  h.files[0].note = review.writeDocumentReview(h.files[0].note, {
    ...review.queuedReview(),
    state: "processing",
    attempts: 3,
    checkedAt: "2020-01-01T00:00:00.000Z",
  });
  const result = await h.run();
  assert.equal(result.review.state, "review");
  assert.equal(h.calls.ai, 0);
  assert.equal(review.readDocumentReview(h.files[0].note)!.state, "review");
});
