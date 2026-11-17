import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as review from "../lib/document-review.ts";
import { writeEvidenceOcr, readEvidenceOcr } from "../lib/evidence-match.ts";
const text =
  "ใบเสร็จ\nวันที่ 01/10/2569\nยอดรวม 1,200.00 บาท\nRemark: ซื้อกล่องอาหาร\nเลขอ้างอิง: ABC123456";
const payload = {
  kind: "receipt",
  amount: { value: 1200, quote: "ยอดรวม 1,200.00 บาท" },
  date: { value: "2026-10-01", quote: "วันที่ 01/10/2569" },
  merchant: null,
  reference: { value: "ABC123456", quote: "เลขอ้างอิง: ABC123456" },
  remark: { value: "ซื้อกล่องอาหาร", quote: "Remark: ซื้อกล่องอาหาร" },
  category: { group: "packaging", quote: "Remark: ซื้อกล่องอาหาร" },
};
test("rules identify receipt and packaging without converting owner capital into sales", () => {
  const ocr = readEvidenceOcr(writeEvidenceOcr(null, text))!;
  const r = review.ruleDocumentReview(ocr);
  assert.equal(r.kind, "receipt");
  assert.equal(r.group, "packaging");
  assert.equal(r.reference, "ABC123456");
  assert.ok(r.flags.includes("human_confirmation_required"));
  const capital = review.ruleDocumentReview(
    readEvidenceOcr(
      writeEvidenceOcr(
        null,
        "โอนเงินสำเร็จ\n01/10/2569\nจำนวนเงิน 5000.00 บาท\nRemark: เพิ่มเงินบริหาร"
      )
    )!
  );
  assert.equal(capital.group, "owner_capital");
});
test("AI fields must cite exact OCR text, including a valid amount and converted Thai date", () => {
  const r = review.groundedAiResult(payload, text)!;
  assert.equal(r.amount, 1200);
  assert.equal(r.date, "2026-10-01");
  assert.equal(r.group, "packaging");
  assert.equal(r.reference, "ABC123456");
  const fabricated = review.groundedAiResult(
    {
      ...payload,
      amount: { value: 9000, quote: "ยอดรวม 1,200.00 บาท" },
      date: { value: "2026-11-01", quote: "วันที่ 01/10/2569" },
      merchant: { value: "Imaginary shop", quote: "not in document" },
    },
    text
  )!;
  assert.equal(fabricated.amount, null);
  assert.equal(fabricated.date, null);
  assert.equal(fabricated.merchant, null);
  assert.ok(fabricated.flags.length >= 2);
  assert.equal(
    review.groundedAiResult(
      { ...payload, category: { group: "made-up", quote: "anything" } },
      text
    ),
    null
  );
  assert.equal(
    review.groundedAiResult(
      { ...payload, execute: "delete all records" },
      text
    ),
    null
  );
});
test("account numbers cannot be presented as grounded totals and capital/transfer need explicit purpose", () => {
  const r = review.groundedAiResult(
    {
      ...payload,
      amount: { value: 12345, quote: "เลขบัญชี 12345" },
      category: { group: "owner_capital", quote: "Remark: ซื้อกล่องอาหาร" },
    },
    text + "\nเลขบัญชี 12345"
  )!;
  assert.equal(r.amount, null);
  assert.equal(r.group, "unknown");
});
test("redaction removes labelled parties/accounts, emails, phones and identifiers before external AI", () => {
  const redacted = review.redactDocumentText(
    "ผู้โอน: PRIVATE NAME\nบัญชี: 123-4-56789-0\ncontact a@example.com 0812345678\nเลขประจำตัวผู้เสียภาษี 1234567890123\nยอดรวม 1200.00 บาท"
  );
  assert.doesNotMatch(
    redacted,
    /PRIVATE NAME|123-4-56789-0|a@example.com|0812345678|1234567890123/
  );
  assert.match(redacted, /1200.00/);
});
test("review markers preserve original notes, OCR and link audit metadata", () => {
  const original = writeEvidenceOcr(
    'LINE\nEVIDENCE_AUTO_V1:{"status":"review"}',
    text
  );
  const note = review.writeDocumentReview(original, review.queuedReview());
  assert.equal(readEvidenceOcr(note)!.text, text);
  assert.ok(note.includes("EVIDENCE_AUTO_V1:"));
  assert.equal(review.readDocumentReview(note)!.state, "queued");
  assert.equal(review.readDocumentReview("bad"), null);
});
async function aiModule() {
  const code = ts.transpileModule(
    readFileSync(
      new URL("../lib/openrouter-documents.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const context = vm.createContext({
    console,
    process: { env: {} },
    AbortSignal,
  });
  const m = new vm.SourceTextModule(code, { context });
  await m.link(async (name) => {
    const values: any = name === "server-only" ? {} : review;
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const k of Object.keys(values)) this.setExport(k, values[k]);
      },
      { context }
    );
  });
  await m.evaluate();
  return m.namespace as any;
}
const env = {
  OPENROUTER_API_KEY: "test-only-key",
  OPENROUTER_BUSINESS_IDS: "2",
  OPENROUTER_MODEL: "openrouter/free",
};
test("disabled/missing-key/wrong business/paid model never sends any external request", async () => {
  const a = await aiModule();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("must not call");
  };
  for (const [id, settings] of [
    [1, env],
    [2, {}],
    [2, { ...env, OPENROUTER_MODEL: "vendor/paid" }],
  ] as any)
    await a.askDocumentAi(id, text, fetcher, settings);
  assert.equal(calls, 0);
});
test("free-only provider request redacts OCR and disallows paid/provider fallback and tool execution", async () => {
  const a = await aiModule();
  const calls: any[] = [];
  const fetcher = async (url: string, options: any) => {
    calls.push({ url, options });
    return calls.length === 1
      ? {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "openrouter/free",
                pricing: { prompt: "0", completion: "0" },
              },
            ],
          }),
        }
      : {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(payload) } }],
          }),
        };
  };
  const result = await a.askDocumentAi(
    2,
    text + "\nผู้โอน: PRIVATE NAME",
    fetcher,
    env
  );
  assert.equal(result.status, "complete");
  const body = JSON.parse(calls[1].options.body);
  assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
  assert.equal(body.provider.allow_fallbacks, false);
  assert.equal(body.provider.data_collection, "deny");
  assert.equal(body.tools, undefined);
  assert.ok(!body.messages[1].content.includes("PRIVATE NAME"));
  assert.equal(result.result.amount, 1200);
});
test("catalog price changes, quota errors and malformed output retain manual review with no paid retry", async () => {
  const a = await aiModule();
  let n = 0;
  const priced = await a.askDocumentAi(
    2,
    text,
    async () => {
      n++;
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: "openrouter/free",
              pricing: { prompt: "1", completion: "0" },
            },
          ],
        }),
      };
    },
    env
  );
  assert.equal(priced.status, "unavailable");
  assert.equal(n, 1);
  for (const status of [401, 429, 500]) {
    n = 0;
    const r = await a.askDocumentAi(
      2,
      text,
      async () => {
        n++;
        return n === 1
          ? {
              ok: true,
              json: async () => ({
                data: [
                  {
                    id: "openrouter/free",
                    pricing: { prompt: "0", completion: "0" },
                  },
                ],
              }),
            }
          : { ok: false, status };
      },
      env
    );
    assert.equal(r.status, "unavailable");
    assert.equal(n, 2);
  }
});

