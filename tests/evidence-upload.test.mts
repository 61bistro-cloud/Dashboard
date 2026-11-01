import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import {
  MAX_EVIDENCE_BYTES,
  uploadEvidenceQueue,
  type EvidenceUploadItem,
} from "../lib/evidence-upload.ts";

const context = { businessId: 7, kind: "SLIP" as const, fiscalMonthId: "8" };
const item = (id: string, name = `${id}.jpg`): EvidenceUploadItem => ({
  id,
  file: new File(["image"], name, { type: "image/jpeg" }),
  status: "pending",
});

test("a large selection uses one file per request with the same business, month and kind", async () => {
  const items = Array.from({ length: 35 }, (_, i) => item(String(i)));
  let active = 0,
    maxActive = 0;
  const sent: FormData[] = [];
  const statuses: any[] = [];
  const result = await uploadEvidenceQueue(
    items,
    context,
    async (data) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      sent.push(data);
      active--;
      return { ok: true };
    },
    (...args) => statuses.push(args)
  );
  assert.deepEqual(result, { succeeded: 35, failed: 0 });
  assert.equal(maxActive, 1);
  sent.forEach((data, i) => {
    assert.equal(data.getAll("file").length, 1);
    assert.equal(data.get("businessId"), "7");
    assert.equal(data.get("kind"), "SLIP");
    assert.equal(data.get("fiscalMonthId"), "8");
    assert.equal(data.get("uploadId"), String(i));
  });
  assert.equal(
    statuses.filter(([, status]) => status === "success").length,
    35
  );
});
test("one failed/throwing file does not stop the rest; retries skip successes and reuse IDs", async () => {
  const items = [item("1"), item("2"), item("3"), item("4")];
  const statuses = new Map<string, any>();
  const update = (id: string, status: any) => {
    statuses.set(id, status);
  };
  const result = await uploadEvidenceQueue(
    items,
    context,
    async (data) => {
      if (data.get("uploadId") === "2")
        return { ok: false, message: "Drive unavailable" };
      if (data.get("uploadId") === "3") throw new Error("network");
      return { ok: true };
    },
    update
  );
  assert.deepEqual(result, { succeeded: 2, failed: 2 });
  const retry = items.map((row) => ({ ...row, status: statuses.get(row.id) }));
  const ids: string[] = [];
  await uploadEvidenceQueue(
    retry,
    context,
    async (data) => {
      ids.push(String(data.get("uploadId")));
      return { ok: true };
    },
    update
  );
  assert.deepEqual(ids, ["2", "3"]);
});
test("empty, oversized and unsupported files are rejected per file without blocking valid images/PDFs", async () => {
  const items = [
    {
      ...item("empty"),
      file: new File([], "empty.jpg", { type: "image/jpeg" }),
    },
    {
      ...item("big"),
      file: new File([new Uint8Array(MAX_EVIDENCE_BYTES + 1)], "big.jpg", {
        type: "image/jpeg",
      }),
    },
    {
      ...item("bad"),
      file: new File(["text"], "bad.txt", { type: "text/plain" }),
    },
    item("ok"),
    {
      ...item("pdf"),
      file: new File(["pdf"], "receipt.pdf", { type: "application/pdf" }),
    },
  ];
  let uploads = 0;
  const result = await uploadEvidenceQueue(
    items,
    context,
    async () => {
      uploads++;
      return { ok: true };
    },
    () => {}
  );
  assert.deepEqual(result, { succeeded: 2, failed: 3 });
  assert.equal(uploads, 2);
});

