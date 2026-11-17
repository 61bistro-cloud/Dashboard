import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  assertDatabaseEnvironment,
  assertDatabaseOperation,
  assertLocalDatabaseTool,
} from "../lib/database-safety.ts";
const remote = {
  DATABASE_URL: "postgresql://user:secret@example.neon.tech/db",
};
test("seed/schema tools fail before connecting to any remote or production database", () => {
  for (const env of [
    remote,
    {
      DATABASE_URL: "postgresql://localhost/db",
      DIRECT_URL: remote.DATABASE_URL,
    },
    { DATABASE_URL: "postgresql://localhost/db", NODE_ENV: "production" },
    { DATABASE_URL: "postgresql://localhost/db", VERCEL_ENV: "production" },
  ])
    assert.throws(() => assertLocalDatabaseTool(env));
  assert.doesNotThrow(() =>
    assertLocalDatabaseTool({
      DATABASE_URL: "postgresql://localhost/test",
      DIRECT_URL: "postgresql://127.0.0.1/test",
    })
  );
});
test("remote development permits reads but blocks writes and raw SQL", () => {
  for (const op of ["findMany", "findUnique", "groupBy", "count", "aggregate"])
    assert.doesNotThrow(() => assertDatabaseOperation(op, remote));
  for (const op of [
    "create",
    "update",
    "upsert",
    "delete",
    "deleteMany",
    "updateMany",
    "$executeRaw",
    "$queryRaw",
  ])
    assert.throws(() => assertDatabaseOperation(op, remote));
  assert.doesNotThrow(() =>
    assertDatabaseOperation("create", { ...remote, VERCEL_ENV: "production" })
  );
});
test("preview deployments cannot silently inherit a production database connection", () => {
  assert.throws(() =>
    assertDatabaseEnvironment({ ...remote, VERCEL_ENV: "preview" })
  );
  assert.throws(() =>
    assertDatabaseEnvironment({
      ...remote,
      VERCEL_ENV: "preview",
      DATABASE_ENVIRONMENT: "preview",
      PREVIEW_DATABASE_HOST: "other.neon.tech",
    })
  );
  assert.throws(() =>
    assertDatabaseEnvironment({
      ...remote,
      VERCEL_ENV: "preview",
      DATABASE_ENVIRONMENT: "preview",
      PREVIEW_DATABASE_HOST: "example.neon.tech",
      PRODUCTION_DATABASE_HOST: "example.neon.tech",
    })
  );
  assert.doesNotThrow(() =>
    assertDatabaseEnvironment({
      ...remote,
      VERCEL_ENV: "preview",
      DATABASE_ENVIRONMENT: "preview",
      PREVIEW_DATABASE_HOST: "example.neon.tech",
    })
  );
});
test("a stale selected business never falls back to a different shop for writes", async () => {
  let selected: any = "2",
    role = "ACCOUNTANT";
  const context = vm.createContext({ console });
  const dependencies: any = {
    "next/headers": {
      cookies: async () => ({
        get: () => (selected == null ? undefined : { value: selected }),
      }),
    },
    "@/auth": { auth: async () => ({ user: { id: "user1", role } }) },
    "@/lib/prisma": {
      prisma: {
        business: { findMany: async () => [{ id: 1, name: "A" }] },
        userBusiness: {
          findMany: async () => [{ business: { id: 1, name: "A" } }],
        },
      },
    },
  };
  const source = ts.transpileModule(
    readFileSync(new URL("../lib/business.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const m = new vm.SourceTextModule(source, { context });
  await m.link(async (name: string) => {
    const exports = dependencies[name];
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const k of Object.keys(exports)) this.setExport(k, exports[k]);
      },
      { context }
    );
  });
  await m.evaluate();
  const requireBusiness = (m.namespace as any).requireBusiness;
  for (const value of ["2", "invalid", "999", "0"]) {
    selected = value;
    await assert.rejects(requireBusiness());
    assert.equal(await (m.namespace as any).getCurrentBusiness(), null);
  }
  selected = "1";
  assert.equal((await requireBusiness()).id, 1);
  selected = undefined;
  assert.equal((await requireBusiness()).id, 1);
  role = "OWNER";
  selected = "2";
  await assert.rejects(requireBusiness());
});
test("build/install cannot seed or mutate the database; integrity snapshots use read-only transactions", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  );
  for (const key of ["build", "postinstall", "prepare"])
    assert.doesNotMatch(pkg.scripts[key], /seed|db push|migrate|reset/);
  const seed = readFileSync(
    new URL("../prisma/seed.ts", import.meta.url),
    "utf8"
  );
  assert.ok(
    seed.indexOf("assertLocalDatabaseTool();") <
      seed.indexOf("new PrismaClient")
  );
  const snapshot = readFileSync(
    new URL("../scripts/data-integrity.mjs", import.meta.url),
    "utf8"
  );
  assert.match(snapshot, /[\'"]Neon-Batch-Read-Only[\'"]\s*:\s*[\'"]true[\'"]/);
  assert.doesNotMatch(
    snapshot,
    /INSERT INTO|UPDATE "|DELETE FROM|DROP TABLE|TRUNCATE/
  );
});

test("integrity tool snapshots and detects a changed financial row without database writes", async () => {
  const { mkdtempSync, statSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "financial-integrity-"));
  const run = (amount: number, path: string, baseline?: string) => {
    const preload = `
   import assert from 'node:assert/strict';
   globalThis.fetch=async (url,options)=>{
    assert.equal(options.headers['Neon-Batch-Read-Only'],'true');
    assert.equal(options.headers['Neon-Batch-Isolation-Level'],'RepeatableRead');
    const queries=JSON.parse(options.body).queries;
    assert.ok(queries.every(q=>q.query.startsWith('SELECT ')));
    return {ok:true,json:async()=>({results:queries.map((q,i)=>({rows:i===0?[{readonly:'on'}]:q.query.includes('FROM "PosBill"')?[{record:JSON.stringify({id:'bill1',businessId:1,netAmount:${amount}})}]:[]}))})};
   };
  `;
    return spawnSync(
      process.execPath,
      [
        "--import",
        "data:text/javascript," + encodeURIComponent(preload),
        new URL("../scripts/data-integrity.mjs", import.meta.url).pathname,
        path,
        ...(baseline ? [baseline] : []),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://user:secret@example.neon.tech/db",
        },
      }
    );
  };
  try {
    const before = join(dir, "before.json");
    const first = run(100, before);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(statSync(before).mode & 0o777, 0o600);
    assert.equal(run(100, join(dir, "same.json"), before).status, 0);
    const changed = run(101, join(dir, "changed.json"), before);
    assert.equal(changed.status, 2, changed.stderr);
    const previous = JSON.parse(readFileSync(before, "utf8"));
    const next = JSON.parse(readFileSync(join(dir, "changed.json"), "utf8"));
    assert.notEqual(
      previous.fingerprints.PosBill.sha256,
      next.fingerprints.PosBill.sha256
    );
    assert.equal(
      previous.fingerprints.FixedCost.sha256,
      next.fingerprints.FixedCost.sha256
    );
    assert.doesNotMatch(changed.stdout, /secret|netAmount/);
    assert.equal(run(0, before).status, 1); // Never overwrite the recovery baseline.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
