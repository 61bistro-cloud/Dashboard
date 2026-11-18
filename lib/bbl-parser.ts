import type { ParsedTx } from "./kbank-parser";
type Row = { cells: { x: number; text: string }[]; page?: number };
const INVALID =
  "อ่านรายการกรุงเทพไม่ครบหรือยอดไม่ต่อเนื่อง กรุณาตรวจไฟล์ต้นฉบับ";
function invalid(): never {
  throw new Error(INVALID);
}
function cents(text: string): number {
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(text)) return invalid();
  const n = Math.round(Number(text.replaceAll(",", "")) * 100);
  if (!Number.isSafeInteger(n)) return invalid();
  return n;
}
function normalizeDate(text: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(text);
  if (!match) return invalid();
  let year = Number(match[3]);
  if (match[3].length === 2) year += year > 50 ? 2500 : 2000;
  if (year >= 2400) year -= 543;
  const month = Number(match[2]),
    day = Number(match[1]);
  if (
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    return invalid();
  return `${year}-${match[2]}-${match[1]}`;
}
/** Bangkok Bank savings e-statements. B/F is a checkpoint, not a transaction.
 * Column geometry decides direction: TRF. PROMPTPAY appears on BOTH sides.
 * Via is left-aligned below its centered header. No transaction time is printed.
 * Missing rows/pages, inconsistent checkpoints or totals fail the whole file. */
export function parseBblRows(rows: Row[]): {
  rows: ParsedTx[];
  openingBalance: number;
} {
  let page: number | undefined;
  let columns: {
    item: number;
    debit: number;
    credit: number;
    balance: number;
    via: number;
  } | null = null;
  let opening: number | null = null,
    previous: number | null = null,
    previousDate: string | null = null;
  let current: ParsedTx | null = null;
  const out: ParsedTx[] = [];
  const totals = new Map<
    "withdraw" | "deposit",
    { count: number; amount: number }
  >();
  for (const row of rows) {
    if (row.page !== page) {
      page = row.page;
      columns = null;
      current = null;
    }
    const cells = row.cells.map((c) => ({ ...c, text: c.text.trim() }));
    const currency = cells.find((c) => /Currency/i.test(c.text));
    if (currency) {
      const codes = cells.filter(
        (c) => c.x > currency.x && /^[A-Z]{3}$/.test(c.text)
      );
      if (codes.length !== 1 || codes[0].text !== "THB") return invalid();
    }
    const header = (name: string) => cells.find((c) => c.text === name);
    if (header("Date") && header("Particulars")) {
      const names = [
        "Date",
        "Particulars",
        "Chq.No.",
        "Withdrawal",
        "Deposit",
        "Balance",
        "Via",
      ];
      const headers = names.map(header);
      if (
        headers.some((c) => !c) ||
        headers.some((c, i) => i > 0 && c!.x <= headers[i - 1]!.x)
      )
        return invalid();
      const [date, item, cheque, debit, credit, balance] = headers.map(
        (c) => c!.x
      );
      columns = {
        item: (date + item) / 2,
        debit: (cheque + debit) / 2,
        credit: (debit + credit) / 2,
        balance: (credit + balance) / 2,
        via: balance + (balance - credit) / 2,
      };
      current = null;
      continue;
    }
    const countLabel = cells.find((c) =>
      /Total No\. of (Debits|Credits)/i.test(c.text)
    );
    if (countLabel) {
      const kind = /Debits/i.test(countLabel.text) ? "withdraw" : "deposit";
      const amountLabel = cells.find((c) =>
        (kind === "withdraw"
          ? /Total Debit Amount/i
          : /Total Credit Amount/i
        ).test(c.text)
      );
      if (!amountLabel || totals.has(kind)) return invalid();
      const count = cells.filter(
        (c) => c.x > countLabel.x && c.x < amountLabel.x
      );
      const amount = cells.filter((c) => c.x > amountLabel.x);
      if (
        count.length !== 1 ||
        !/^\d+$/.test(count[0].text) ||
        amount.length !== 1
      )
        return invalid();
      totals.set(kind, {
        count: Number(count[0].text),
        amount: cents(amount[0].text),
      });
      current = null;
      continue;
    }
    if (!columns) continue;
    const col = columns;
    const dateCell = cells.find(
      (c) => c.x < col.item && /^\d{2}\/\d{2}\/\d{2}(?:\d{2})?$/.test(c.text)
    );
    if (!dateCell) {
      // Only wrapped particulars/cheque references belong to the last row;
      // footer dates and the statement-generation time never become tx times.
      const details = cells
        .filter((c) => c.x >= col.item && c.x < col.debit)
        .map((c) => c.text)
        .join(" ");
      if (
        current &&
        details &&
        cells.every((c) => c.x >= col.item && c.x < col.debit)
      )
        current.description += " — " + details;
      else current = null;
      continue;
    }
    const date = normalizeDate(dateCell.text);
    const amount = (from: number, to: number) =>
      cells.filter((c) => c.x >= from && c.x < to).map((c) => cents(c.text));
    const debit = amount(col.debit, col.credit),
      credit = amount(col.credit, col.balance),
      balance = amount(col.balance, col.via);
    const details = cells
      .filter((c) => c.x >= col.item && c.x < col.debit)
      .map((c) => c.text);
    if (balance.length !== 1 || debit.length > 1 || credit.length > 1)
      return invalid();
    if (details.length === 1 && /^[BC]\/F$/.test(details[0])) {
      if (debit.length || credit.length) return invalid();
      if (previous !== null && balance[0] !== previous) return invalid();
      if (opening === null) {
        if (details[0] !== "B/F") return invalid();
        opening = balance[0];
        previous = balance[0];
        previousDate = date;
      }
      current = null;
      continue;
    }
    const withdrawal = debit[0] ?? 0,
      deposit = credit[0] ?? 0;
    if (
      opening === null ||
      previous === null ||
      !details.length ||
      (!debit.length && !credit.length) ||
      withdrawal < 0 ||
      deposit < 0
    )
      return invalid();
    if (
      previous + deposit - withdrawal !== balance[0] ||
      (previousDate !== null && date < previousDate)
    )
      return invalid();
    previous = balance[0];
    previousDate = date;
    current = {
      date,
      time: null,
      description: details.join(" — "),
      deposit: deposit / 100,
      withdraw: withdrawal / 100,
      balance: balance[0] / 100,
      channel:
        cells
          .filter((c) => c.x >= col.via)
          .map((c) => c.text)
          .join(" ") || null,
    };
    out.push(current);
  }
  if (opening === null || totals.size !== 2) return invalid();
  for (const [kind, total] of totals) {
    const active = out.filter((r) => r[kind] > 0);
    if (
      active.length !== total.count ||
      active.reduce((sum, r) => sum + Math.round(r[kind] * 100), 0) !==
        total.amount
    )
      return invalid();
  }
  return { rows: out, openingBalance: opening / 100 };
}
