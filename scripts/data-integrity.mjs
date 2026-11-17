// Read-only, consistent Neon snapshot. Never executes restore or mutation SQL.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
const tables = [
  "FiscalYear",
  "FiscalMonth",
  "Employee",
  "EmployeePayroll",
  "PayrollExtra",
  "Supplier",
  "SupplierPurchase",
  "FixedCostCategory",
  "FixedCost",
  "MonthlyRevenueOverride",
  "PosBill",
  "PosImportBatch",
  "BankAccount",
  "AccountOpening",
  "TransactionCategory",
  "BankTransaction",
  "MonthlyClosing",
  "ClosingAdjustment",
  "ClosingLog",
  "ReconItem",
  "ReconEntry",
  "DriveFile",
];
const out = process.argv[2];
if (!out || !process.env.DATABASE_URL)
  throw Error(
    "Usage: node --env-file=.env --use-env-proxy scripts/data-integrity.mjs /private/path/snapshot.json [baseline.json]"
  );
try {
  const connection = process.env.DATABASE_URL;
  const endpoint = new URL(connection);
  if (!endpoint.hostname.endsWith(".neon.tech"))
    throw Error("Neon connection required");
  const queries = [
    "SELECT current_setting('transaction_read_only') AS readonly",
    ...tables.map(
      (t) =>
        `SELECT to_jsonb(t) AS record FROM "${t}" t ORDER BY to_jsonb(t)::text`
    ),
    'SELECT id,name,slug,active FROM "Business" ORDER BY id',
  ];
  const response = await fetch(`https://${endpoint.hostname}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": connection,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "false",
      "Neon-Batch-Read-Only": "true",
      "Neon-Batch-Isolation-Level": "RepeatableRead",
    },
    body: JSON.stringify({
      queries: queries.map((query) => ({ query, params: [] })),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error("Snapshot query failed");
  const data = await response.json();
  if (data.results?.[0]?.rows?.[0]?.readonly !== "on")
    throw Error("Read-only transaction not verified");
  const records = Object.fromEntries(
    tables.map((t, i) => [
      t,
      data.results[i + 1].rows.map((r) =>
        typeof r.record === "string" ? JSON.parse(r.record) : r.record
      ),
    ])
  );
  const fingerprints = Object.fromEntries(
    tables.map((t) => [
      t,
      {
        count: records[t].length,
        sha256: createHash("sha256")
          .update(JSON.stringify(records[t]))
          .digest("hex"),
      },
    ])
  );
  const findings = [];
  for (const [child, parent, key] of [
    ["BankTransaction", "BankAccount", "accountId"],
    ["BankTransaction", "TransactionCategory", "categoryId"],
    ["AccountOpening", "BankAccount", "accountId"],
    ["SupplierPurchase", "Supplier", "supplierId"],
    ["EmployeePayroll", "Employee", "employeeId"],
    ["FixedCost", "FixedCostCategory", "categoryId"],
    ["ReconEntry", "ReconItem", "reconItemId"],
  ]) {
    const parents = new Map(records[parent].map((r) => [r.id, r]));
    const invalid = records[child].filter(
      (r) =>
        r[key] != null &&
        (!parents.has(r[key]) ||
          parents.get(r[key]).businessId !== r.businessId)
    );
    if (invalid.length)
      findings.push({
        issue: "ownership",
        table: child,
        count: invalid.length,
      });
  }
  const months = new Map(records.FiscalMonth.map((m) => [m.id, m]));
  const badDates = records.BankTransaction.filter((r) => {
    const m = months.get(r.fiscalMonthId);
    return (
      !m ||
      String(r.date).slice(0, 7) !==
        `${m.calendarYear}-${String(m.calendarMonth).padStart(2, "0")}`
    );
  });
  if (badDates.length)
    findings.push({
      issue: "statement-date-month-mismatch",
      count: badDates.length,
    });
  const hidden = new Set(
    records.BankAccount.filter((a) => !a.active).map((a) => a.id)
  );
  const hiddenCount = records.BankTransaction.filter((t) =>
    hidden.has(t.accountId)
  ).length;
  if (hiddenCount)
    findings.push({
      issue: "transactions-on-hidden-accounts",
      count: hiddenCount,
    });
  const groups = {};
  for (const t of [
    "EmployeePayroll",
    "PayrollExtra",
    "SupplierPurchase",
    "FixedCost",
    "MonthlyRevenueOverride",
    "BankTransaction",
  ])
    for (const r of records[t]) {
      const key = `${r.businessId}:${r.fiscalMonthId}:${t}`;
      const g = (groups[key] ??= {
        count: 0,
        amount: 0,
        deposit: 0,
        withdraw: 0,
      });
      g.count++;
      g.amount += r.amount ?? 0;
      g.deposit += r.deposit ?? 0;
      g.withdraw += r.withdraw ?? 0;
    }
  const snapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    databaseFingerprint: createHash("sha256")
      .update(endpoint.hostname + endpoint.pathname)
      .digest("hex"),
    readonly: true,
    businesses: data.results.at(-1).rows,
    fingerprints,
    findings,
    groups,
    records,
  };
  const path = resolve(out);
  if (path.startsWith(resolve(".") + "/"))
    throw Error("Store private snapshots outside repository");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
  let changed = [];
  if (process.argv[3]) {
    const before = JSON.parse(readFileSync(process.argv[3], "utf8"));
    if (before.databaseFingerprint !== snapshot.databaseFingerprint)
      throw Error("Database identity changed");
    changed = tables.filter(
      (t) => before.fingerprints[t]?.sha256 !== fingerprints[t].sha256
    );
  }
  console.log(
    JSON.stringify({
      snapshot: path,
      readonly: true,
      counts: Object.fromEntries(tables.map((t) => [t, fingerprints[t].count])),
      findings,
      changedTables: changed,
    })
  );
  if (changed.length) process.exitCode = 2;
} catch {
  console.error(
    "Integrity check failed. Credentials and record contents withheld."
  );
  process.exitCode = 1;
}
