import assert from "node:assert/strict";
import { test } from "node:test";
import * as crypto from "node:crypto";
import { z } from "zod";
import { loadModules } from "./helpers/modules.mts";
import * as policy from "../lib/system-admin-policy.ts";
const plain = (v: any) => JSON.parse(JSON.stringify(v));
const adminId = "cmpy7rtcv0000vfxkln0xtx4h";
async function harness() {
  let state: any = {
    users: [
      {
        id: adminId,
        email: "operator@example.com",
        name: "Operator",
        role: "OWNER",
      },
    ],
    businesses: [
      {
        id: 2,
        name: "OK Katsu Curry",
        slug: "ok-katsu-curry",
        active: true,
        googleRefreshToken: "existing-private-google",
        lineChannelSecret: "existing-private-line",
      },
    ],
    links: [],
    categories: [{ id: 1, businessId: 2, name: "Original category" }],
    financials: {
      pos: [{ id: "POS1", businessId: 2, netAmount: 1000 }],
      costs: [{ id: 1, businessId: 2, amount: 500 }],
    },
  };
  let actor: any = { id: adminId, role: "OWNER", isSystemAdmin: true };
  let fail = false,
    txCalls = 0;
  const writes: any[] = [];
  const match = (r: any, w: any) =>
    Object.entries(w).every(([k, v]) => r[k] === v);
  const db: any = {
    user: {
      findUnique: async ({ where }: any) =>
        state.users.find((r: any) => match(r, where)) ?? null,
      create: async ({ data }: any) => {
        const r = { id: `customer${state.users.length}`, ...data };
        state.users.push(r);
        writes.push(["user", data]);
        return r;
      },
      update: async ({ where, data }: any) => {
        const r = state.users.find((r: any) => match(r, where));
        Object.assign(r, data);
        return r;
      },
    },
    business: {
      findFirst: async () => ({ sortOrder: state.businesses.length }),
      count: async ({ where }: any) =>
        state.businesses.filter(
          (b: any) => where.id.in.includes(b.id) && b.active
        ).length,
      create: async ({ data }: any) => {
        const r = {
          id: state.businesses.length + 3,
          googleRefreshToken: null,
          lineChannelSecret: null,
          ...data,
        };
        state.businesses.push(r);
        writes.push(["business", data]);
        return r;
      },
    },
    userBusiness: {
      create: async ({ data }: any) => state.links.push(data),
      createMany: async ({ data }: any) => state.links.push(...data),
      deleteMany: async ({ where }: any) => {
        const before = state.links.length;
        state.links = state.links.filter((r: any) => !match(r, where));
        return { count: before - state.links.length };
      },
    },
    transactionCategory: {
      createMany: async ({ data }: any) => {
        if (fail) throw Error("metadata failure");
        state.categories.push(...data);
        writes.push(["categories", data]);
      },
    },
  };
  db.$transaction = async (fn: any, opt: any) => {
    txCalls++;
    assert.equal(opt.isolationLevel, "Serializable");
    const before = plain(state);
    try {
      return await fn(db);
    } catch (e) {
      state = before;
      throw e;
    }
  };
  const deps: any = {
    zod: { z },
    "node:crypto": crypto,
    "@/lib/prisma": { prisma: db },
    "@/auth": { auth: async () => (actor ? { user: actor } : null) },
    "@/lib/system-admin-policy": { ...policy, systemAdminEmails: () => [] },
    "next/cache": { revalidatePath() {} },
    "@/lib/business-defaults": {
      DEFAULT_TX_CATEGORIES: [
        { name: "Sales", kind: "INCOME" },
        { name: "Purchases", kind: "EXPENSE" },
      ],
    },
  };
  const onboard = await loadModules(
      "app/(app)/admin/users/customer-actions.ts",
      deps
    ),
    users = await loadModules("app/(app)/admin/users/actions.ts", deps);
  return {
    create: onboard.createTrialCustomer,
    users,
    state: () => state,
    writes,
    fail: () => (fail = true),
    setActor: (a: any) => (actor = a),
    txCalls: () => txCalls,
  };
}
const input = (i = 1) => ({
  businessName: `Trial shop ${i}`,
  email: `owner${i}@example.com`,
  name: `Owner ${i}`,
});
test("five customer accounts atomically create five isolated businesses without copying or changing OK Katsu Curry", async () => {
  const h = await harness(),
    before = plain(h.state());
  for (let i = 1; i <= 5; i++) {
    const r = await h.create(input(i));
    assert.equal(r.ok, true);
    const user = h.state().users.find((u: any) => u.email === input(i).email);
    assert.equal(user.role, "OWNER");
    assert.equal(policy.isSystemAdmin(user, {}), false);
    assert.deepEqual(
      plain(h.state().links.filter((l: any) => l.userId === user.id)),
      [{ userId: user.id, businessId: r.businessId }]
    );
    const biz = h.state().businesses.find((b: any) => b.id === r.businessId);
    assert.equal(biz.googleRefreshToken, null);
    assert.equal(biz.lineChannelSecret, null);
  }
  assert.equal(h.state().businesses.length, 6);
  assert.equal(h.state().users.length, 6);
  assert.deepEqual(h.state().businesses[0], before.businesses[0]);
  assert.deepEqual(h.state().financials, before.financials);
  assert.deepEqual(h.state().categories[0], before.categories[0]);
  assert.deepEqual(h.state().users[0], before.users[0]);
  assert.ok(
    h.writes
      .filter((w) => w[0] === "categories")
      .every((w) => w[1].every((r: any) => r.businessId !== 2))
  );
});
test("duplicate emails, forged existing business IDs and partial failures preserve every existing record", async () => {
  const h = await harness(),
    before = plain(h.state());
  assert.equal(
    (await h.create({ ...input(), email: "OPERATOR@EXAMPLE.COM" })).ok,
    false
  );
  assert.deepEqual(h.state(), before);
  assert.equal((await h.create({ ...input(), businessId: 2 })).ok, false);
  assert.deepEqual(h.state(), before);
  h.fail();
  assert.equal((await h.create(input())).ok, false);
  assert.deepEqual(h.state(), before);
});
test("customer owners, accountants and anonymous users cannot provision or elevate accounts", async () => {
  const h = await harness(),
    before = plain(h.state());
  for (const actor of [
    { id: "customer", role: "OWNER", isSystemAdmin: false },
    { id: "staff", role: "STAFF", isSystemAdmin: false },
    null,
  ]) {
    h.setActor(actor);
    assert.equal((await h.create(input())).ok, false);
  }
  assert.equal(h.txCalls(), 0);
  assert.deepEqual(h.state(), before);
});
test("revoking customer access preserves the user and financial audit instead of cascading deletes", async () => {
  const h = await harness();
  const r = await h.create(input());
  assert.equal(r.ok, true);
  const user = h.state().users[1],
    before = plain(h.state());
  await h.users.deleteUser(user.id);
  assert.equal(h.state().users.length, 2);
  assert.equal(h.state().links.length, 0);
  assert.deepEqual(h.state().financials, before.financials);
  assert.deepEqual(h.state().businesses, before.businesses);
  await assert.rejects(() => h.users.deleteUser(adminId));
  await assert.rejects(() =>
    h.users.updateUserRole({ id: adminId, role: "STAFF" })
  );
});
test("staff assignment requires valid active business IDs and cannot change system-operator access", async () => {
  const h = await harness();
  await assert.rejects(() =>
    h.users.addUser({
      email: "staff@example.com",
      name: "Staff",
      role: "STAFF",
      businessIds: [999],
    })
  );
  assert.equal(h.state().users.length, 1);
  await h.users.addUser({
    email: "staff@example.com",
    name: "Staff",
    role: "STAFF",
    businessIds: [2],
  });
  assert.deepEqual(plain(h.state().links), [
    { userId: "customer1", businessId: 2 },
  ]);
  await assert.rejects(() =>
    h.users.setUserBusinesses({ userId: adminId, businessIds: [2] })
  );
  await assert.rejects(() =>
    h.users.setUserBusinesses({ userId: "customer1", businessIds: [999] })
  );
  assert.deepEqual(plain(h.state().links), [
    { userId: "customer1", businessId: 2 },
  ]);
});
