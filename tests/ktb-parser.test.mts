import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseKtbRows } from "../lib/ktb-parser.ts";
import { parseBankStatement } from "../lib/kbank-parser.ts";
const line = (cells: [number, string][], page = 1) => ({
  cells: cells.map(([x, text]) => ({ x, text })),
  page,
});
const header = (page = 1) =>
  line(
    [
      [40, "วันที่/เวลา"],
      [82, "รายการ"],
      [210, "รายละเอียด/หมายเลขเช็ค"],
      [341, "รายการถอน"],
      [405, "รายการฝาก"],
      [471, "ยอดเงินคงเหลือ"],
      [542, "สาขา"],
    ],
    page
  );
const fixture = () => [
  header(),
  line([
    [40, "10/06/69"],
    [82, "unknown credit (NBSDT)"],
    [210, "TR fr reference"],
    [411, "11,000.00"],
    [487, "11,000.07"],
    [541, "1217"],
  ]),
  line([[40, "13:10"]]),
  line([
    [40, "10/06/69"],
    [82, "transfer (IORSWT)"],
    [210, "reference"],
    [352, "5,000.00"],
    [491, "6,000.07"],
    [544, "188"],
  ]),
  line([
    [40, "15:33"],
    [210, "~ Tran: IORSWT"],
  ]),
  line([[40, "บริษัท ธนาคารกรุงไทย จำกัด มหาชน"]]),
  line(
    [
      [303, "วงเงินเบิกเกินบัญชี"],
      [397, "0.00"],
    ],
    2
  ),
  header(2),
  line(
    [
      [40, "30/06/69"],
      [82, "interest and tax (IIPS)"],
      [365, "0.00"],
      [427, "5.58"],
      [499, "6,005.65"],
      [552, "0"],
    ],
    2
  ),
  line([[40, "01:35"]], 2),
  line(
    [
      [40, "รายการถอนทั้งหมด"],
      [102, "1"],
      [159, "5,000.00"],
    ],
    2
  ),
  line(
    [
      [40, "รายการฝากทั้งหมด"],
      [102, "2"],
      [159, "11,005.58"],
    ],
    2
  ),
];
test("KTB reads separate time lines, columns, references and interest without treating branch as balance/channel", () => {
  const result = parseKtbRows(fixture());
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => [
      r.date,
      r.time,
      r.deposit,
      r.withdraw,
      r.balance,
      r.channel,
    ]),
    [
      ["2026-06-10", "13:10", 11000, 0, 11000.07, null],
      ["2026-06-10", "15:33", 0, 5000, 6000.07, null],
      ["2026-06-30", "01:35", 5.58, 0, 6005.65, null],
    ]
  );
  assert.ok(result[1].description.includes("~ Tran: IORSWT"));
  assert.ok(!result[1].description.includes("บริษัท"));
});
test("KTB rejects missing amounts, invalid dates/time, inconsistent running balances and printed totals", () => {
  for (const mutation of [
    (rows: ReturnType<typeof fixture>) => rows[1].cells.splice(3, 1),
    (rows: ReturnType<typeof fixture>) => (rows[1].cells[0].text = "31/06/69"),
    (rows: ReturnType<typeof fixture>) => (rows[2].cells[0].text = "24:00"),
    (rows: ReturnType<typeof fixture>) => (rows[3].cells[4].text = "6,001.07"),
    (rows: ReturnType<typeof fixture>) => (rows.at(-1)!.cells[1].text = "3"),
  ]) {
    const rows = fixture();
    mutation(rows);
    assert.throws(() => parseKtbRows(rows));
  }
});
test("KTB column positions derive from each page header rather than fixed PDF coordinates", () => {
  const rows = fixture();
  for (const row of rows) for (const cell of row.cells) cell.x += 20;
  assert.equal(parseKtbRows(rows)[2].balance, 6005.65);
});
const path = process.env.KTB_TEST_PDF;
test(
  "private Krungthai attachment: 53 rows, printed totals, all balances and password handling",
  { skip: !path },
  async () => {
    const bytes = readFileSync(path!);
    const password = process.env.KTB_TEST_PASSWORD_FILE
      ? readFileSync(process.env.KTB_TEST_PASSWORD_FILE, "utf8").trim()
      : process.env.KTB_TEST_PASSWORD;
    const result = await parseBankStatement(
      new Uint8Array(bytes).buffer,
      password
    );
    assert.equal(result.ok, true);
    assert.equal(result.bank, "KTB");
    assert.equal(result.rows.length, 53);
    assert.equal(result.rows.filter((r) => r.withdraw > 0).length, 29);
    assert.equal(result.rows.filter((r) => r.deposit > 0).length, 24);
    assert.equal(
      result.rows.reduce((s, r) => s + Math.round(r.withdraw * 100), 0),
      10920034
    );
    assert.equal(
      result.rows.reduce((s, r) => s + Math.round(r.deposit * 100), 0),
      10920058
    );
    assert.equal(result.openingBalance, 0.07);
    let balance = 7;
    for (const row of result.rows) {
      balance += Math.round(row.deposit * 100) - Math.round(row.withdraw * 100);
      assert.equal(balance, Math.round(row.balance! * 100));
      assert.match(row.time!, /^\d{2}:\d{2}$/);
      assert.equal(row.channel, null);
    }
    assert.equal(balance, 31);
    assert.deepEqual(
      [...new Set(result.rows.map((r) => r.date.slice(0, 7)))],
      ["2026-06", "2026-07", "2026-08", "2026-10"]
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
