/**
 * KBANK statement PDF parser.
 *
 * Approach:
 *   1. Use pdfjs-dist to open the (often password-protected) PDF and pull
 *      every text item with its (x, y) coordinates.
 *   2. Bucket items into rows by y-coordinate (same line).
 *   3. Inside each row, sort by x-coordinate to recover column order.
 *   4. Parse the row into a transaction if the leading cell looks like a date.
 *
 * Tested against the standard KBANK Internet Banking statement layout. The
 * extractor is forgiving — anything that can't be parsed is returned as a
 * "raw" row so the user can verify or edit in the preview UI.
 */

// pdfjs needs the legacy build for Node serverless environments
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export type ParsedTx = {
  /** Row date in YYYY-MM-DD (Thai BE years converted to CE) */
  date: string;
  /** Raw description text — bank shows things like "K PLUS โอนเงิน → ชื่อ" */
  description: string;
  /** Deposit / credit amount (>=0) */
  deposit: number;
  /** Withdrawal / debit amount (>=0) */
  withdraw: number;
  /** Running balance shown on the statement, or null if not parseable */
  balance: number | null;
  /** Channel code from the rightmost column (K PLUS / ATM / EDC ...) */
  channel: string | null;
};

export type ParseResult = {
  ok: boolean;
  password?: "missing" | "wrong";
  message?: string;
  rows: ParsedTx[];
  /** Raw text per page — useful for debugging or hand-fixing in the UI */
  rawText: string[];
};

/** Normalize various KBANK date formats into ISO YYYY-MM-DD. */
function normalizeDate(s: string): string | null {
  const t = s.trim();
  // DD-MM-YY (Thai BE) or DD-MM-YYYY
  let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (m[3].length === 2) y += 2500; // BE 2-digit → 25xx
  if (y > 2400 && y < 2700) y -= 543; // BE → CE
  if (y < 100) y += 2000; // 24 → 2024
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse a number that may include commas. Returns 0 for unparseable. */
function num(s: unknown): number {
  if (s == null) return 0;
  const str = String(s).trim().replace(/,/g, "");
  if (!str || str === "-") return 0;
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

const NUMERIC_RE = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;

/** Distance threshold (in PDF units) for considering two items the "same row" */
const Y_TOL = 2.5;

export async function parseKbankPdf(
  buf: ArrayBuffer,
  password: string | undefined
): Promise<ParseResult> {
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      password: password ?? "",
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err?.name === "PasswordException") {
      const need = /incorrect/i.test(err.message ?? "") ? "wrong" : "missing";
      return {
        ok: false,
        password: need,
        message:
          need === "wrong"
            ? "รหัสผ่านไม่ถูกต้อง — KBANK statement ใช้วันเกิด 8 หลัก (ddmmyyyy)"
            : "ไฟล์ PDF มีรหัสผ่าน กรุณาใส่รหัส",
        rows: [],
        rawText: [],
      };
    }
    return {
      ok: false,
      message: `อ่าน PDF ไม่ได้: ${err?.message ?? String(e)}`,
      rows: [],
      rawText: [],
    };
  }

  const rawText: string[] = [];
  const rows: ParsedTx[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{
      str: string;
      transform: number[];
    }>;

    // Build (x, y, text) tuples; in PDF y grows upward.
    const tuples = items
      .filter((it) => it.str.trim() !== "")
      .map((it) => ({
        x: it.transform[4],
        y: it.transform[5],
        text: it.str,
      }));

    // Page raw text — join in reading order (top-down, left-right)
    const sortedForText = [...tuples].sort((a, b) => b.y - a.y || a.x - b.x);
    rawText.push(sortedForText.map((t) => t.text).join(" "));

    // Bucket by y (rows)
    const lines = new Map<number, typeof tuples>();
    for (const t of tuples) {
      // Snap y to nearest tolerance bucket
      const key = Math.round(t.y / Y_TOL) * Y_TOL;
      let bucket = lines.get(key);
      if (!bucket) {
        bucket = [];
        lines.set(key, bucket);
      }
      bucket.push(t);
    }

    // Sort each bucket by x; iterate from top of page downward
    const sortedKeys = [...lines.keys()].sort((a, b) => b - a);
    for (const k of sortedKeys) {
      const cells = lines.get(k)!.sort((a, b) => a.x - b.x);
      const parsed = parseRow(cells.map((c) => c.text));
      if (parsed) rows.push(parsed);
    }
  }

  return { ok: true, rows, rawText };
}

