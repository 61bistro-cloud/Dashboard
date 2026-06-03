import * as XLSX from "xlsx";

/** Result of parsing one row from a Foodstory export */
export type ParsedBill = {
  id: string;
  paidAt: Date;
  paymentDate: string; // YYYY-MM-DD
  posId: string | null;
  invoiceNo: string | null;

  grossAmount: number;
  itemDiscount: number;
  billDiscount: number;
  totalAmount: number;
  serviceCharge: number;
  vatAmount: number;
  voucherAmount: number;
  voucherDiscount: number;
  roundingAmount: number;
  shippingFee: number;
  grandTotal: number;
  tip: number;
  refund: number;
  totalDiscount: number;
  netAmount: number;

  orderType: string | null;
  paymentType: string | null;
  paymentMethod: string | null;
  channel: string | null;
  tableNo: string | null;
  customerCount: number | null;
  customerName: string | null;
  note: string | null;
  promotionType: string | null;
  promotionCode: string | null;
  openedBy: string | null;
  closedBy: string | null;
  branch: string | null;
  lineManAdjustDate: string | null;
  lineManAdjustAmt: number;
};

export type ParseError = { row: number; message: string };

export type ParseResult = {
  rows: ParsedBill[];
  errors: ParseError[];
  totalDataRows: number;
};

/** Cell value normalizer — '-' / null / '' → 0 for numbers */
function num(v: unknown): number {
  if (v == null || v === "" || v === "-") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[,\s]/g, "");
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

function int(v: unknown): number | null {
  const n = num(v);
  if (n === 0 && (v == null || v === "" || v === "-")) return null;
  return Math.round(n);
}

/** Parse date+time → Date. Foodstory uses DD/MM/YYYY + HH:mm
 *  Excel serial numbers also supported (when cells are typed as date).
 */
function parsePaidAt(dateCell: unknown, timeCell: unknown): Date | null {
  if (dateCell == null || dateCell === "") return null;

  // Excel serial date number
  if (typeof dateCell === "number") {
    const d = XLSX.SSF.parse_date_code(dateCell);
    if (!d) return null;
    return parseTimeOnto(
      new Date(Date.UTC(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0)),
      timeCell
    );
  }

  const ds = String(dateCell).trim();

  // DD/MM/YYYY
  let m = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return parseTimeOnto(
      new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))),
      timeCell
    );
  }
  // YYYY-MM-DD
  m = ds.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return parseTimeOnto(
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
      timeCell
    );
  }
  return null;
}

function parseTimeOnto(d: Date, timeCell: unknown): Date {
  if (timeCell == null || timeCell === "") return d;

  // Excel time as fraction of day
  if (typeof timeCell === "number" && timeCell < 1) {
    const totalSec = Math.round(timeCell * 86400);
    d.setUTCHours(
      Math.floor(totalSec / 3600),
      Math.floor((totalSec % 3600) / 60),
      totalSec % 60
    );
    return d;
  }

  const ts = String(timeCell).trim();
  const m = ts.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    d.setUTCHours(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0);
  }
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Exact header → field key map. NO substring fallback — Foodstory headers like
 *  "ยอดสินค้ามีภาษี" / "ยอดก่อนภาษี" / "ภาษี" all contain "ภาษี" and would collide.
 */
const HEADER_MAP: Record<string, keyof ParsedBill | "_skip"> = {
  วันที่ชำระเงิน: "paymentDate",
  เวลาที่ชำระเงิน: "_skip",
  เวลา: "_skip",
  "หมายเลขใบเสร็จ / ID": "id",
  หมายเลขใบเสร็จ: "id",
  "POS ID": "posId",
  "INV. No": "invoiceNo",
  ยอดก่อนลด: "grossAmount",
  ส่วนลดสินค้า: "itemDiscount",
  ส่วนลดบิล: "billDiscount",
  ยอดรวม: "totalAmount",
  ค่าบริการ: "serviceCharge",
  ยอดสินค้าไม่มีภาษี: "_skip",
  ยอดสินค้ามีภาษี: "_skip",
  ยอดก่อนภาษี: "_skip",
  ภาษี: "vatAmount",
  "มูลค่า Voucher": "voucherAmount",
  "ส่วนลด Voucher": "voucherDiscount",
  ยอดปัดเศษ: "roundingAmount",
  ค่าจัดส่ง: "shippingFee",
  รวมสุทธิ: "grandTotal",
  ทิป: "tip",
  คืนเงิน: "refund",
  ประเภทการสั่ง: "orderType",
  รหัสถาดเก็บเงิน: "_skip",
  ประเภทการชำระเงิน: "paymentType",
  วิธีบันทึกรายการชำระ: "paymentMethod",
  รหัสชำระเงินแบบกำหนดเอง: "_skip",
  ช่องทาง: "channel",
  โต๊ะ: "tableNo",
  จำนวนลูกค้า: "customerCount",
  ชื่อลูกค้า: "customerName",
  หมายเหตุ: "note",
  ประเภทโปรโมชั่น: "promotionType",
  โปรโมชั่นโค้ด: "promotionCode",
  เปิดบิลโดย: "openedBy",
  ปิดบิลโดย: "closedBy",
  สาขา: "branch",
  "LINE MAN วันที่ปรับยอด": "lineManAdjustDate",
  "LINE MAN ยอดปรับยอด": "lineManAdjustAmt",
};

