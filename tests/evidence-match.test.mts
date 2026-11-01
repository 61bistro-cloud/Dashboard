import { mergeConfirmedRemark } from "../lib/evidence-category.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { Readable } from "node:stream";
import { z } from "zod";
import {
  extractEvidenceFields,
  suggestEvidenceMatches,
  readEvidenceOcr,
  writeEvidenceOcr,
} from "../lib/evidence-match.ts";

const helpers = {
  extractEvidenceFields,
  suggestEvidenceMatches,
  readEvidenceOcr,
  writeEvidenceOcr,
};
test("reads Thai/BE, English/CE, numeric and ISO slip dates and labelled amounts", () => {
  for (const date of [
    "1 ต.ค. 2569",
    "01/10/69",
    "1 October 2026",
    "2026-10-01",
  ]) {
    assert.deepEqual(
      extractEvidenceFields(
        `${date}\n20:17:40\nจำนวนเงิน\n2,078.00 บาท\nค่าธรรมเนียม 10.00`
      ),
      { amount: 2078, date: "2026-10-01", time: "20:17" }
    );
  }
  assert.equal(
    extractEvidenceFields("๑ ต.ค. ๒๕๖๙\nจำนวนเงิน ๒,๐๐๐.๐๐ บาท").amount,
    2000
  );
});
test("ambiguous money and invalid dates remain unknown instead of inventing a match", () => {
  assert.equal(extractEvidenceFields("31/02/2026\n100.00\n200.00").date, null);
  assert.equal(extractEvidenceFields("100.00\n200.00").amount, null);
  assert.equal(extractEvidenceFields("no amount").amount, null);
});
const tx = (
  id: number,
  time = "20:17",
  amount = 2078,
  date = "2026-10-01"
) => ({
  id,
  date: `${date}T${time}:00.000Z`,
  description: "recipient",
  deposit: 0,
  withdraw: amount,
  accountId: 7,
  accountName: "test bank",
});
test("same amount/date suggestions preserve ambiguity and rank by time without automatic confirmation", () => {
  const results = suggestEvidenceMatches(
    { amount: 2078, date: "2026-10-01", time: "20:17" },
    [
      tx(1, "10:00"),
      tx(2),
      tx(3, "20:17", 2079),
      tx(4, "20:17", 2078, "2026-10-02"),
    ]
  );
  assert.deepEqual(
    results.map((r) => r.transactionId),
    [2, 1]
  );
  assert.ok(results[0].reasons.some((r) => r.includes("เวลา")));
  assert.deepEqual(
    suggestEvidenceMatches({ amount: 2078, date: null, time: null }, [tx(1)]),
    []
  );
  assert.equal(
    suggestEvidenceMatches({ amount: 2078, date: "2026-10-01", time: null }, [
      { ...tx(1), deposit: 2078, withdraw: 0 },
    ]).length,
    1
  );
});
test("OCR metadata preserves original notes/upload retry IDs and replaces only its own section", () => {
  const note = "WEB_UPLOAD:uuid note from LINE";
  const saved = writeEvidenceOcr(note, "1 ต.ค. 2569\nจำนวนเงิน 50.00");
  assert.ok(saved.startsWith(note));
  assert.equal(readEvidenceOcr(saved)!.amount, 50);
  const updated = writeEvidenceOcr(saved, "01/10/2026\nจำนวนเงิน 60.00");
  assert.equal(readEvidenceOcr(updated)!.amount, 60);
  assert.equal(updated.split("EVIDENCE_OCR_V1:").length, 2);
  assert.equal(readEvidenceOcr("unrelated note"), null);
});
async function load(
  path: string,
  deps: Record<string, any>,
  dynamic?: (name: string) => any
) {
  const context = vm.createContext({ console, Buffer, process: { env: {} } });
  const make = (exports: any) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const key of Object.keys(exports))
          this.setExport(key, exports[key]);
      },
      { context }
    );
  const source = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }
  ).outputText;
  const module = new vm.SourceTextModule(source, {
    context,
    importModuleDynamically: async (name) => {
      assert.ok(dynamic);
      const mod = make(await dynamic!(name));
      await mod.link(() => {
        throw new Error("unexpected import");
      });
      await mod.evaluate();
      return mod;
    },
  });
  await module.link(async (name) => {
    assert.ok(deps[name], name);
    return make(deps[name]);
  });
  await module.evaluate();
  return module.namespace as any;
}
const input = { businessId: 7, fileId: 11, monthId: 7, transactionId: 22 };
async function actions(
  options: {
    role?: string;
    businessId?: number;
    fileBusinessId?: number;
    fileMonthId?: number;
    refType?: string | null;
    refId?: string | null;
    note?: string;
    validTx?: boolean;
    updateCount?: number;
  } = {}
) {
  const writes: any[] = [],
    invalidations: string[] = [];
  let ocrCalls = 0;
  const file = {
    id: 11,
    businessId: options.fileBusinessId ?? 7,
    fiscalMonthId: options.fileMonthId ?? 7,
    driveFileId: "original-file",
    refType: options.refType ?? null,
    refId: options.refId ?? null,
    note: options.note ?? "WEB_UPLOAD:keep",
  };
  const prisma = {
    driveFile: {
      findFirst: async ({ where }: any) =>
        where.businessId === file.businessId &&
        where.fiscalMonthId === file.fiscalMonthId
          ? file
          : null,
      updateMany: async (query: any) => {
        writes.push(query);
        return { count: options.updateCount ?? 1 };
      },
    },
    bankTransaction: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.businessId, 7);
        assert.equal(where.fiscalMonthId, 7);
        return options.validTx === false ? null : { id: 22 };
      },
    },
  };
  const module = await load(
    "../app/(app)/bank/evidence/actions.ts",
    {
      zod: { z },
      "@/auth": {
        auth: async () => ({ user: { role: options.role ?? "OWNER" } }),
      },
      "@/lib/business": {
        requireBusiness: async () => ({ id: options.businessId ?? 7 }),
      },
      "@/lib/prisma": { prisma },
      "next/cache": {
        revalidatePath: (path: string) => invalidations.push(path),
      },
      "@/lib/evidence-match": helpers,
      "@/lib/evidence-category": { mergeConfirmedRemark },
    },
    async (name) => {
      assert.equal(name, "@/lib/google");
      return {
        readEvidenceText: async (biz: number, id: string) => {
          assert.equal(biz, 7);
          assert.equal(id, "original-file");
          ocrCalls++;
          return "1 ต.ค. 2569\nจำนวนเงิน 2,078.00";
        },
      };
    }
  );
  return { module, writes, invalidations, ocrCalls: () => ocrCalls };
}
test("confirmation links evidence only, scopes every write and never creates financial rows", async () => {
  const h = await actions();
  assert.equal((await h.module.confirmEvidenceMatch(input)).ok, true);
  assert.equal(h.writes.length, 1);
  const write = h.writes[0];
  assert.equal(write.where.businessId, 7);
  assert.equal(write.where.fiscalMonthId, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(write.data)), {
    refType: "BANK_TX",
    refId: "22",
  });
  assert.ok(h.invalidations.includes("/bank"));
});
test("wrong role, switched business, other-business/month files and wrong-month transactions cannot be linked", async () => {
  for (const options of [
    { role: "STAFF" },
    { businessId: 8 },
    { fileBusinessId: 8 },
    { fileMonthId: 8 },
    { validTx: false },
  ]) {
    const h = await actions(options);
    assert.equal((await h.module.confirmEvidenceMatch(input)).ok, false);
    assert.equal(h.writes.length, 0);
  }
});
test("existing links must be unlinked explicitly; concurrent link changes are rejected", async () => {
  for (const options of [
    { refType: "BANK_TX", refId: "99" },
    { refType: "PURCHASE", refId: "22" },
  ]) {
    const h = await actions(options);
    assert.equal((await h.module.confirmEvidenceMatch(input)).ok, false);
    assert.equal(h.writes.length, 0);
  }
  const h = await actions({ updateCount: 0 });
  assert.equal((await h.module.confirmEvidenceMatch(input)).ok, false);
  const linked = await actions({ refType: "BANK_TX", refId: "22" });
  assert.equal((await linked.module.unlinkEvidence(input)).ok, true);
  assert.equal(linked.writes[0].where.refId, "22");
  assert.equal(linked.writes[0].data.refType, null);
});
test("reading caches text in evidence metadata and reuses it without changing confirmed links", async () => {
  const h = await actions();
  const result = await h.module.readEvidence(input);
  assert.equal(result.ok, true);
  assert.equal(result.fields.amount, 2078);
  assert.equal(h.ocrCalls(), 1);
  assert.deepEqual(Object.keys(h.writes[0].data), ["note"]);
  assert.ok(h.writes[0].data.note.startsWith("WEB_UPLOAD:keep"));
  const cached = await actions({ note: h.writes[0].data.note });
  assert.equal((await cached.module.readEvidence(input)).ok, true);
  assert.equal(cached.ocrCalls(), 0);
  assert.equal(cached.writes.length, 0);
});
async function google(failExport = false) {
  const operations: any[] = [];
  const files = {
    get: async (query: any) => {
      assert.equal(query.fileId, "original-file");
      return query.alt
        ? { data: Buffer.from("image") }
        : { data: { mimeType: "image/jpeg", size: "100" } };
    },
    create: async (query: any) => {
      operations.push(["create", query]);
      return { data: { id: "temporary-doc" } };
    },
    export: async (query: any) => {
      assert.equal(query.fileId, "temporary-doc");
      if (failExport) throw new Error("OCR unavailable");
      return { data: "จำนวนเงิน 100.00" };
    },
    update: async (query: any) => {
      operations.push(["update", query]);
      return { data: {} };
    },
  };
  class OAuth2 {
    setCredentials() {}
  }
  const module = await load("../lib/google.ts", {
    stream: { Readable },
    googleapis: { google: { auth: { OAuth2 }, drive: () => ({ files }) } },
    "@/lib/prisma": {
      prisma: {
        business: {
          findUnique: async () => ({
            id: 7,
            name: "Test",
            googleRefreshToken: "test-only",
            driveRootFolderId: "app-root",
          }),
        },
      },
    },
  });
  return { module, operations };
}
test("Drive OCR uses existing connection and trashes only the newly created temporary document", async () => {
  for (const fail of [false, true]) {
    const h = await google(fail);
    if (fail)
      await assert.rejects(h.module.readEvidenceText(7, "original-file"));
    else
      assert.equal(
        await h.module.readEvidenceText(7, "original-file"),
        "จำนวนเงิน 100.00"
      );
    const create = h.operations.find(([op]) => op === "create")[1];
    assert.equal(
      create.requestBody.mimeType,
      "application/vnd.google-apps.document"
    );
    assert.equal(create.ocrLanguage, "th");
    const updates = h.operations.filter(([op]) => op === "update");
    assert.equal(updates.length, 1);
    assert.equal(updates[0][1].fileId, "temporary-doc");
    assert.equal(updates[0][1].requestBody.trashed, true);
  }
});
