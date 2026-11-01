import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { verifyLineSignature } from "../lib/line.ts";

const secret = "test-channel-secret";
const token = "test-channel-token";
const sign = (body: string) =>
  createHmac("sha256", secret).update(body).digest("base64");
async function load(
  path: string,
  deps: Record<string, any>,
  dynamic?: (name: string) => any
) {
  const context = vm.createContext({ Request, Response, console });
  const synthetic = (exports: any) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const key of Object.keys(exports))
          this.setExport(key, exports[key]);
      },
      { context }
    );
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }
  ).outputText;
  const mod = new vm.SourceTextModule(code, {
    context,
    importModuleDynamically: async (name) => {
      assert.ok(dynamic);
      const module = synthetic(await dynamic!(name));
      await module.link(() => {
        throw new Error("unexpected import");
      });
      await module.evaluate();
      return module;
    },
  });
  await mod.link(async (name) => {
    assert.ok(deps[name], name);
    return synthetic(deps[name]);
  });
  await mod.evaluate();
  return mod.namespace as any;
}
async function route() {
  const jobs: Array<() => Promise<void>> = [];
  const work: any[] = [];
  let queries = 0,
    loads = 0;
  const handler = await load(
    "../app/api/line/webhook/route.ts",
    {
      "next/server": { after: (fn: any) => jobs.push(fn) },
      "@/lib/prisma": {
        prisma: {
          business: {
            findMany: async (query: any) => {
              queries++;
              assert.equal(query.where.lineChannelSecret.not, null);
              assert.equal(query.where.lineChannelToken.not, null);
              return [
                { id: 7, lineChannelSecret: secret, lineChannelToken: token },
              ];
            },
          },
        },
      },
      "@/lib/line": { verifyLineSignature },
    },
    async (name) => {
      assert.equal(name, "@/lib/line-webhook");
      loads++;
      return { processLineEvents: async (...args: any[]) => work.push(args) };
    }
  );
  const post = (body: string, signature?: string) =>
    handler.POST(
      new Request("https://example.test/api/line/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(signature ? { "x-line-signature": signature } : {}),
        },
        body,
      })
    );
  return { post, jobs, work, queries: () => queries, loads: () => loads };
}

test("signed LINE Verify returns 200 without loading Drive or looking up a fiscal month", async () => {
  const h = await route(),
    body = JSON.stringify({ destination: "bot-id", events: [] });
  assert.equal((await h.post(body, sign(body))).status, 200);
  assert.equal(h.queries(), 1);
  assert.equal(h.jobs.length, 0);
  assert.equal(h.loads(), 0);
});
test("missing or forged signatures cannot schedule uploads", async () => {
  const h = await route(),
    body = JSON.stringify({
      events: [{ type: "message", message: { type: "image", id: "123" } }],
    });
  assert.equal((await h.post(body)).status, 401);
  assert.equal(h.queries(), 0);
  assert.equal((await h.post(body, "forged")).status, 401);
  assert.equal(h.jobs.length, 0);
  assert.equal(h.loads(), 0);
});
test("malformed requests fail before database access", async () => {
  const h = await route();
  for (const body of ["{", "null", "{}", '{"events":1}'])
    assert.equal((await h.post(body, sign(body))).status, 400);
  assert.equal(h.queries(), 0);
  assert.equal(h.jobs.length, 0);
});
test("real group images acknowledge before upload, with authenticated business and token passed to background work", async () => {
  const h = await route();
  const events = [
    {
      type: "message",
      source: { type: "group", groupId: "test-group" },
      message: { type: "image", id: "123" },
    },
  ];
  const body = JSON.stringify({ events });
  const response = await h.post(body, sign(body));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(h.jobs.length, 1);
  assert.equal(h.loads(), 0);
  assert.equal(h.work.length, 0);
  await h.jobs[0]();
  assert.equal(h.loads(), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.work[0])), [
    { id: 7 },
    token,
    events,
  ]);
});
test("join/leave and unsupported message types require no Drive work", async () => {
  const h = await route(),
    body = JSON.stringify({
      events: [
        { type: "join" },
        null,
        { type: "message", message: { type: "sticker", id: "1" } },
      ],
    });
  assert.equal((await h.post(body, sign(body))).status, 200);
  assert.equal(h.jobs.length, 0);
});

async function worker(duplicate = false) {
  const writes: any[] = [],
    replies: any[] = [],
    downloads: any[] = [];
  const module = await load("../lib/line-webhook.ts", {
    "@/lib/prisma": {
      prisma: {
        driveFile: {
          findFirst: async () => (duplicate ? { id: 1 } : null),
          create: async (data: any) => writes.push(data),
        },
      },
    },
    "@/lib/fiscal": {
      getCurrentFiscalMonth: async () => ({
        id: 8,
        calendarYear: 2026,
        calendarMonth: 11,
      }),
    },
    "@/lib/google": {
      uploadEvidence: async (...args: any[]) => {
        writes.push(args);
        return {
          driveFileId: "drive-test",
          webViewLink: "https://example.test/file",
        };
      },
    },
    "@/lib/line": {
      getLineContent: async (...args: any[]) => {
        downloads.push(args);
        return { buffer: new Uint8Array([1]), mimeType: "image/jpeg" };
      },
      replyLine: async (...args: any[]) => replies.push(args),
      extFromMime: () => "jpg",
    },
  });
  return { module, writes, replies, downloads };
}
test("background worker keeps evidence storage and replies scoped to the verified business", async () => {
  const h = await worker();
  await h.module.processLineEvents({ id: 7 }, token, [
    {
      type: "message",
      replyToken: "test-reply",
      message: { type: "image", id: "123" },
    },
  ]);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[0][0], 7);
  assert.equal(h.writes[0][2], "2026-11");
  assert.equal(h.writes[1].data.businessId, 7);
  assert.equal(h.writes[1].data.fiscalMonthId, 8);
  assert.equal(h.replies.length, 1);
  assert.ok(h.replies[0][1].includes("บันทึกหลักฐาน"));
  assert.equal(h.downloads.length, 1);
});
test("LINE redelivery with an existing message record does not upload or reply twice", async () => {
  const h = await worker(true);
  await h.module.processLineEvents({ id: 7 }, token, [
    {
      type: "message",
      replyToken: "test-reply",
      message: { type: "image", id: "123" },
    },
  ]);
  assert.equal(h.writes.length, 0);
  assert.equal(h.replies.length, 0);
  assert.equal(h.downloads.length, 0);
});