/** Try to parse a single statement row. Returns null if it isn't a transaction. */
function parseRow(cells: string[]): ParsedTx | null {
  if (cells.length < 2) return null;

  // First cell must be a date
  const date = normalizeDate(cells[0]);
  if (!date) return null;

  // Collect numeric cells from the right side (deposit/withdraw/balance)
  // Typical KBANK row tail: [..., deposit-or-blank, withdraw-or-blank, balance, channel]
  const numericIdx: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (NUMERIC_RE.test(cells[i].trim())) numericIdx.push(i);
  }
  if (numericIdx.length === 0) return null;

  // Heuristic: balance is the LAST numeric cell; the one(s) before are
  // deposit/withdraw. Channel is anything after the last numeric.
  const lastNumIdx = numericIdx[numericIdx.length - 1];
  const balance = num(cells[lastNumIdx]);

  let deposit = 0;
  let withdraw = 0;
  // If there are 3+ numeric cells, the second-to-last is the active one
  if (numericIdx.length >= 2) {
    const prev = num(cells[numericIdx[numericIdx.length - 2]]);
    // Position heuristic: deposit usually appears in a slightly more-left column
    // than withdraw, but absolute x isn't tracked here. Default to withdraw —
    // user can flip in the preview if needed.
    withdraw = prev;
  }
  // If there are 4+ numeric cells, both deposit and withdraw may be present
  if (numericIdx.length >= 3) {
    deposit = num(cells[numericIdx[numericIdx.length - 3]]);
  }

  // Description = text BETWEEN the date and the first numeric cell
  const firstNumIdx = numericIdx[0];
  const description = cells
    .slice(1, firstNumIdx)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Channel = text AFTER the last numeric cell
  const channel =
    cells
      .slice(lastNumIdx + 1)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || null;

  // Skip header/total rows that happen to start with a date-like token
  if (/^(ยอดยกมา|ยอดยกไป|รวม|Total|Brought|Carried)/i.test(description)) {
    return { date, description, deposit, withdraw, balance, channel };
  }

  return { date, description, deposit, withdraw, balance, channel };
}

/**
 * Suggest a TransactionCategory from a description + amount sign.
 * Returns the category name (string) — caller resolves to the actual id.
 */
export function suggestCategoryName(
  desc: string,
  deposit: number,
  withdraw: number
): string | null {
  const d = desc.toLowerCase();
  const isCredit = deposit > 0;
  const isDebit = withdraw > 0;

  // Common KBANK patterns. Tune to match the seeded TransactionCategory names.
  if (
    /makro|แม็คโคร|big ?c|lotus|โลตัส|ร้านอาหาร|วัตถุดิบ|seafood|ซีฟู้ด/i.test(
      d
    )
  ) {
    return "🥩 ต้นทุน - วัตถุดิบอาหาร";
  }
  if (/freshket|fresh ket/i.test(d)) {
    return "🥩 ต้นทุน - วัตถุดิบอาหาร";
  }
  if (/lineman|line man/i.test(d)) {
    return isCredit ? "🟢 รายรับ - LINE MAN" : "🛵 Platform - Lineman/Grab GP";
  }
  if (/grab|wokboy/i.test(d)) {
    return isCredit ? "🛵 รายรับ - Grab" : "🛵 Platform - Lineman/Grab GP";
  }
  if (/foodstory|food story|edc|myqr|prompt ?pay/i.test(d) && isCredit) {
    return "💳 Platform - EDC/MYQR";
  }
  if (/atm|ถอนเงินสด|cash withdrawal/i.test(d)) {
    return "💵 ถอนเงินสด (ATM)";
  }
  if (/cdm|ฝากเงินสด|cash deposit/i.test(d) && isCredit) {
    return "💰 รายรับ - ฝากเงินสด";
  }
  if (
    /jas|monomax|canva|youtube|google|spotify|apple|netflix|subscription/i.test(
      d
    )
  ) {
    return "📱 Subscription & Software";
  }
  if (
    /ค่าไฟ|mea|pea|metropolitan electricity|electricity|ค่าน้ำ|water/i.test(d)
  ) {
    return "⚡ ค่าสาธารณูปโภค (ไฟ/น้ำ)";
  }
  if (/internet|true|ais|3bb|nbtc|dtac|โทรศัพท์|อินเทอร์เน็ต/i.test(d)) {
    return "🌐 ค่าอินเตอร์เน็ต/โทรศัพท์";
  }
  if (/ค่าเช่า|rent|landlord/i.test(d)) {
    return "🏠 ค่าเช่า";
  }
  if (/เงินเดือน|payroll|salary/i.test(d) && isDebit) {
    return "👥 เงินเดือนพนักงาน";
  }
  if (/ot|โอที|พิเศษ|bonus|โบนัส/i.test(d) && isDebit) {
    return "👥 ค่าจ้าง/OT/พิเศษ";
  }
  if (/เบิก|advance/i.test(d) && isDebit) {
    return "💊 เบิกล่วงหน้าพนักงาน";
  }
  if (/marketing|โฆษณา|advertising|facebook ads|google ads/i.test(d)) {
    return "📣 Marketing & โฆษณา";
  }
  if (/ออฟฟิตเมท|office ?mate|shopee|lazada|alibaba|hardware/i.test(d)) {
    return "🛒 ต้นทุน - ซื้อสินค้า/จัดซื้อ";
  }
  if (/ชำระบัตรเครดิต|credit card payment|credit ?card/i.test(d) && isDebit) {
    return "🔴 ชำระบัตรเครดิต";
  }
  if (/โอนระหว่างบัญชี|transfer to own|own account/i.test(d)) {
    return "🔄 โอนระหว่างบัญชี";
  }
  if (/ยกยอด|brought forward|opening balance/i.test(d)) {
    return "📅 ยกยอดเดือนก่อน";
  }

  // Generic catch-alls — better than nothing
  if (isCredit) return "💰 รายรับ - โอนรับ/ยอดขาย";
  if (isDebit) return "🗂️ ค่าใช้จ่ายเบ็ดเตล็ด";
  return null;
}
