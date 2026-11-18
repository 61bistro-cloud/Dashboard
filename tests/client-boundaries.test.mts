import assert from "node:assert/strict";
import { test } from "node:test";
import { build, type Plugin } from "esbuild";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const nextServerProxies: Plugin = {
  name: "next-server-proxies",
  setup(b) {
    b.onResolve({ filter: /^next\/link$|^next\/navigation$/ }, ({ path }) => ({
      path,
      namespace: "next-proxy",
    }));
    b.onLoad({ filter: /.*/, namespace: "next-proxy" }, ({ path }) => ({
      contents:
        path === "next/link"
          ? "export default function Link(){return null}"
          : 'export const useRouter=()=>({});export const usePathname=()=>"/";export const useSearchParams=()=>new URLSearchParams();',
      loader: "js",
    }));
    b.onLoad({ filter: /\.[jt]sx?$/ }, ({ path }) => {
      if (!path.startsWith(root + "/") || path.includes("/node_modules/"))
        return;
      const text = readFileSync(path, "utf8");
      if (!/^\s*["']use server["']/.test(text)) return;
      // Next replaces action modules with client proxies. Do the same, while keeping
      // actual fiscal utilities, Prisma, and every other client dependency unmocked.
      const names = [
        ...text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g),
      ].map((m) => m[1]);
      return {
        contents: names
          .map(
            (n) =>
              `export function ${n}(){throw Error('No server writes in client boundary tests')}`
          )
          .join("\n"),
        loader: "js",
      };
    });
  },
};
async function bundle(contents: string) {
  return build({
    stdin: { contents, resolveDir: root, loader: "ts" },
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "iife",
    alias: { "@": root },
    define: { "process.env": "{}", global: "globalThis" },
    plugins: [nextServerProxies],
    logLevel: "silent",
  });
}
function assertClientOnly(result: Awaited<ReturnType<typeof bundle>>) {
  const paths = Object.keys(result.metafile!.inputs);
  assert.deepEqual(
    paths.filter((p) =>
      /lib\/(prisma|fiscal-server|database-safety)\.|@prisma\/client|\.prisma\/client/.test(
        p
      )
    ),
    [],
    "Client modules must never load database runtime code"
  );
  const context = {
    window: {} as Record<string, any>,
    console,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(result.outputFiles[0].text, context, { timeout: 5000 });
  return context.window;
}
test("actual browser fiscal utilities load without Prisma initialization or server-only imports", async () => {
  const result = await bundle(
    'import {fmtTHB,calendarToFiscalIndex,SUPPLIER_CATEGORY_LABELS} from "./lib/fiscal";window.values=[fmtTHB(1234.5),fmtTHB(-100),fmtTHB(0),calendarToFiscalIndex(4),SUPPLIER_CATEGORY_LABELS.FOOD.label];'
  );
  const w = assertClientOnly(result);
  assert.equal(w.values[0], "1,234.50");
  assert.equal(w.values[1], "(100.00)");
  assert.equal(w.values[2], "-");
  assert.equal(w.values[3], 1);
});
for (const path of [
  "app/(app)/admin/users/_components/customer-onboarding.tsx",
  "app/(app)/admin/users/_components/add-user-form.tsx",
  "app/(app)/admin/users/_components/user-businesses.tsx",
  "components/sidebar-nav.tsx",
  "app/(app)/bank/grab/_components/grab-upload.tsx",
  "app/(app)/bank/grab/_components/grab-details.tsx",
  "app/(app)/cost-setup/_components/statement-expenses-panel.tsx",
  "app/(app)/bank/_components/transaction-table.tsx",
  "app/(app)/bank/_components/transaction-remark.tsx",
  "app/(app)/bank/_components/statement-upload.tsx",
  "app/(app)/bank/evidence/_components/evidence-matcher.tsx",
  "app/(app)/closing/_components/adjustments.tsx",
  "app/(app)/cost-setup/_components/supplier-section.tsx",
  "app/(app)/business-advice/_components/advice-planner.tsx",
  "app/(app)/bank/evidence/_components/document-review-panel.tsx",
  "app/(app)/admin/google/_components/document-ai-test.tsx",
])
  test(`real client import graph stays browser-safe: ${path}`, async () => {
    const result = await bundle(
      `import * as component from ${JSON.stringify("./" + path)};window.loaded=Object.keys(component);`
    );
    assert.ok(assertClientOnly(result).loaded.length > 0);
  });
