import { z } from "zod";

export const GRAB_REPORT_KIND = "GRAB_REPORT";
export const GRAB_REPORT_MARKER = "GRAB_REPORT_V1:";
export const GRAB_MAX_BYTES = 2 * 1024 * 1024;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().int().min(-100_000_000_00).max(100_000_000_00);
const text = z.string().min(1).max(500);
export const grabRowSchema = z
  .object({
    merchantId: text,
    storeId: text,
    storeName: text,
    transactionId: text,
    orderId: text,
    shortOrderId: z.string().max(500),
    bookingId: z.string().max(500),
    createdAt: z.string().max(50),
    saleDate: day,
    transferDate: day,
    settlementId: text,
    paymentMethod: z.string().max(500),
    sales: money,
    commission: money,
    feeTax: money,
    net: money,
  })
  .strict();
export type GrabRow = z.infer<typeof grabRowSchema>;
const reportSchema = z
  .object({
    version: z.literal(1),
    rows: z.array(grabRowSchema).min(1).max(3000),
  })
  .strict();
export type GrabReport = z.infer<typeof reportSchema>;
export class GrabError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const fail = (code: string): never => {
  throw new GrabError(code);
};

// RFC 4180, including quoted commas/newlines and escaped quotes. No spreadsheet
// evaluation: all fields are data. Duplicate header names are kept by position.
export function readCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const s = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
    } else if (c === '"') {
      if (value || closed) fail("grab.csv");
      quoted = true;
    } else if (c === ",") {
      row.push(value);
      value = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
      closed = false;
    } else {
      if (closed) fail("grab.csv");
      value += c;
    }
  }
  if (quoted) fail("grab.csv");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length > 3001) fail("grab.size");
  return rows;
}
export function cents(source: string): number {
  const s = source.trim();
  if (!s) return 0;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s))
    fail("grab.money");
  const [whole, fraction = ""] = s
    .replaceAll(",", "")
    .replace(/^-/, "")
    .split(".");
  const result =
    (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
    (s.startsWith("-") ? -1 : 1);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 100_000_000_00)
    fail("grab.money");
  return result;
}
export function grabDate(source: string): string {
  const m =
    /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\d{2}) (\d{1,2}):(\d{2}) (AM|PM)$/.exec(
      source.trim()
    );
  if (!m) return fail("grab.invalidDate");
  const month =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(m[2]) + 1;
  const d = Number(m[1]),
    y = Number(m[3]);
  if (
    Number(m[4]) < 1 ||
    Number(m[4]) > 12 ||
    Number(m[5]) > 59 ||
    d < 1 ||
    d > new Date(Date.UTC(y, month, 0)).getUTCDate()
  )
    fail("grab.invalidDate");
  // The report has no UTC offset. Preserve its stated calendar date and time.
  return `${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export const grabKey = (r: GrabRow) =>
  JSON.stringify([r.merchantId, r.storeId, r.transactionId]);
export function uniqueGrabRows(rows: GrabRow[]): GrabRow[] {
  const map = new Map<string, GrabRow>();
  for (const row of rows) {
    const old = map.get(grabKey(row));
    if (old && JSON.stringify(old) !== JSON.stringify(row))
      fail("grab.conflict");
    map.set(grabKey(row), row);
  }
  return [...map.values()];
}
export function parseGrabCsv(source: string): GrabReport {
  if (new TextEncoder().encode(source).length > GRAB_MAX_BYTES)
    fail("grab.size");
  const [headers, ...data] = readCsv(source);
  if (
    !headers ||
    !data.length ||
    headers[0] !== "ชื่อร้าน" ||
    headers[2] !== "ชื่อร้าน"
  )
    fail("grab.format");
  const fields = [
    "Merchant ID",
    "รหัสร้านค้า",
    "วันที่สร้าง",
    "ประเภท",
    "หมวดหมู่",
    "สถานะ",
    "Transaction ID",
    "รหัสคำสั่งซื้อยาว",
    "รหัสคำสั่งซื้อสั้น",
    "รหัสการจอง",
    "ประเภทคำสั่งซื้อ",
    "วิธีการชำระเงิน",
    "รหัสการทำรายการ",
    "วันที่โอน",
    "ยอดขายสุทธิ",
    "ค่าคอมมิชชันแพลตฟอร์ม",
    "ทั้งหมด",
    "ภาษีค่าคอมมิชชัน, การปรับรายได้, โฆษณา GrabFood / GrabMart",
  ];
  const indexes = new Map<string, number>();
  for (const field of fields) {
    if (headers.filter((h) => h === field).length !== 1) fail("grab.format");
    indexes.set(field, headers.indexOf(field));
  }
  const rows = data.map((values) => {
    if (values.length !== headers.length) fail("grab.csv");
    const v = (name: string) => values[indexes.get(name)!].trim();
    // V1 deliberately rejects refunds, cancellations, ads-only and other report
    // formats as a whole, rather than silently importing incomplete financials.
    if (
      v("ประเภท") !== "GrabFood" ||
      v("หมวดหมู่") !== "ชำระเงิน" ||
      v("ประเภทคำสั่งซื้อ") !== "Auto-Paid" ||
      v("สถานะ") !== "โอนแล้ว"
    )
      fail("grab.unsupported");
    if (
      ["ยอดขายสุทธิ", "ค่าคอมมิชชันแพลตฟอร์ม", "ทั้งหมด"].some(
        (name) => !v(name)
      )
    )
      fail("grab.money");
    const parsed = grabRowSchema.safeParse({
      merchantId: v("Merchant ID"),
      storeId: v("รหัสร้านค้า"),
      storeName: values[2].trim(),
      transactionId: v("Transaction ID"),
      orderId: v("รหัสคำสั่งซื้อยาว"),
      shortOrderId: v("รหัสคำสั่งซื้อสั้น"),
      bookingId: v("รหัสการจอง"),
      createdAt: v("วันที่สร้าง"),
      saleDate: grabDate(v("วันที่สร้าง")),
      transferDate: grabDate(v("วันที่โอน")),
      settlementId: v("รหัสการทำรายการ"),
      paymentMethod: v("วิธีการชำระเงิน"),
      sales: cents(v("ยอดขายสุทธิ")),
      commission: cents(v("ค่าคอมมิชชันแพลตฟอร์ม")),
      feeTax: cents(
        v("ภาษีค่าคอมมิชชัน, การปรับรายได้, โฆษณา GrabFood / GrabMart")
      ),
      net: cents(v("ทั้งหมด")),
    });
    if (!parsed.success) return fail("grab.format");
    if (
      parsed.data.sales < 0 ||
      parsed.data.net < 0 ||
      parsed.data.commission > 0 ||
      parsed.data.feeTax > 0 ||
      parsed.data.transferDate < parsed.data.saleDate
    )
      fail("grab.unsupported");
    return parsed.data;
  });
  const storeKeys = new Set(
    rows.map((r) => JSON.stringify([r.merchantId, r.storeId]))
  );
  if (storeKeys.size !== 1) fail("grab.store");
  return { version: 1, rows: uniqueGrabRows(rows) };
}
export function encodeGrabReport(report: GrabReport): string {
  return GRAB_REPORT_MARKER + JSON.stringify(reportSchema.parse(report));
}
export function decodeGrabReport(note: string | null): GrabReport {
  try {
    if (!note?.startsWith(GRAB_REPORT_MARKER)) return fail("grab.stored");
    const result = reportSchema.safeParse(
      JSON.parse(note.slice(GRAB_REPORT_MARKER.length))
    );
    if (!result.success) return fail("grab.stored");
    return result.data;
  } catch {
    return fail("grab.stored");
  }
}
export function summarizeGrab(rows: GrabRow[]) {
  const sum = (field: "sales" | "commission" | "feeTax" | "net") =>
    rows.reduce((n, r) => n + r[field], 0);
  const sales = sum("sales"),
    gp = -sum("commission"),
    feeTax = -sum("feeTax"),
    net = sum("net");
  return {
    count: rows.length,
    sales,
    gp,
    feeTax,
    net,
    other: net - sales + gp,
  };
}
export function grabPayouts(rows: GrabRow[]) {
  const map = new Map<
    string,
    {
      key: string;
      date: string;
      settlementId: string;
      storeName: string;
      rows: GrabRow[];
    }
  >();
  for (const r of rows) {
    const key = JSON.stringify([
      r.merchantId,
      r.storeId,
      r.settlementId,
      r.transferDate,
    ]);
    if (!map.has(key))
      map.set(key, {
        key,
        date: r.transferDate,
        settlementId: r.settlementId,
        storeName: r.storeName,
        rows: [],
      });
    map.get(key)!.rows.push(r);
  }
  return [...map.values()]
    .map((p) => ({ ...p, ...summarizeGrab(p.rows) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
