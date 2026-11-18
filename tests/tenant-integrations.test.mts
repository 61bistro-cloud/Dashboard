import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import * as state from "../lib/google-oauth-state.ts";
import { loadModules } from "./helpers/modules.mts";
test("Drive OAuth state binds nonce, actor, business and expiry", () => {
  const a = state.newGoogleState("customer", 4, 1000);
  assert.equal(
    state.validGoogleState(a.cookie, a.state, "customer", 4, 1001),
    true
  );
  for (const args of [
    [a.cookie, a.state, "other", 4, 1001],
    [a.cookie, a.state, "customer", 2, 1001],
    [a.cookie, "forged", "customer", 4, 1001],
    [a.cookie, a.state, "customer", 4, 601000],
    ["broken", a.state, "customer", 4, 1001],
  ] as const)
    assert.equal(state.validGoogleState(...args), false);
});
test("Drive callbacks reject switched/foreign business and forged state before exchanging credentials", async () => {
  const original = state.newGoogleState("customer", 4);
  let current = 4,
    cookie = original.cookie,
    exchanges = 0,
    writes = 0;
  const cb = await loadModules("app/api/google/callback/route.ts", {
    "@/auth": {
      auth: async () => ({ user: { id: "customer", role: "OWNER" } }),
    },
    "next/headers": {
      cookies: async () => ({ get: () => ({ value: cookie }), delete() {} }),
    },
    "@/lib/business": { getCurrentBusiness: async () => ({ id: current }) },
    "@/lib/prisma": {
      prisma: {
        business: {
          update: async (q: any) => {
            assert.equal(q.where.id, 4);
            writes++;
          },
        },
      },
    },
    "@/lib/google-oauth-state": state,
    "@/lib/google": {
      exchangeCode: async () => {
        exchanges++;
        return { refreshToken: "new-own-token", email: "own@example.com" };
      },
    },
  });
  const request = (nonce = original.state) =>
    new Request(
      "https://app.test/api/google/callback?code=code&state=" + nonce
    );
  current = 2;
  assert.match((await cb.GET(request())).headers.get("location"), /forbidden/);
  assert.equal(exchanges, 0);
  current = 4;
  assert.match(
    (await cb.GET(request("forged"))).headers.get("location"),
    /forbidden/
  );
  assert.equal(exchanges, 0);
  cookie = state.newGoogleState("other", 4).cookie;
  await cb.GET(request());
  assert.equal(exchanges, 0);
  cookie = original.cookie;
  assert.match(
    (await cb.GET(request())).headers.get("location"),
    /connected=1/
  );
  assert.equal(exchanges, 1);
  assert.equal(writes, 1);
});
test("attachments cannot reference another tenant's bank, purchase, closing or POS before upload", async () => {
  let uploads = 0,
    writes = 0;
  const find = async ({ where }: any) =>
    where.businessId === 4 && where.id === 10 ? { id: 10 } : null;
  const action = await loadModules("app/(app)/attachments/actions.ts", {
    zod: { z },
    "@/auth": {
      auth: async () => ({ user: { role: "OWNER", id: "customer" } }),
    },
    "@/lib/business": { requireBusiness: async () => ({ id: 4 }) },
    "@/lib/prisma": {
      prisma: {
        fiscalMonth: {
          findUnique: async () => ({
            calendarYear: 2026,
            calendarMonth: 10,
            daysInMonth: 31,
          }),
        },
        bankTransaction: { findFirst: find },
        supplierPurchase: { findFirst: find },
        monthlyClosing: { findFirst: find },
        posBill: {
          findFirst: async ({ where }: any) =>
            where.businessId === 4 && where.id === "ownPOS"
              ? { businessDate: "2026-10-01" }
              : null,
        },
        driveFile: {
          create: async ({ data }: any) => {
            assert.equal(data.businessId, 4);
            writes++;
          },
        },
      },
    },
    "@/lib/google": {
      uploadEvidence: async (id: number) => {
        assert.equal(id, 4);
        uploads++;
        return {
          driveFileId: "ownFile",
          webViewLink: "https://drive.google.com/own",
        };
      },
    },
    "next/cache": { revalidatePath() {} },
  });
  const form = (type: string, id: string) => {
    const f = new FormData();
    f.set("refType", type);
    f.set("refId", id);
    f.set("fiscalMonthId", "7");
    f.set("file", new File(["test"], "file.pdf", { type: "application/pdf" }));
    return f;
  };
  for (const type of ["BANK_TX", "PURCHASE", "CLOSING", "POS"])
    assert.equal((await action.attachFile(form(type, "foreign"))).ok, false);
  assert.equal(uploads, 0);
  assert.equal(writes, 0);
  assert.equal((await action.attachFile(form("BANK_TX", "10"))).ok, true);
  assert.equal((await action.attachFile(form("POS", "ownPOS"))).ok, true);
  assert.equal(uploads, 2);
});
test("a customer cannot reuse another business LINE credentials or overwrite that business config", async () => {
  let updates = 0,
    duplicate = true;
  const action = await loadModules(
    "app/(app)/admin/google/actions.ts",
    {
      zod: { z },
      "@/auth": {
        auth: async () => ({ user: { role: "OWNER", id: "customer" } }),
      },
      "@/lib/business": { requireBusiness: async () => ({ id: 4 }) },
      "@/lib/evidence-upload": { MAX_EVIDENCE_BYTES: 4194304 },
      "@/lib/google": {
        ensureStructure() {},
        syncMaster() {},
        uploadEvidence() {},
      },
      "@/lib/google-sheets-data": { buildMasterTabs() {} },
      "next/cache": { revalidatePath() {} },
      "@/lib/prisma": {
        prisma: {
          $transaction: async (fn: any, opt: any) => {
            assert.equal(opt.isolationLevel, "Serializable");
            return fn({
              business: {
                findUnique: async () => ({
                  lineChannelSecret: null,
                  lineChannelToken: null,
                }),
                findFirst: async (q: any) => {
                  assert.equal(q.where.id.not, 4);
                  return duplicate ? { id: 2 } : null;
                },
                update: async (q: any) => {
                  assert.equal(q.where.id, 4);
                  updates++;
                },
              },
            });
          },
        },
      },
    },
    { console: { error() {} } }
  );
  assert.equal(
    (
      await action.saveLineConfig({
        channelSecret: "other-business-secret",
        channelToken: "other-token",
      })
    ).ok,
    false
  );
  assert.equal(updates, 0);
  duplicate = false;
  assert.equal(
    (
      await action.saveLineConfig({
        channelSecret: "own-secret",
        channelToken: "own-token",
      })
    ).ok,
    true
  );
  assert.equal(updates, 1);
});
