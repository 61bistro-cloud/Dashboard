import assert from "node:assert/strict";
import { test } from "node:test";
import * as policy from "../lib/system-admin-policy.ts";
import { canAccess } from "../lib/rbac.ts";
import { loadModules } from "./helpers/modules.mts";
const primary = "cmpy7rtcv0000vfxkln0xtx4h";
async function authHarness() {
  let config: any;
  const users: any[] = [
    {
      id: primary,
      email: "operator@example.com",
      name: "Operator",
      role: "OWNER",
    },
    { id: "customerA", email: "alice@example.com", role: "OWNER" },
    { id: "customerB", email: "bob@example.com", role: "OWNER" },
  ];
  const links: any[] = [
    { userId: "customerA", businessId: 4 },
    { userId: "customerB", businessId: 5 },
  ];
  let active = true,
    upserts = 0;
  const env = { SYSTEM_ADMIN_EMAILS: "new-operator@example.com" };
  const db = {
    user: {
      findUnique: async ({ where }: any) =>
        users.find((u) =>
          Object.entries(where).every(([k, v]) => u[k] === v)
        ) ?? null,
      upsert: async ({ create }: any) => {
        upserts++;
        users.push({ id: "newOperator", ...create });
      },
    },
    userBusiness: {
      count: async ({ where }: any) =>
        active ? links.filter((l) => l.userId === where.userId).length : 0,
    },
  };
  await loadModules("auth.ts", {
    "next-auth": {
      default: (c: any) => {
        config = c;
        return { auth() {}, handlers: {}, signIn() {}, signOut() {} };
      },
    },
    "next-auth/providers/google": { default: () => ({}) },
    "@/lib/prisma": { prisma: db },
    "@/lib/system-admin-policy": {
      isSystemAdmin: (u: any) => policy.isSystemAdmin(u, env),
      systemAdminEmails: () => policy.systemAdminEmails(env),
    },
  });
  const identity = (email: string, verified = true) => ({
    user: { email },
    account: { provider: "google" },
    profile: { email, email_verified: verified },
  });
  return {
    callbacks: config.callbacks,
    users,
    links,
    identity,
    deactivate: () => (active = false),
    upserts: () => upserts,
  };
}
test("new shop owners never inherit global access; existing audited operators retain it", () => {
  for (const role of ["OWNER", "ACCOUNTANT", "STAFF"] as const)
    assert.equal(
      policy.isSystemAdmin(
        { id: "new-customer", email: "client@example.com", role },
        {}
      ),
      false
    );
  assert.equal(
    policy.isSystemAdmin(
      { id: primary, email: "operator@example.com", role: "OWNER" },
      {}
    ),
    true
  );
  assert.equal(
    policy.isSystemAdmin(
      { id: primary, email: "operator@example.com", role: "STAFF" },
      {}
    ),
    false
  );
  assert.equal(
    policy.isSystemAdmin(
      { id: primary, email: "operator@example.com", role: "OWNER" },
      { SYSTEM_ADMIN_USER_IDS: "explicit-other" }
    ),
    false
  );
  assert.equal(canAccess("/admin/users", "OWNER"), false);
  assert.equal(canAccess("/admin/businesses", "OWNER"), false);
  assert.equal(canAccess("/admin/users", "OWNER", true), true);
  assert.equal(canAccess("/admin/google", "OWNER"), true);
});
test("Google sign-in requires verified matching identity and a provisioned active business", async () => {
  const h = await authHarness(),
    c = h.callbacks;
  assert.equal(await c.signIn(h.identity("alice@example.com")), true);
  for (const input of [
    h.identity("unknown@example.com"),
    h.identity("alice@example.com", false),
    { ...h.identity("alice@example.com"), account: { provider: "other" } },
    {
      ...h.identity("alice@example.com"),
      profile: { email: "other@example.com", email_verified: true },
    },
  ])
    assert.equal(await c.signIn(input), false);
  assert.equal(h.upserts(), 0);
  assert.equal(await c.signIn(h.identity("new-operator@example.com")), true);
  assert.equal(h.upserts(), 1);
  h.links.length = 0;
  assert.equal(await c.signIn(h.identity("alice@example.com")), false);
  assert.equal(await c.signIn(h.identity("operator@example.com")), true);
});
test("JWT refresh reloads DB roles and memberships; revoked, disabled and deleted users lose existing sessions", async () => {
  const h = await authHarness(),
    c = h.callbacks;
  let token = await c.jwt({ token: {}, user: { email: "alice@example.com" } });
  assert.equal(token.role, "OWNER");
  assert.equal(token.isSystemAdmin, false);
  assert.equal(
    (
      await c.jwt({
        token: { id: "customerA", role: "OWNER", isSystemAdmin: true },
      })
    ).isSystemAdmin,
    false
  );
  h.users[1].role = "STAFF";
  token = await c.jwt({ token });
  assert.equal(token.role, "STAFF");
  assert.equal(token.isSystemAdmin, false);
  h.links.splice(0, 1);
  assert.equal(await c.jwt({ token }), null);
  h.users.splice(1, 1);
  assert.equal(await c.jwt({ token }), null);
  const other = await authHarness();
  const bob = await other.callbacks.jwt({
    token: {},
    user: { email: "bob@example.com" },
  });
  other.deactivate();
  assert.equal(await other.callbacks.jwt({ token: bob }), null);
  const operator = await c.jwt({
    token: { id: primary, role: "STAFF", isSystemAdmin: false },
  });
  assert.equal(operator.isSystemAdmin, true);
});
async function scopeHarness() {
  let cookie: string | undefined,
    actor: any = { id: "customerA", role: "OWNER", isSystemAdmin: false };
  let globalReads = 0;
  const businesses = [
    { id: 2, name: "OK Katsu Curry", slug: "ok-katsu-curry" },
    { id: 4, name: "Customer A", slug: "a" },
    { id: 5, name: "Customer B", slug: "b" },
  ];
  const links = [
    { userId: "customerA", businessId: 4 },
    { userId: "customerB", businessId: 5 },
  ];
  const db = {
    business: {
      findMany: async () => {
        globalReads++;
        return businesses;
      },
    },
    userBusiness: {
      findMany: async ({ where }: any) =>
        links
          .filter((l) => l.userId === where.userId)
          .map((l) => ({
            business: businesses.find((b) => b.id === l.businessId),
          })),
    },
  };
  const deps = {
    "@/auth": { auth: async () => ({ user: actor }) },
    "@/lib/prisma": { prisma: db },
    "next/headers": {
      cookies: async () => ({
        get: () => (cookie ? { value: cookie } : undefined),
      }),
    },
  };
  const scope = await loadModules("lib/business.ts", deps);
  return {
    scope,
    deps,
    setCookie: (v: string | undefined) => (cookie = v),
    setActor: (a: any) => (actor = a),
    globalReads: () => globalReads,
  };
}
test("two OWNER customers see only their linked business; forged original-shop cookies fail closed", async () => {
  const h = await scopeHarness();
  assert.deepEqual(
    JSON.parse(JSON.stringify(await h.scope.getAccessibleBusinesses())).map(
      (b: any) => b.id
    ),
    [4]
  );
  assert.equal((await h.scope.requireBusiness()).id, 4);
  assert.equal(h.globalReads(), 0);
  for (const id of ["2", "5", "999"]) {
    h.setCookie(id);
    await assert.rejects(h.scope.requireBusiness);
  }
  h.setActor({ id: "customerB", role: "OWNER", isSystemAdmin: false });
  h.setCookie(undefined);
  assert.equal((await h.scope.requireBusiness()).id, 5);
  assert.equal(h.globalReads(), 0);
  h.setActor({ id: primary, role: "OWNER", isSystemAdmin: true });
  h.setCookie("2");
  assert.equal((await h.scope.requireBusiness()).name, "OK Katsu Curry");
  assert.equal((await h.scope.getAccessibleBusinesses()).length, 3);
});
test("customer owners cannot call global business/user actions directly or query global admin pages", async () => {
  const h = await scopeHarness();
  const deps: any = {
    ...h.deps,
    zod: await import("zod"),
    "next/cache": { revalidatePath() {} },
    "@/lib/business": h.scope,
    "@/lib/business-defaults": {
      seedBusinessDefaults() {
        throw Error("must not run seed");
      },
    },
    "@/lib/system-admin-policy": policy,
  };
  const actions = await loadModules("app/(app)/business-actions.ts", deps);
  for (const [fn, args] of [
    [actions.createBusiness, [{ name: "Attack" }]],
    [actions.renameBusiness, [{ id: 2, name: "Attack" }]],
    [actions.setBusinessActive, [2, false]],
  ] as any[])
    await assert.rejects(() => fn(...args), /ผู้ดูแลระบบ/);
  const users = await loadModules("app/(app)/admin/users/actions.ts", deps);
  for (const [fn, args] of [
    [users.addUser, [{}]],
    [users.updateUserRole, [{ id: primary, role: "STAFF" }]],
    [users.setUserBusinesses, [{ userId: primary, businessIds: [] }]],
    [users.deleteUser, [primary]],
  ] as any[])
    await assert.rejects(() => fn(...args), /ผู้ดูแลระบบ/);
  for (const page of [
    "app/(app)/admin/users/page.tsx",
    "app/(app)/admin/businesses/page.tsx",
  ]) {
    const mod = await loadModules(page, {
      ...deps,
      "@/lib/i18n/core": { dateLocale: () => "en-GB" },
      "@/lib/i18n/server": { getUi: async () => ({ ui: (s: string) => s }) },
      "next/navigation": {
        redirect: () => {
          throw Error("Redirect");
        },
      },
      "lucide-react": { Users() {}, Building2() {} },
      "@/components/page-header": { PageHeader() {} },
      "./_components/customer-onboarding": { CustomerOnboarding() {} },
      "./_components/add-user-form": { AddUserForm() {} },
      "./_components/user-row-actions": {
        RoleSelect() {},
        DeleteUserButton() {},
      },
      "./_components/user-businesses": { UserBusinessAssign() {} },
      "./_components/business-manager": { BusinessManager() {} },
    });
    await assert.rejects(mod.default, /Redirect/);
  }
  assert.equal(h.globalReads(), 0);
});

test("legacy auto-owner email configuration cannot turn a new customer account into a global operator", () => {
  assert.equal(
    policy.isSystemAdmin(
      { id: "new-customer", email: "old-admin@example.com", role: "OWNER" },
      { AUTH_GOOGLE_OWNER_EMAILS: "old-admin@example.com" }
    ),
    false
  );
});

test("a recreated email receives a new scoped identity; its deleted operator's JWT remains revoked",async()=>{
 const h=await authHarness();const legacyId="cmpzeasxp0000js04hlrbdae7";h.users[2].id=legacyId;h.links[1].userId=legacyId;
 const old=await h.callbacks.jwt({token:{},user:{email:"bob@example.com"}});assert.equal(old.isSystemAdmin,true);
 h.users[2].id="recreatedCustomer";h.links[1].userId="recreatedCustomer";
 assert.equal(await h.callbacks.jwt({token:old}),null);
 const fresh=await h.callbacks.jwt({token:{},user:{email:"bob@example.com"}});assert.equal(fresh.id,"recreatedCustomer");assert.equal(fresh.isSystemAdmin,false);
});
