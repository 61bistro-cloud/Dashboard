/**
 * Bank statement PDF parser (KBANK + SCB).
 *
 * Approach:
 *   1. Use unpdf (pdfjs) to open the password-protected PDF and pull every
 *      text item with its (x, y) coordinates.
 *   2. Bucket items into rows by y-coordinate; sort each row's cells by x.
 *   3. Detect the issuing bank from the page text.
 *   4. Dispatch to a bank-specific row parser:
 *      - KBANK: per-row, direction inferred from Thai/English keywords.
 *      - SCB:   direction inferred from the running-balance delta (robust),
 *               with DESC/NOTE descriptions stitched from adjacent lines.
 *
 * Anything unparseable is simply skipped; the user verifies/edits the rest in
 * the preview UI before importing.
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
  /** Statement's brought-forward balance (ยอดยกมา), if found */
  openingBalance?: number | null;
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

type Cell = { x: number; text: string };
type Row = { cells: Cell[] };

function isNumeric(s: string): boolean {
  return NUMERIC_RE.test(s.trim());
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Open a (possibly password-protected) statement PDF and return its text
 * laid out as rows of (x, text) cells, in reading order across all pages.
 */
async function extractRows(
  buf: ArrayBuffer,
  password: string | undefined
): Promise<
  | { ok: true; rows: Row[]; rawText: string[] }
  | { ok: false; password?: "missing" | "wrong"; message: string }
> {
  let getDocumentProxy: typeof import("unpdf").getDocumentProxy;
  try {
    ({ getDocumentProxy } = await import("unpdf"));
  } catch (e) {
    return {
      ok: false,
      message: `โหลดตัวอ่าน PDF ไม่ได้: ${(e as Error).message}`,
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
            ? "รหัสผ่านไม่ถูกต้อง — statement ใช้วันเกิด 8 หลัก (ddmmyyyy)"
            : "ไฟล์ PDF มีรหัสผ่าน กรุณาใส่รหัส",
      };
    }
    return {
      ok: false,
      message: `อ่าน PDF ไม่ได้: ${err?.message ?? String(e)}`,
    };
  }

  const rawText: string[] = [];
  const rows: Row[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;

    const tuples = items
      .filter((it) => it.str.trim() !== "")
      .map((it) => ({ x: it.transform[4], y: it.transform[5], text: it.str }));

    const sortedForText = [...tuples].sort((a, b) => b.y - a.y || a.x - b.x);
    rawText.push(sortedForText.map((t) => t.text).join(" "));

    // Bucket by y → rows
    const lines = new Map<number, typeof tuples>();
    for (const t of tuples) {
      const key = Math.round(t.y / Y_TOL) * Y_TOL;
      const bucket = lines.get(key);
      if (bucket) bucket.push(t);
      else lines.set(key, [t]);
    }

    // Top-down, each row's cells left-to-right
    const sortedKeys = [...lines.keys()].sort((a, b) => b - a);
    for (const k of sortedKeys) {
      const cells = lines
        .get(k)!
        .sort((a, b) => a.x - b.x)
        .map((c) => ({ x: c.x, text: c.text }));
      rows.push({ cells });
    }
  }

  return { ok: true, rows, rawText };
}

/** Detect which bank issued the statement from its text. */
function detectBank(rawText: string[]): "SCB" | "KBANK" {
  const all = rawText.join(" ");
  if (/ไทยพาณิชย์|SIAM COMMERCIAL/i.test(all)) return "SCB";
  return "KBANK"; // default
}

/**
 * Find the statement's opening (brought-forward) balance:
 *   KBANK: "ยอดยกมา"
 *   SCB:   "ยอดเงินคงเหลือยกมา (BALANCE BROUGHT FORWARD)"
 * Returns the balance figure on that row, or null if not present.
 */
function findOpeningBalance(rows: Row[]): number | null {
  for (const r of rows) {
    const joined = r.cells.map((c) => c.text).join(" ");
    if (/ยอดยกมา|ยอดเงินคงเหลือยกมา|BALANCE BROUGHT FORWARD/i.test(joined)) {
      const nums = r.cells.filter((c) => isNumeric(c.text));
      if (nums.length) return num(nums[nums.length - 1].text);
    }
  }
  return null;
}

/**
 * Entry point — open the statement, detect the bank, and parse its rows.
 * Kept the historical name `parseKbankPdf` for callers; now multi-bank.
 */
export async function parseKbankPdf(
  buf: ArrayBuffer,
  password: string | undefined
): Promise<ParseResult> {
  const ex = await extractRows(buf, password);
  if (!ex.ok) {
    return {
      ok: false,
      password: ex.password,
      message: ex.message,
      rows: [],
      rawText: [],
    };
  }

  const bank = detectBank(ex.rawText);
  const rows =
    bank === "SCB"
      ? parseScbRows(ex.rows)
      : ex.rows
          .map((r) => parseRow(r.cells.map((c) => c.text)))
          .filter((x): x is ParsedTx => x !== null);

  const openingBalance = findOpeningBalance(ex.rows);

  return { ok: true, rows, openingBalance, rawText: ex.rawText };
}

/** Alias with a clearer name for new call sites. */
export const parseBankStatement = parseKbankPdf;

// ─────────────────────── SCB savings-account parser ───────────────────────

// "01/04/26 05:11" — date + time in a single leading cell
const SCB_DT_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+\d{1,2}:\d{2}/;

