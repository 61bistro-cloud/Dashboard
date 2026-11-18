import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import * as grab from "../lib/grab-report.ts";
import { fixtureCsv, fixtureRow } from "./fixtures/grab-csv.ts";
const plain = (v: any) => JSON.parse(JSON.stringify(v));
async function harness(role = "OWNER") {
  let records: any[] = [];
  const queries: any[] = [],
    writes: any[] = [],
    invalidated: string[] = [];
  const state = {
    connected: true,
    failUpload: false,
    failCommit: false,
    staleDuringUpload: false,
    month: 10,
  };
  let uploads = 0;
  const db: any = {
    fiscalMonth: {
      findUnique: async () => ({
        id: 7,
        calendarYear: 2026,
        calendarMonth: state.month,
        daysInMonth: 31,
      }),
    },
    business: {
      findUnique: async () => ({
        googleRefreshToken: state.connected ? "test-token" : null,
      }),
    },
    driveFile: {
      findMany: async ({ where }: any) => {
        queries.push(where);
        assert.equal(where.businessId, 2);
        assert.equal(where.kind, "GRAB_REPORT");
        return plain(records);
      },
      create: async ({ data }: any) => {
        if (state.failCommit) throw Error("DB failed");
        assert.equal(data.businessId, 2);
        assert.equal(data.kind, "GRAB_REPORT");
        assert.equal(data.driveFileId, "uploaded-original-id");
        writes.push(plain(data));
        const r = { id: records.length + 1, ...data };
        records.push(r);
        return r;
      },
    },
  };
  db.$transaction = async (fn: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    const before = plain(records);
    try {
      return await fn(db);
    } catch (e) {
      records = before;
      throw e;
    }
  };
  const deps: any = {
    "server-only": {},
    "node:crypto": crypto,
    "@/auth": {
      auth: async () =>
        role === "NONE" ? null : { user: { role, id: "user", name: "Tester" } },
    },
    "@/lib/business": { requireBusiness: async () => ({ id: 2 }) },
    "@/lib/prisma": { prisma: db },
    "./prisma": { prisma: db },
    "@/lib/google": {
      uploadGrabReport: async (id: number, prefix: string, file: any) => {
        uploads++;
        assert.equal(id, 2);
        assert.equal(prefix, "2026-10");
        assert.equal(file.mimeType, "text/csv");
        assert.ok(file.buffer.length);
        if (state.failUpload) throw Error("Drive failed");
        if (state.staleDuringUpload)
          records.push({
            id: 99,
            note: grab.encodeGrabReport({
              version: 1,
              rows: [
                {
                  ...grab.parseGrabCsv(fixtureCsv()).rows[0],
                  transactionId: "concurrent",
                },
              ],
            }),
          });
        return {
          driveFileId: "uploaded-original-id",
          webViewLink:
            "https://drive.google.com/file/d/uploaded-original-id/view",
        };
      },
    },
    "@/lib/grab-report": grab,
    "./grab-report": grab,
    "./bank-account-options": { supportsStatement: () => true },
    "./grab-reconciliation": {
      reconcileGrabPos: () => {},
      reconcileGrabBank: () => {},
    },
    "next/cache": { revalidatePath: (path: string) => invalidated.push(path) },
  };
  const context = vm.createContext({
    console,
    File,
    FormData,
    Buffer,
    TextDecoder,
    TextEncoder,
    Date,
  });
  const modules = new Map<string, vm.Module>();
  async function load(name: string): Promise<vm.Module> {
    if (modules.has(name)) return modules.get(name)!;
    if (deps[name]) {
      const exp = deps[name];
      const m = new vm.SyntheticModule(
        Object.keys(exp),
        function () {
          for (const k of Object.keys(exp)) this.setExport(k, exp[k]);
        },
        { context }
      );
      modules.set(name, m);
      return m;
    }
    const path =
      name === "@/lib/grab-data"
        ? "../lib/grab-data.ts"
        : "../app/(app)/bank/grab/actions.ts";
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
    run: (m.namespace as any).importGrabCsv,
    state,
    writes,
    queries,
    invalidated,
    uploads: () => uploads,
    records: () => records,
  };
}
function form(source = fixtureCsv(), mode = "preview", token = "") {
  const f = new FormData();
  f.set("businessId", "2");
  f.set("monthId", "7");
  f.set("file", new File([source], "Grab.csv", { type: "text/csv" }));
  f.set("mode", mode);
  f.set("token", token);
  f.set("confirmed", "true");
  return f;
}
test("preview is read-only; commit stores original-backed report metadata only and keeps POS/P&L untouched", async () => {
  const h = await harness();
  const preview = await h.run(form());
  assert.equal(preview.ok, true);
  assert.equal(preview.preview.newCount, 1);
  assert.equal(h.uploads(), 0);
  assert.equal(h.writes.length, 0);
  const saved = await h.run(
    form(fixtureCsv(), "commit", preview.preview.token)
  );
  assert.equal(saved.ok, true);
  assert.equal(saved.saved, 1);
  assert.equal(h.uploads(), 1);
  assert.equal(h.writes.length, 1);
  assert.ok(h.invalidated.includes("/"));
  assert.ok(h.invalidated.includes("/bank/grab"));
  assert.deepEqual(
    grab.decodeGrabReport(h.writes[0].note).rows,
    grab.parseGrabCsv(fixtureCsv()).rows
  );
  // The mock exposes no financial mutation methods: any accidental use fails.
  assert.ok(!h.invalidated.includes("/closing"));
});
test("repeat and overlapping CSV imports deduplicate by long transaction ID", async () => {
  const h = await harness();
  let p = await h.run(form());
  await h.run(form(fixtureCsv(), "commit", p.preview.token));
  p = await h.run(form());
  assert.equal(p.preview.newCount, 0);
  assert.equal(p.preview.duplicateCount, 1);
  assert.equal(
    (await h.run(form(fixtureCsv(), "commit", p.preview.token))).saved,
    0
  );
  assert.equal(h.uploads(), 1);
  const more = [...fixtureRow];
  more[8] = "new-tx";
  more[9] = "new-order";
  const csv = fixtureCsv([fixtureRow, more]);
  p = await h.run(form(csv));
  assert.equal(p.preview.newCount, 1);
  assert.equal((await h.run(form(csv, "commit", p.preview.token))).saved, 1);
  assert.equal(h.records().length, 2);
  assert.equal(grab.decodeGrabReport(h.records()[1].note).rows.length, 1);
});
test("unauthorized, wrong-business/month, mismatched stores and changed duplicates cannot import", async () => {
  for (const role of ["STAFF", "NONE"]) {
    const h = await harness(role);
    assert.equal((await h.run(form())).ok, false);
    assert.equal(h.queries.length, 0);
    assert.equal(h.uploads(), 0);
  }
  const h = await harness();
  const wrong = form();
  wrong.set("businessId", "3");
  assert.equal((await h.run(wrong)).message, "grab.business");
  h.state.month = 11;
  assert.equal((await h.run(form())).message, "grab.month");
  h.state.month = 10;
  const p = await h.run(form());
  await h.run(form(fixtureCsv(), "commit", p.preview.token));
  const other = [...fixtureRow];
  other[3] = "store-foreign";
  other[8] = "other-tx";
  assert.equal(
    (await h.run(form(fixtureCsv([other])))).message,
    "grab.storeMismatch"
  );
  other[3] = fixtureRow[3];
  other[8] = fixtureRow[8];
  other[16] = "209";
  assert.equal(
    (await h.run(form(fixtureCsv([other])))).message,
    "grab.conflict"
  );
  assert.equal(h.writes.length, 1);
});
test("unconfirmed or tampered previews and concurrent imports fail without overwriting anything", async () => {
  const h = await harness();
  const p = await h.run(form());
  const unconfirmed = form(fixtureCsv(), "commit", p.preview.token);
  unconfirmed.set("confirmed", "false");
  assert.equal((await h.run(unconfirmed)).message, "grab.stale");
  const changed = [...fixtureRow];
  changed[8] = "different";
  assert.equal(
    (await h.run(form(fixtureCsv([changed]), "commit", p.preview.token)))
      .message,
    "grab.stale"
  );
  assert.equal(h.uploads(), 0);
  h.state.staleDuringUpload = true;
  assert.equal(
    (await h.run(form(fixtureCsv(), "commit", p.preview.token))).message,
    "grab.stale"
  );
  assert.equal(h.writes.length, 0);
  assert.equal(h.records().length, 1);
});
test("Drive/DB failures retain original data, no partial metadata commits and no false success", async () => {
  for (const failure of ["failUpload", "failCommit"] as const) {
    const h = await harness();
    const p = await h.run(form());
    h.state[failure] = true;
    const result = await h.run(form(fixtureCsv(), "commit", p.preview.token));
    assert.equal(result.ok, false);
    assert.equal(h.records().length, 0);
    assert.equal(h.invalidated.length, 0);
  }
  const h = await harness();
  h.state.connected = false;
  const p = await h.run(form());
  assert.equal(
    (await h.run(form(fixtureCsv(), "commit", p.preview.token))).message,
    "grab.connect"
  );
  assert.equal(h.uploads(), 0);
});
