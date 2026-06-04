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

// pdfjs needs the legacy build for Node serverless environments.
// We import it lazily inside parseKbankPdf so a module-load failure surfaces
// as a normal error string instead of a Server Components render crash.

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

/**
 * Normalize various KBANK date formats into ISO YYYY-MM-DD.
 *
 * Handles all four common Thai bank/card date styles:
 *   DD/MM/YY  with YY = CE last 2 digits  (e.g. credit card: "26/04/26" → 2026)
 *   DD/MM/YY  with YY = BE last 2 digits  (e.g. savings:    "26/04/69" → 2026)
 *   DD/MM/YYYY with full CE year (e.g. "26/04/2026")
 *   DD/MM/YYYY with full BE year (e.g. "26/04/2569" → 2026)
 *
 * 2-digit-year heuristic: years 00–50 → 20YY (CE), 51–99 → 25YY (BE).
 * This works because no statement in the wild has both YY=26 meaning 1926
 * AND YY=26 meaning 2526 — banks emit one style or the other.
 */
function normalizeDate(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);

  if (m[3].length === 2) {
    // 2-digit year: low range = CE, high range = BE last-two
    y = y <= 50 ? y + 2000 : y + 2500;
  }
  // Full BE year → CE
  if (y >= 2400 && y < 2700) y -= 543;

  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  if (y < 1900 || y > 2200) return null;
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
  // unpdf wraps pdfjs-dist with the DOMMatrix/Path2D/ImageData polyfills that
  // serverless Node lacks. API is otherwise identical to pdfjs's getDocument.
  let getDocumentProxy: typeof import("unpdf").getDocumentProxy;
  try {
    ({ getDocumentProxy } = await import("unpdf"));
  } catch (e) {
    return {
      ok: false,
      message: `โหลดตัวอ่าน PDF ไม่ได้: ${(e as Error).message}`,
      rows: [],
      rawText: [],
    };
  }

  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    doc = await getDocumentProxy(new Uint8Array(buf), {
      password: password ?? "",
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    } as Parameters<typeof getDocumentProxy>[1]);
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

/**
 * Decide whether a transaction is money IN (deposit) or money OUT (withdraw)
 * by reading Thai/English keywords in the description + channel text.
 *
 * Order matters: deposit patterns are checked first because "รับโอนเงิน"
 * contains the substring "โอนเงิน" (which would otherwise match as withdraw).
 */
function classifyDirection(text: string): "deposit" | "withdraw" | "unknown" {
  const t = text;

  // ── DEPOSIT — money received ──
  if (
    /รับโอน|รับเงิน|รับเข้า|รับฝาก/i.test(t) || // KBANK savings
    /ฝากเข้า|ฝากเงินสด|ฝากเช็ค|cdm/i.test(t) ||
    /ดอกเบี้ย|\binterest\b/i.test(t) ||
    /refund|reverse|cash ?back|chargeback/i.test(t) ||
    /payment\s*-?\s*thank\s*you/i.test(t) || // KBANK CC: "PAYMENT - THANK YOU"
    /รับเงินจากการขาย|รับโอนจากการขาย/i.test(t) ||
    /credit\s+(adjustment|memo)/i.test(t)
  ) {
    return "deposit";
  }

  // ── WITHDRAW — money sent / paid ──
  if (
    /โอนเงิน|โอนไป|ส่งโอน|โอนออก/i.test(t) ||
    /ชำระเงิน|ชำระค่า|ชำระบัตร|ชำระสินค้า/i.test(t) ||
    /ถอนเงิน|ถอนสด|กดเงิน/i.test(t) ||
    /หักค่า|หักบัญชี|หักบัตร/i.test(t) ||
    /ค่าธรรมเนียม|ค่าบริการ/i.test(t) ||
    /\batm\b|\bedc\b|\bpos\b/i.test(t) ||
    /\bwithdraw|\bdebit|\bpurchase|\bcharge\b/i.test(t)
  ) {
    return "withdraw";
  }

  return "unknown";
}

/** Try to parse a single statement row. Returns null if it isn't a transaction. */
function parseRow(cells: string[]): ParsedTx | null {
  if (cells.length < 2) return null;

  // First cell must be a date
  const date = normalizeDate(cells[0]);
  if (!date) return null;

  // Collect numeric cells from the right side (deposit/withdraw/balance)
  const numericIdx: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (NUMERIC_RE.test(cells[i].trim())) numericIdx.push(i);
  }
  if (numericIdx.length === 0) return null;

  // Balance is always the LAST numeric cell in KBANK statements.
  const lastNumIdx = numericIdx[numericIdx.length - 1];
  const balance = num(cells[lastNumIdx]);

  // Everything between date and last-numeric describes the transaction.
  // Use the full description + channel text for direction classification.
  const firstNumIdx = numericIdx[0];
  const directionText = [
    ...cells.slice(1, firstNumIdx),
    ...cells.slice(lastNumIdx + 1),
  ].join(" ");
  const direction = classifyDirection(directionText);

  let deposit = 0;
  let withdraw = 0;

  if (numericIdx.length >= 2) {
    // The cell just before balance is the active amount.
    const amount = num(cells[numericIdx[numericIdx.length - 2]]);
    if (direction === "deposit") {
      deposit = amount;
    } else {
      // "withdraw" or "unknown" → default to withdraw (charges/fees are
      // more common than receipts; user can flip in the preview).
      withdraw = amount;
    }
  }
  // If the row has BOTH a deposit and a withdraw column populated
  // (rare but possible — e.g. fee + transfer in one entry), the cell
  // two-before-balance is the other half.
  if (numericIdx.length >= 3) {
    const other = num(cells[numericIdx[numericIdx.length - 3]]);
    if (direction === "deposit") {
      withdraw = other;
    } else {
      deposit = other;
    }
  }

  // Description = text BETWEEN the date and the first numeric cell.
  // (firstNumIdx was already computed above for direction classification.)
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