/** Pull DESC:/NOTE: labelled text out of a set of cells (single row). */
function splitDescNote(cells: Cell[]): { desc: string; note: string } {
  let mode: "desc" | "note" | null = null;
  const desc: string[] = [];
  const note: string[] = [];
  for (const c of cells.filter((c) => c.x >= 388).sort((a, b) => a.x - b.x)) {
    const t = c.text.trim();
    if (/^DESC\s*:?$/i.test(t)) {
      mode = "desc";
      continue;
    }
    if (/^NOTE\s*:?$/i.test(t)) {
      mode = "note";
      continue;
    }
    if (!t || t === "-") continue;
    if (mode === "note") note.push(t);
    else if (mode === "desc") desc.push(t);
  }
  return { desc: desc.join(" "), note: note.join(" ") };
}

/** Collect only the text under a given label across several rows. */
function labelledText(rows: Row[], want: "desc" | "note"): string {
  let mode: "desc" | "note" | null = null;
  const acc: string[] = [];
  for (const r of rows) {
    for (const c of r.cells
      .filter((c) => c.x >= 388)
      .sort((a, b) => a.x - b.x)) {
      const t = c.text.trim();
      if (/^DESC\s*:?$/i.test(t)) {
        mode = "desc";
        continue;
      }
      if (/^NOTE\s*:?$/i.test(t)) {
        mode = "note";
        continue;
      }
      if (!t || t === "-") continue;
      if (mode === want) acc.push(t);
    }
  }
  return acc.join(" ").replace(/\s+/g, " ").trim();
}

function parseScbRows(rows: Row[]): ParsedTx[] {
  // Opening balance = "ยอดเงินคงเหลือยกมา (BALANCE BROUGHT FORWARD)"
  let prevBalance: number | null = null;
  for (const r of rows) {
    const joined = r.cells.map((c) => c.text).join(" ");
    if (/BALANCE BROUGHT FORWARD|ยอดเงินคงเหลือยกมา/i.test(joined)) {
      const nums = r.cells.filter((c) => isNumeric(c.text));
      if (nums.length) prevBalance = num(nums[nums.length - 1].text);
      break;
    }
  }

  const isDateRow = (r: Row) =>
    r.cells.some((c) => c.x < 70 && SCB_DT_RE.test(c.text.trim()));
  const dateIdxs: number[] = [];
  rows.forEach((r, i) => {
    if (isDateRow(r)) dateIdxs.push(i);
  });

  const out: ParsedTx[] = [];
  for (let j = 0; j < dateIdxs.length; j++) {
    const di = dateIdxs[j];
    const r = rows[di];

    const dateCell = r.cells.find(
      (c) => c.x < 70 && SCB_DT_RE.test(c.text.trim())
    )!;
    const m = dateCell.text.trim().match(SCB_DT_RE)!;
    const date = normalizeDate(`${m[1]}/${m[2]}/${m[3]}`);
    if (!date) continue;

    // Numerics to the right of the code column = [amount, balance]
    const nums = r.cells
      .filter((c) => c.x > 150 && isNumeric(c.text))
      .sort((a, b) => a.x - b.x);
    const balance = nums.length ? num(nums[nums.length - 1].text) : null;
    const printedAmount =
      nums.length >= 2 ? num(nums[nums.length - 2].text) : 0;
    const amountCell = nums.length >= 2 ? nums[nums.length - 2] : null;

    let deposit = 0;
    let withdraw = 0;
    if (prevBalance !== null && balance !== null) {
      // Running-balance delta is the most reliable direction signal
      const delta = round2(balance - prevBalance);
      if (delta >= 0) deposit = delta;
      else withdraw = -delta;
    } else if (amountCell) {
      // Fallback: SCB prints debits in the left sub-column, credits on the right
      if (amountCell.x < 240) withdraw = printedAmount;
      else deposit = printedAmount;
    }
    if (balance !== null) prevBalance = balance;

    // Channel code (MEWT / ENET / ATM …) sits just after the X1/X2 code
    const chCell = r.cells.find(
      (c) => c.x >= 108 && c.x < 185 && /[A-Za-z]/.test(c.text)
    );
    const channel = chCell ? chCell.text.trim() : null;

    // Description: DESC on the same line + DESC that rendered just above this
    // row (gap from the previous transaction); NOTE that rendered just below.
    const gapAbove = rows.slice((dateIdxs[j - 1] ?? -1) + 1, di);
    const gapBelow = rows.slice(di + 1, dateIdxs[j + 1] ?? rows.length);
    const sameLine = splitDescNote(r.cells);
    const descAbove = labelledText(gapAbove, "desc");
    const noteBelow = labelledText(gapBelow, "note");

    const descParts = [descAbove, sameLine.desc].filter(Boolean);
    const noteParts = [sameLine.note, noteBelow].filter((s) => s && s !== "-");
    let description = descParts.join(" ").replace(/\s+/g, " ").trim();
    const note = noteParts.join(" ").replace(/\s+/g, " ").trim();
    if (note) description = description ? `${description} — ${note}` : note;
    if (!description) description = channel ?? "(ไม่มีรายละเอียด)";

    out.push({ date, description, deposit, withdraw, balance, channel });
  }

  return out;
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

  // SCB QR sales (แม่มณี / MaeManee) — money received via store QR = POS income
  if (/maemanee|mae ?manee|แม่มณี/i.test(d) && isCredit) {
    return "💳 Platform - EDC/MYQR";
  }

  // Common patterns. Tune to match the seeded TransactionCategory names.
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
