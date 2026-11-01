import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseBankStatement } from "../lib/kbank-parser.ts";

// Small, synthetic PDFs exercise extraction and dispatch without private data.
function pdf(lines: Array<Array<[number, string]>>): ArrayBuffer {
  const stream = lines
    .flatMap((line, i) =>
      line.map(
        ([x, text]) => `BT /F1 10 Tf ${x} ${750 - i * 20} Td (${text}) Tj ET`
      )
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 620 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
      .join("");
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body)).buffer;
}

test("KBANK keeps dates, times, debit/credit, balance and channel", async () => {
  const result = await parseBankStatement(
    pdf([
      [[20, "KASIKORNBANK"]],
      [
        [20, "01/10/69"],
        [95, "09:15"],
        [140, "refund"],
        [260, "1,000.00"],
        [350, "2,500.00"],
        [450, "K PLUS"],
      ],
      [
        [20, "02/10/69"],
        [95, "10:30"],
        [140, "purchase"],
        [260, "500.00"],
        [350, "2,000.00"],
        [450, "EDC"],
      ],
    ]),
    undefined
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.rows.map((r) => [
      r.date,
      r.time,
      r.deposit,
      r.withdraw,
      r.balance,
      r.channel,
    ]),
    [
      ["2026-10-01", "09:15", 1000, 0, 2500, "K PLUS"],
      ["2026-10-02", "10:30", 0, 500, 2000, "EDC"],
    ]
  );
});

test("SCB keeps balance-delta direction and multiline descriptions", async () => {
  const result = await parseBankStatement(
    pdf([
      [[20, "SIAM COMMERCIAL"]],
      [
        [20, "BALANCE BROUGHT FORWARD"],
        [310, "1,000.00"],
      ],
      [
        [20, "01/10/26 09:15"],
        [110, "ENET"],
        [260, "500.00"],
        [310, "1,500.00"],
        [400, "DESC:"],
        [450, "sale"],
      ],
      [
        [400, "NOTE:"],
        [450, "reference"],
      ],
      [
        [20, "02/10/26 10:30"],
        [110, "ATM"],
        [190, "200.00"],
        [310, "1,300.00"],
        [400, "DESC:"],
        [450, "cash"],
      ],
    ]),
    undefined
  );
  assert.equal(result.openingBalance, 1000);
  assert.deepEqual(
    result.rows.map((r) => [
      r.date,
      r.time,
      r.deposit,
      r.withdraw,
      r.balance,
      r.channel,
    ]),
    [
      ["2026-10-01", "09:15", 500, 0, 1500, "ENET"],
      ["2026-10-02", "10:30", 0, 200, 1300, "ATM"],
    ]
  );
  assert.equal(result.rows[0].description, "sale — reference");
});

test("Krungsri uses columns for unfamiliar labels and derives opening balance", async () => {
  const result = await parseBankStatement(
    pdf([
      [[20, "BANK OF AYUDHYA"]],
      [
        [24, "01/10/2026 01:04:54 transfer"],
        [250, "460.00"],
        [360, "10,027.76"],
        [420, "MOBILE"],
        [468, "recipient"],
      ],
      [[468, "account reference"]],
      [
        [24, "01/10/2026 20:03:44 Mungmee App"],
        [303, "2,279.00"],
        [360, "12,306.76"],
        [420, "MOBILE"],
      ],
    ]),
    undefined
  );
  assert.equal(result.openingBalance, 10487.76);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].withdraw, 460);
  assert.equal(
    result.rows[0].description,
    "transfer — recipient — account reference"
  );
  assert.equal(result.rows[1].deposit, 2279);
});

const privatePdf = process.env.STATEMENT_TEST_PDF;
test(
  "attached Krungsri PDF matches all printed totals and running balances",
  { skip: !privatePdf },
  async () => {
    const bytes = readFileSync(privatePdf!);
    const result = await parseBankStatement(
      new Uint8Array(bytes).buffer,
      process.env.STATEMENT_TEST_PASSWORD
    );
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 154);
    assert.equal(result.rows.filter((r) => r.withdraw > 0).length, 80);
    assert.equal(result.rows.filter((r) => r.deposit > 0).length, 74);
    const cents = (n: number) => Math.round(n * 100);
    assert.equal(
      result.rows.reduce((s, r) => s + cents(r.withdraw), 0),
      15402263
    );
    assert.equal(
      result.rows.reduce((s, r) => s + cents(r.deposit), 0),
      14650509
    );
    let balance = cents(result.openingBalance!);
    for (const row of result.rows) {
      balance += cents(row.deposit) - cents(row.withdraw);
      assert.equal(balance, cents(row.balance!));
    }
    assert.equal(balance, 297022);
    for (const password of [undefined, "invalid"]) {
      const failure = await parseBankStatement(
        new Uint8Array(bytes).buffer,
        password
      );
      assert.equal(failure.ok, false);
      assert.ok(failure.password);
    }
  }
);
