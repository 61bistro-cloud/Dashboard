import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import * as grab from "../lib/grab-report.ts";
import {
  reconcileGrabBank,
  reconcileGrabPos,
  type GrabPosBill,
} from "../lib/grab-reconciliation.ts";
import { classifyBill } from "../lib/pos-channel.ts";
import { createUi } from "../lib/i18n/core.ts";
import { fixtureRow, fixtureCsv } from "./fixtures/grab-csv.ts";
const row = () => grab.parseGrabCsv(fixtureCsv()).rows[0];
const bill = (patch: Partial<GrabPosBill> = {}): GrabPosBill => ({
  id: "POS-1",
  businessDate: "2026-10-31",
  netAmount: 208,
  grandTotal: 208,
  paymentType: "Cash",
  channel: "Grab",
  invoiceNo: null,
  note: null,
  ...patch,
});
test("CSV keeps duplicate store headers, quoted fields, local dates and cash Auto-Paid orders", () => {
  const r = row();
  assert.equal(r.storeName, "Store, Demo");
  assert.equal(r.saleDate, "2026-10-31");
  assert.equal(r.transferDate, "2026-11-01");
  assert.deepEqual(grab.summarizeGrab([r]), {
    count: 1,
    sales: 20800,
    gp: 4451,
    feeTax: 291,
    net: 16349,
    other: 0,
  });
  assert.deepEqual(
    grab.decodeGrabReport(grab.encodeGrabReport({ version: 1, rows: [r] }))
      .rows,
    [r]
  );
  assert.deepEqual(grab.readCsv('a,b\r\n"line\nwith ""quotes""",c\r\n'), [
    ["a", "b"],
    ['line\nwith "quotes"', "c"],
  ]);
});
test("integer satang avoids aggregate GP rounding and tax is never deducted again", () => {
  const rows = [
    row(),
    {
      ...row(),
      transactionId: "tx2",
      sales: 20400,
      commission: -4366,
      feeTax: -286,
      net: 16034,
    },
  ];
  const total = grab.summarizeGrab(rows);
  assert.equal(total.net, 32383);
  assert.equal(total.sales - total.gp, total.net);
  assert.equal(total.feeTax, 577);
  assert.equal(grab.cents("1,234.5"), 123450);
  assert.equal(grab.cents("-0.01"), -1);
  for (const v of ["1,2", "NaN", "1e2", "2.999", "=100", "Infinity"])
    assert.throws(() => grab.cents(v));
});
test("malformed, unsupported, multistore and conflicting reports stop the whole import", () => {
  for (const patch of [
    { 7: "คืนเงิน" },
    { 6: "ปรับยอด" },
    { 5: "GrabMart" },
    { 12: "Other" },
    { 15: "32 Nov 2026 3:29 AM" },
    { 16: "" },
    { 18: "NaN" },
  ]) {
    const bad = [...fixtureRow];
    for (const [i, v] of Object.entries(patch)) bad[Number(i)] = v;
    assert.throws(() => grab.parseGrabCsv(fixtureCsv([fixtureRow, bad])));
  }
  const other = [...fixtureRow];
  other[3] = "foreign-store";
  other[8] = "tx2";
  assert.throws(
    () => grab.parseGrabCsv(fixtureCsv([fixtureRow, other])),
    /grab.store/
  );
  const changed = [...fixtureRow];
  changed[16] = "209";
  assert.throws(
    () => grab.parseGrabCsv(fixtureCsv([fixtureRow, changed])),
    /grab.conflict/
  );
  assert.throws(() => grab.readCsv('a,"unterminated'));
  assert.throws(() => grab.readCsv('"a"x,b'));
  assert.throws(
    () => grab.decodeGrabReport('GRAB_REPORT_V1:{"version":1,"rows":[null]}'),
    /grab.stored/
  );
});
test("overlapping reports count transaction IDs once, never short order IDs alone", () => {
  const r = row();
  assert.equal(grab.uniqueGrabRows([r, r]).length, 1);
  assert.equal(
    grab.uniqueGrabRows([r, { ...r, transactionId: "other-long-id" }]).length,
    2
  );
  assert.throws(
    () => grab.uniqueGrabRows([r, { ...r, net: 1 }]),
    /grab.conflict/
  );
});
test("payouts combine orders by settlement reference, store and transfer date across sales months", () => {
  const r = row(),
    other = {
      ...r,
      transactionId: "tx2",
      saleDate: "2026-11-01",
      net: 16034,
      sales: 20400,
      commission: -4366,
    };
  const p = grab.grabPayouts([r, other]);
  assert.equal(p.length, 1);
  assert.equal(p[0].net, 32383);
  assert.equal(p[0].count, 2);
  assert.equal(p[0].date, "2026-11-01");
});
test("Grab and LINE MAN customer cash/card payments stay in the platform buckets", () => {
  assert.equal(classifyBill(bill()), "GRAB");
  assert.equal(
    classifyBill(bill({ channel: null, paymentType: "GrabPay" })),
    "GRAB"
  );
  assert.equal(
    classifyBill(bill({ channel: "LINE MAN", paymentType: "VISA" })),
    "LINEMAN"
  );
  assert.equal(
    classifyBill(bill({ channel: "หน้าร้าน", paymentType: "Cash" })),
    "CASH"
  );
  assert.equal(
    classifyBill(bill({ channel: null, paymentType: "PromptPay" })),
    "EDC_PROMPTPAY"
  );
});
test("POS uses long references, distinguishes suggestions, blocks ambiguous and reused bills", () => {
  const r = row();
  assert.equal(reconcileGrabPos([r], [bill()]).orders[0].status, "suggested");
  assert.equal(
    reconcileGrabPos([r], [bill({ note: r.orderId })]).orders[0].status,
    "reference"
  );
  assert.equal(
    reconcileGrabPos([r], [bill({ note: r.orderId, grandTotal: 207 })])
      .orders[0].status,
    "amount_diff"
  );
  assert.equal(
    reconcileGrabPos([r], [bill(), bill({ id: "POS-2" })]).orders[0].status,
    "ambiguous"
  );
  assert.ok(
    reconcileGrabPos(
      [r, { ...r, transactionId: "tx2" }],
      [bill()]
    ).orders.every((o) => o.status === "ambiguous")
  );
  assert.equal(
    reconcileGrabPos(
      [r],
      [bill({ note: "prefix" + r.orderId, grandTotal: 207 })]
    ).orders[0].status,
    "missing"
  );
  assert.equal(
    reconcileGrabPos([r], [bill({ channel: "Store", paymentType: "Cash" })])
      .posSales,
    0
  );
  const pos = reconcileGrabPos([r], [bill({ netAmount: 200 })]);
  assert.equal(pos.posRevenue, 20000);
  assert.equal(pos.posSales, 20800);
});
test("bank suggestions require date, amount and Grab context; one bank credit cannot satisfy two batches", () => {
  const r = row(),
    credit = {
      id: 1,
      fiscalMonthId: 8,
      date: "2026-11-01",
      deposit: 163.49,
      description: "Grab payout",
      accountCode: "KBANK",
      accountName: "Bank",
      grabCategory: false,
    };
  assert.equal(reconcileGrabBank([r], [credit])[0].status, "suggested");
  assert.equal(
    reconcileGrabBank([r], [{ ...credit, description: "Other transfer" }])[0]
      .status,
    "missing"
  );
  assert.equal(
    reconcileGrabBank([r], [{ ...credit, date: "2026-10-31" }])[0].status,
    "missing"
  );
  assert.equal(
    reconcileGrabBank([r], [credit, { ...credit, id: 2 }])[0].status,
    "ambiguous"
  );
  assert.ok(
    reconcileGrabBank(
      [r, { ...r, transactionId: "tx2", settlementId: "batch2" }],
      [credit]
    ).every((p) => p.status === "ambiguous")
  );
});
test("all Grab interface labels and errors have Thai and English translations", () => {
  for (const key of [
    "grab.csv",
    "grab.invalidDate",
    "grab.conflict",
    "grab.month",
    "grab.stale",
    "grab.unsupported",
    "grab.posTitle",
    "grab.payoutHelp",
    "grab.policy",
  ]) {
    for (const locale of ["th", "en"] as const)
      assert.notEqual(createUi(locale)(key), key);
  }
});
test(
  "private original October attachment (optional) reconciles 19 rows and 14 payout batches",
  { skip: !process.env.GRAB_TEST_FILE },
  () => {
    const parsed = grab.parseGrabCsv(
        readFileSync(process.env.GRAB_TEST_FILE!, "utf8")
      ),
      sum = grab.summarizeGrab(parsed.rows),
      payouts = grab.grabPayouts(parsed.rows);
    assert.deepEqual(sum, {
      count: 19,
      sales: 395900,
      gp: 84725,
      feeTax: 5545,
      net: 311175,
      other: 0,
    });
    assert.equal(payouts.length, 14);
    assert.equal(
      payouts
        .filter((p) => p.date.startsWith("2026-10"))
        .reduce((s, p) => s + p.net, 0),
      294826
    );
    assert.equal(
      payouts
        .filter((p) => p.date.startsWith("2026-11"))
        .reduce((s, p) => s + p.net, 0),
      16349
    );
  }
);