/** Find the data start row.
 *  Foodstory exports often have title rows at top — header row is usually row 1 or 3.
 *  We scan for the row that contains "วันที่ชำระเงิน" + "หมายเลขใบเสร็จ".
 */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] ?? [];
    const joined = r.map((c) => String(c ?? "")).join("|");
    if (
      joined.includes("วันที่ชำระเงิน") &&
      joined.includes("หมายเลขใบเสร็จ")
    ) {
      return i;
    }
  }
  return -1;
}

export function parseFoodstoryBuffer(buf: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      errors: [{ row: 0, message: "ไม่พบ sheet ในไฟล์" }],
      totalDataRows: 0,
    };
  }
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerRow = findHeaderRow(raw);
  if (headerRow < 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message:
            "ไม่พบ header row — ต้องมีคอลัมน์ 'วันที่ชำระเงิน' และ 'หมายเลขใบเสร็จ'",
        },
      ],
      totalDataRows: 0,
    };
  }

  const headers = (raw[headerRow] ?? []).map((c) => String(c ?? "").trim());

  // Build column index → field key
  const colToField = new Map<number, keyof ParsedBill | "_skip">();
  const paidTimeColIndex = headers.findIndex((h) =>
    h.includes("เวลาที่ชำระเงิน")
  );

  // Canonical keys sorted by length DESC so longer/more specific names win first.
  // Foodstory sometimes appends formula descriptions to headers like:
  //   "รวมสุทธิ (ยอดก่อนภาษี + ภาษี + ยอดปัดเศษ) - ยอดขายสินค้าไม่มีภาษี"
  // We match these via prefix lookup. Sorting by length avoids collisions where
  // "ยอดสินค้ามีภาษี" / "ยอดก่อนภาษี" would otherwise be eclipsed by "ยอดรวม".
  const SORTED_KEYS = Object.keys(HEADER_MAP).sort(
    (a, b) => b.length - a.length
  );

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    // 1) Exact match first
    let field = HEADER_MAP[h];
    if (!field) {
      // 2) Longest-prefix match — "ยอดรวม ยอดก่อนลด - ..." → "ยอดรวม"
      for (const key of SORTED_KEYS) {
        if (h === key || h.startsWith(key + " ") || h.startsWith(key + "(")) {
          field = HEADER_MAP[key];
          break;
        }
      }
    }
    if (field) colToField.set(i, field);
  }

  const rows: ParsedBill[] = [];
  const errors: ParseError[] = [];
  const seenIds = new Set<string>();

  for (let i = headerRow + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every((c) => c == null || c === "")) continue;

    const get = (field: keyof ParsedBill): unknown => {
      for (const [col, f] of colToField) if (f === field) return r[col];
      return null;
    };

    const idRaw = get("id");
    const id = str(idRaw);
    const paymentDateRaw = get("paymentDate");

    if (!id) {
      // Skip rows without an ID (likely subtotals/blanks)
      continue;
    }

    const paidAt = parsePaidAt(
      paymentDateRaw,
      paidTimeColIndex >= 0 ? r[paidTimeColIndex] : null
    );
    if (!paidAt) {
      errors.push({
        row: i + 1,
        message: `แถวที่ ${i + 1}: รูปแบบวันที่ไม่ถูกต้อง (${paymentDateRaw})`,
      });
      continue;
    }

    if (seenIds.has(id)) {
      // duplicate within same file — keep first, skip later
      errors.push({
        row: i + 1,
        message: `แถวที่ ${i + 1}: เลขบิลซ้ำในไฟล์เดียวกัน (${id})`,
      });
      continue;
    }
    seenIds.add(id);

    const itemDiscount = num(get("itemDiscount"));
    const billDiscount = num(get("billDiscount"));
    const voucherDiscount = num(get("voucherDiscount"));
    const grandTotal = num(get("grandTotal"));
    const totalAmount = num(get("totalAmount"));

    rows.push({
      id,
      paidAt,
      paymentDate: toIsoDate(paidAt),
      posId: str(get("posId")),
      invoiceNo: str(get("invoiceNo")),
      grossAmount: num(get("grossAmount")),
      itemDiscount,
      billDiscount,
      totalAmount,
      serviceCharge: num(get("serviceCharge")),
      vatAmount: num(get("vatAmount")),
      voucherAmount: num(get("voucherAmount")),
      voucherDiscount,
      roundingAmount: num(get("roundingAmount")),
      shippingFee: num(get("shippingFee")),
      grandTotal,
      tip: num(get("tip")),
      refund: num(get("refund")),
      totalDiscount: itemDiscount + billDiscount + voucherDiscount,
      // Net = totalAmount (after discounts, before VAT/service) — same as Excel "💰 ยอดสุทธิ"
      netAmount: totalAmount,
      orderType: str(get("orderType")),
      paymentType: str(get("paymentType")),
      paymentMethod: str(get("paymentMethod")),
      channel: str(get("channel")),
      tableNo: str(get("tableNo")),
      customerCount: int(get("customerCount")),
      customerName: str(get("customerName")),
      note: str(get("note")),
      promotionType: str(get("promotionType")),
      promotionCode: str(get("promotionCode")),
      openedBy: str(get("openedBy")),
      closedBy: str(get("closedBy")),
      branch: str(get("branch")),
      lineManAdjustDate: str(get("lineManAdjustDate")),
      lineManAdjustAmt: num(get("lineManAdjustAmt")),
    });
  }

  return { rows, errors, totalDataRows: rows.length + errors.length };
}
