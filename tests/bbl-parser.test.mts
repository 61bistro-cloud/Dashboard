import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseBblRows } from "../lib/bbl-parser.ts";
import { parseBankStatement } from "../lib/kbank-parser.ts";
const line = (cells: [number, string][], page = 1) => ({
  cells: cells.map(([x, text]) => ({ x, text })),
  page,
});
const header = (page = 1) =>
  line(
    [
      [29, "Date"],
      [80, "Particulars"],
      [164, "Chq.No."],
      [244, "Withdrawal"],
      [327, "Deposit"],
      [397, "Balance"],
      [498, "Via"],
    ],
    page
  );
const fixture = () => [
  header(),
  line([
    [25, "01/10/26"],
    [57, "B/F"],
    [405, "148.25"],
  ]),
  line([
    [25, "02/10/26"],
    [57, "TRF. PROMPTPAY"],
    [337, "65.00"],
    [405, "213.25"],
    [433, "mPhone"],
  ]),
  line([
    [25, "02/10/26"],
    [57, "TRF. PROMPTPAY"],
    [267, "60.00"],
    [405, "153.25"],
    [433, "mPhone"],
  ]),
  line([
    [20, "Statement-generation date"],
    [121, "18/11/2026"],
    [165, "20:08"],
  ]),
  header(2),
  line(
    [
      [25, "02/10/26"],
      [57, "B/F"],
      [405, "153.25"],
    ],
    2
  ),
  line(
    [
      [25, "03/11/26"],
      [57, "BILL PAY E-CHN"],
      [164, "synthetic cheque"],
      [267, "40.00"],
      [405, "113.25"],
      [433, "Gtway"],
    ],
    2
  ),
  line(
    [
      [20, "Total No. of Debits"],
      [275, "2"],
      [297, "Total Debit Amount"],
      [542, "100.00"],
    ],
    2
  ),
  line(
    [
      [20, "Total No. of Credits"],
      [275, "1"],
      [297, "Total Credit Amount"],
      [542, "65.00"],
    ],
    2
  ),
];
test("BBL reads both directions for the same label, treats B/F as checkpoint, preserves Via/cheque and does not use generation time", () => {
  const result = parseBblRows(fixture());
  assert.equal(result.openingBalance, 148.25);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(
    result.rows.map((r) => [
      r.time,
      r.deposit,
      r.withdraw,
      r.balance,
      r.channel,
    ]),
    [
      [null, 65, 0, 213.25, "mPhone"],
      [null, 0, 60, 153.25, "mPhone"],
      [null, 0, 40, 113.25, "Gtway"],
    ]
  );
  assert.ok(result.rows[2].description.includes("synthetic cheque"));
});
test("BBL validates required totals, debit/credit counts, page continuity, dates and all row amounts", () => {
  for (const change of [
    (r: ReturnType<typeof fixture>) => r[2].cells.splice(2, 1),
    (r: ReturnType<typeof fixture>) => (r[2].cells[0].text = "31/02/26"),
    (r: ReturnType<typeof fixture>) => (r[2].cells[2].text = "65.001"),
    (r: ReturnType<typeof fixture>) => (r[3].cells[3].text = "154.25"),
    (r: ReturnType<typeof fixture>) => (r[6].cells[2].text = "154.25"),
    (r: ReturnType<typeof fixture>) => (r.at(-1)!.cells[1].text = "2"),
    (r: ReturnType<typeof fixture>) => (r.at(-2)!.cells[3].text = "99.00"),
    (r: ReturnType<typeof fixture>) => r.pop(),
    (r: ReturnType<typeof fixture>) => r.splice(1, 1),
    (r: ReturnType<typeof fixture>) => r.splice(7, 1),
    (r: ReturnType<typeof fixture>) =>
      r.unshift(
        line([
          [308, "Currency"],
          [450, "USD"],
        ])
      ),
  ]) {
    const rows = fixture();
    change(rows);
    assert.throws(() => parseBblRows(rows));
  }
});
test("BBL column boundaries follow page headers, including a Via value left of its centered header", () => {
  const rows = fixture();
  for (const row of rows)
    for (const cell of row.cells) cell.x = cell.x * 1.1 + 20;
  assert.equal(parseBblRows(rows).rows[2].channel, "Gtway");
});
const file = process.env.BBL_TEST_PDF;
test(
  "private Bangkok Bank attachment: 93 real rows, complete totals, monthly openings and PDF password errors",
  { skip: !file },
  async () => {
    const bytes = readFileSync(file!),
      password = process.env.BBL_TEST_PASSWORD_FILE
        ? readFileSync(process.env.BBL_TEST_PASSWORD_FILE, "utf8").trim()
        : process.env.BBL_TEST_PASSWORD;
    const result = await parseBankStatement(
      new Uint8Array(bytes).buffer,
      password
    );
    assert.equal(result.ok, true);
    assert.equal(result.bank, "BBL");
    assert.equal(result.rows.length, 93);
    assert.equal(result.openingBalance, 148.25);
    assert.equal(result.rows.filter((r) => r.withdraw > 0).length, 70);
    assert.equal(result.rows.filter((r) => r.deposit > 0).length, 23);
    assert.equal(
      result.rows.reduce((s, r) => s + Math.round(r.withdraw * 100), 0),
      5398053
    );
    assert.equal(
      result.rows.reduce((s, r) => s + Math.round(r.deposit * 100), 0),
      5625100
    );
    let balance = 14825;
    for (const r of result.rows) {
      balance += Math.round(r.deposit * 100) - Math.round(r.withdraw * 100);
      assert.equal(balance, Math.round(r.balance! * 100));
      assert.equal(r.time, null);
      assert.ok(["mPhone", "Gtway"].includes(r.channel!));
    }
    assert.equal(balance, 241872);
    const october = result.rows.filter((r) => r.date.startsWith("2026-10")),
      november = result.rows.filter((r) => r.date.startsWith("2026-11"));
    assert.equal(october.length, 61);
    assert.equal(november.length, 32);
    assert.equal(october.at(-1)!.balance, 0.01);
    assert.equal(
      Math.round(
        (november[0].balance! - november[0].deposit + november[0].withdraw) *
          100
      ),
      1
    );
    assert.equal(
      new Set(
        result.rows.map((r) =>
          JSON.stringify([
            r.date,
            r.deposit,
            r.withdraw,
            r.balance,
            r.description,
          ])
        )
      ).size,
      93
    );
    for (const password of [undefined, "invalid"]) {
      const failure = await parseBankStatement(
        new Uint8Array(bytes).buffer,
        password
      );
      assert.equal(failure.ok, false);
      assert.ok(failure.password);
      assert.equal(failure.rows.length, 0);
    }
  }
);
