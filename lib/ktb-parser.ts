import type { ParsedTx } from "./kbank-parser";
type Row = { cells: { x: number; text: string }[]; page?: number };
const INVALID =
  "อ่านรายการกรุงไทยไม่ครบหรือยอดไม่ต่อเนื่อง กรุณาตรวจไฟล์ต้นฉบับ";
const unsupported = () => {
  throw new Error(INVALID);
};
const cents = (s: string) => {
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(s.trim()))
    return unsupported();
  const n = Math.round(Number(s.replaceAll(",", "")) * 100);
  if (!Number.isSafeInteger(n)) return unsupported();
  return n;
};
function date(s: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return unsupported();
  let year = Number(m[3]);
  if (m[3].length === 2) year += year > 50 ? 2500 : 2000;
  if (year >= 2400) year -= 543;
  const month = Number(m[2]),
    day = Number(m[1]);
  if (
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    return unsupported();
  return `${year}-${m[2]}-${m[1]}`;
}
/** Krungthai savings e-statement: debit/credit/balance are separate columns;
 * time and wrapped references appear on the next line. Branch is NOT channel.
 * Validate every row and any printed totals rather than import partial data. */
export function parseKtbRows(rows: Row[]): ParsedTx[] {
  let columns: {
    item: number;
    detail: number;
    debit: number;
    credit: number;
    balance: number;
    branch: number;
  } | null = null;
  let page: number | undefined,
    current: ParsedTx | null = null;
  let previous: number | null = null;
  const out: ParsedTx[] = [];
  const totals: {
    kind: "withdraw" | "deposit";
    count: number;
    amount: number;
  }[] = [];
  for (const row of rows) {
    if (row.page !== page) {
      page = row.page;
      columns = null;
      current = null;
    }
    const cells = row.cells.map((c) => ({ ...c, text: c.text.trim() }));
    const header = (re: RegExp) => cells.find((c) => re.test(c.text));
    if (header(/^(วันที่\/เวลา|Date\/Time)$/i)) {
      const item = header(/^(รายการ|Transaction)$/i),
        detail = header(/^(รายละเอียด\/หมายเลขเช็ค|Details\/Cheque No\.)$/i),
        debit = header(/^(รายการถอน|Withdrawal)$/i),
        credit = header(/^(รายการฝาก|Deposit)$/i),
        balance = header(/^(ยอดเงินคงเหลือ|Balance)$/i),
        branch = header(/^(สาขา|Branch)$/i);
      if (
        !item ||
        !detail ||
        !debit ||
        !credit ||
        !balance ||
        !branch ||
        !(
          item.x < detail.x &&
          detail.x < debit.x &&
          debit.x < credit.x &&
          credit.x < balance.x &&
          balance.x < branch.x
        )
      )
        return unsupported();
      columns = {
        item: item.x - 2,
        detail: detail.x - 2,
        debit: debit.x - 10,
        credit: credit.x - 10,
        balance: balance.x - 10,
        branch: branch.x - 10,
      };
      current = null;
      continue;
    }
    const total = header(
      /^(รายการถอนทั้งหมด|รายการฝากทั้งหมด|Total Withdrawals|Total Deposits)$/i
    );
    if (total) {
      const values = cells.filter((c) => c.x > total.x).map((c) => c.text);
      if (values.length !== 2 || !/^\d+$/.test(values[0])) return unsupported();
      totals.push({
        kind: /ถอน|Withdrawals/i.test(total.text) ? "withdraw" : "deposit",
        count: Number(values[0]),
        amount: cents(values[1]),
      });
      current = null;
      continue;
    }
    if (!columns) continue;
    const col = columns;
    const dateCell = cells.find(
      (c) => c.x < col.item && /^\d{2}\/\d{2}\/\d{2}(?:\d{2})?$/.test(c.text)
    );
    if (dateCell) {
      const amounts = (from: number, to: number) =>
        cells.filter((c) => c.x >= from && c.x < to).map((c) => cents(c.text));
      const debit = amounts(col.debit, col.credit),
        credit = amounts(col.credit, col.balance),
        balance = amounts(col.balance, col.branch);
      if (
        debit.length > 1 ||
        credit.length > 1 ||
        (!debit.length && !credit.length) ||
        balance.length !== 1
      )
        return unsupported();
      const withdrawal = debit[0] ?? 0,
        deposit = credit[0] ?? 0;
      if (withdrawal < 0 || deposit < 0) return unsupported();
      if (previous !== null && previous + deposit - withdrawal !== balance[0])
        return unsupported();
      previous = balance[0];
      const description = cells
        .filter((c) => c.x >= col.item && c.x < col.debit)
        .map((c) => c.text)
        .join(" — ");
      if (!description) return unsupported();
      current = {
        date: date(dateCell.text),
        time: null,
        description,
        deposit: deposit / 100,
        withdraw: withdrawal / 100,
        balance: balance[0] / 100,
        channel: null,
      };
      if (out.length && current.date < out.at(-1)!.date) return unsupported();
      out.push(current);
    } else if (current) {
      const time = cells.find(
        (c) => c.x < col.item && /^\d{2}:\d{2}$/.test(c.text)
      );
      if (time) {
        if (
          current.time ||
          Number(time.text.slice(0, 2)) > 23 ||
          Number(time.text.slice(3)) > 59
        )
          return unsupported();
        current.time = time.text;
      }
      const details = cells
        .filter((c) => c.x >= col.detail && c.x < col.debit)
        .map((c) => c.text)
        .join(" ");
      if (details) current.description += " — " + details;
      if (!time && !details) current = null;
    }
  }
  for (const total of totals) {
    const active = out.filter((r) => r[total.kind] > 0);
    if (
      active.length !== total.count ||
      active.reduce((sum, r) => sum + Math.round(r[total.kind] * 100), 0) !==
        total.amount
    )
      return unsupported();
  }
  return out;
}