test("malformed AI output and invented fields are rejected rather than repaired into accounting values", async () => {
  const a = await aiModule();
  for (const content of [
    "not JSON",
    JSON.stringify({
      ...payload,
      amount: { value: 9999, quote: "nonexistent" },
      category: { group: "arbitrary", quote: "anything" },
    }),
  ]) {
    let calls = 0;
    const result = await a.askDocumentAi(
      2,
      text,
      async () => {
        calls++;
        return calls === 1
          ? {
              ok: true,
              json: async () => ({
                data: [
                  {
                    id: "openrouter/free",
                    pricing: { prompt: "0", completion: "0" },
                  },
                ],
              }),
            }
          : {
              ok: true,
              json: async () => ({ choices: [{ message: { content } }] }),
            };
      },
      env
    );
    assert.ok(["invalid", "unavailable"].includes(result.status));
    assert.equal(calls, 2);
  }
  assert.equal(
    review.readDocumentReview(
      '\nDOCUMENT_REVIEW_V1:{"version":1,"state":"review","checkedAt":"2026-10-01T00:00:00Z","attempts":1,"group":"admin"}'
    ),
    null
  );
});

test("the owner-only connection test sends synthetic text and cannot target another business", async () => {
  let role = "STAFF",
    calls = 0;
  const code = ts.transpileModule(
    readFileSync(
      new URL("../app/(app)/admin/google/document-actions.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const deps: any = {
    "@/auth": { auth: async () => ({ user: { role } }) },
    "@/lib/business": { requireBusiness: async () => ({ id: 2 }) },
    "@/lib/openrouter-documents": {
      askDocumentAi: async (id: number, source: string) => {
        assert.equal(id, 2);
        assert.match(source, /ไม่ใช่เอกสารจริง/);
        calls++;
        return { status: "complete" };
      },
    },
  };
  const context = vm.createContext({ console });
  const m = new vm.SourceTextModule(code, { context });
  await m.link(async (name) => {
    const values = deps[name];
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
  assert.equal(
    (await (m.namespace as any).testDocumentAi(2)).status,
    "forbidden"
  );
  assert.equal(calls, 0);
  role = "OWNER";
  assert.equal(
    (await (m.namespace as any).testDocumentAi(3)).status,
    "forbidden"
  );
  assert.equal(calls, 0);
  assert.equal(
    (await (m.namespace as any).testDocumentAi(2)).status,
    "complete"
  );
  assert.equal(calls, 1);
});

test("unknown or blank catalog prices fail closed before any OCR text is sent", async () => {
  const a = await aiModule();
  for (const price of [null, "", undefined, "unknown"]) {
    let calls = 0;
    const r = await a.askDocumentAi(
      2,
      text,
      async () => {
        calls++;
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "openrouter/free",
                pricing: { prompt: price, completion: "0" },
              },
            ],
          }),
        };
      },
      env
    );
    assert.equal(r.status, "unavailable");
    assert.equal(calls, 1);
  }
});