async function server({
  role = "OWNER",
  authenticated = true,
  exists = false,
} = {}) {
  const writes: any[] = [];
  const uploads: any[] = [];
  const invalidations: string[] = [];
  const prisma = {
    driveFile: {
      findFirst: async (query: any) => {
        assert.equal(query.where.businessId, 7);
        return exists
          ? {
              webViewLink: "https://example.test/existing",
              kind: "SLIP",
              fiscalMonthId: 8,
            }
          : null;
      },
      create: async (data: any) => writes.push(data),
    },
    fiscalMonth: {
      findUnique: async ({ where }: any) =>
        where.id === 8 ? { calendarYear: 2026, calendarMonth: 10 } : null,
    },
  };
  const ctx = vm.createContext({ File, FormData, Buffer, console });
  const deps: Record<string, any> = {
    "@/lib/evidence-upload": { MAX_EVIDENCE_BYTES },
    zod: { z },
    "next/cache": {
      revalidatePath: (path: string) => invalidations.push(path),
    },
    "@/auth": {
      auth: async () =>
        authenticated ? { user: { role, name: "Test user" } } : null,
    },
    "@/lib/prisma": { prisma },
    "@/lib/business": { requireBusiness: async () => ({ id: 7 }) },
    "@/lib/google": {
      ensureStructure() {},
      syncMaster() {},
      uploadEvidence: async (...args: any[]) => {
        uploads.push(args);
        return {
          driveFileId: "test-file",
          webViewLink: "https://example.test/file",
        };
      },
    },
    "@/lib/google-sheets-data": { buildMasterTabs() {} },
  };
  const code = ts.transpileModule(
    readFileSync(
      new URL("../app/(app)/admin/google/actions.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }
  ).outputText;
  const module = new vm.SourceTextModule(code, { context: ctx });
  await module.link(async (name) => {
    const exports = deps[name];
    assert.ok(exports, name);
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const key of Object.keys(exports))
          this.setExport(key, exports[key]);
      },
      { context: ctx }
    );
  });
  await module.evaluate();
  return {
    upload: (module.namespace as any).uploadEvidenceFile,
    writes,
    uploads,
    invalidations,
  };
}
function form() {
  const data = new FormData();
  data.append("businessId", "7");
  data.append("uploadId", "154b386f-c60b-48e1-8e90-9a3a2bdd043b");
  data.append("kind", "SLIP");
  data.append("fiscalMonthId", "8");
  data.append("file", new File(["image"], "slip.jpg", { type: "image/jpeg" }));
  return data;
}

test("server saves each file to the selected historical month and business", async () => {
  const h = await server();
  assert.equal((await h.upload(form())).ok, true);
  assert.equal(h.uploads[0][0], 7);
  assert.equal(h.uploads[0][1], "SLIP");
  assert.equal(h.uploads[0][2], "2026-10");
  assert.equal(h.writes[0].data.businessId, 7);
  assert.equal(h.writes[0].data.fiscalMonthId, 8);
  assert.ok(h.writes[0].data.note.startsWith("WEB_UPLOAD:"));
});
test("retry after a completed save returns the existing file without uploading twice", async () => {
  const h = await server({ exists: true });
  assert.equal((await h.upload(form())).ok, true);
  assert.equal(h.uploads.length, 0);
  assert.equal(h.writes.length, 0);
  const data = form();
  data.set("kind", "BILL");
  assert.equal((await h.upload(data)).ok, false);
});
test("business changes, unknown/missing months and invalid files cannot write", async () => {
  for (const change of [
    (data: FormData) => data.set("businessId", "9"),
    (data: FormData) => data.set("fiscalMonthId", "99"),
    (data: FormData) => data.delete("fiscalMonthId"),
    (data: FormData) =>
      data.set("file", new File(["text"], "bad.txt", { type: "text/plain" })),
    (data: FormData) =>
      data.set(
        "file",
        new File([new Uint8Array(MAX_EVIDENCE_BYTES + 1)], "big.jpg", {
          type: "image/jpeg",
        })
      ),
  ]) {
    const h = await server();
    const data = form();
    change(data);
    assert.equal((await h.upload(data)).ok, false);
    assert.equal(h.uploads.length, 0);
    assert.equal(h.writes.length, 0);
  }
});
test("only authenticated owner/accountant sessions may upload", async () => {
  for (const options of [{ authenticated: false }, { role: "STAFF" }]) {
    const h = await server(options);
    assert.equal((await h.upload(form())).ok, false);
    assert.equal(h.uploads.length, 0);
  }
  const h = await server({ role: "ACCOUNTANT" });
  assert.equal((await h.upload(form())).ok, true);
});
