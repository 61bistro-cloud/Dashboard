import { z } from "zod";
import { extractEvidenceFields, type EvidenceOcr } from "./evidence-match";
export const DOCUMENT_GROUPS = [
  "raw",
  "condiments",
  "beverage",
  "packaging",
  "freight",
  "labor",
  "selling",
  "occupancy",
  "admin",
  "owner_capital",
  "transfer",
  "sales",
  "unknown",
] as const;
export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];
export const DOCUMENT_GROUP_LABELS: Record<DocumentGroup, string> = {
  raw: "ต้นทุนวัตถุดิบหลัก",
  condiments: "เครื่องปรุงและของแห้ง",
  beverage: "ต้นทุนเครื่องดื่ม",
  packaging: "ต้นทุนบรรจุภัณฑ์",
  freight: "ค่าขนส่งวัตถุดิบเข้า",
  labor: "ค่าใช้จ่ายเกี่ยวกับพนักงาน",
  selling: "ค่าใช้จ่ายในการขายและการตลาด",
  occupancy: "ค่าใช้จ่ายสถานที่และสาธารณูปโภค",
  admin: "ค่าใช้จ่ายบริหารและเบ็ดเตล็ด",
  owner_capital: "เงินทุนจากเจ้าของ",
  transfer: "โอนระหว่างบัญชี",
  sales: "รายได้จากการขาย",
  unknown: "ยังระบุหมวดไม่ได้",
};
export type DocumentReview = {
  version: 1;
  state: "queued" | "processing" | "review" | "failed";
  checkedAt: string;
  attempts: number;
  retryAfter?: string;
  ai:
    | "pending"
    | "rules"
    | "not_configured"
    | "not_enabled"
    | "complete"
    | "unavailable"
    | "invalid";
  kind: "slip" | "receipt" | "other" | "unknown";
  group: DocumentGroup;
  amount: number | null;
  date: string | null;
  remark: string | null;
  merchant: string | null;
  reference: string | null;
  quotes: Record<string, string>;
  flags: string[];
  duplicateIds: number[];
  model?: string;
  sourceHash?: string;
};
const storedReviewSchema = z.object({
  version: z.literal(1),
  state: z.enum(["queued", "processing", "review", "failed"]),
  checkedAt: z.string().datetime(),
  attempts: z.number().int().min(0).max(100000),
  retryAfter: z.string().datetime().optional(),
  ai: z.enum([
    "pending",
    "rules",
    "not_configured",
    "not_enabled",
    "complete",
    "unavailable",
    "invalid",
  ]),
  kind: z.enum(["slip", "receipt", "other", "unknown"]),
  group: z.enum(DOCUMENT_GROUPS),
  amount: z.number().finite().nonnegative().nullable(),
  date: z.string().max(20).nullable(),
  remark: z.string().max(1000).nullable(),
  merchant: z.string().max(500).nullable(),
  reference: z.string().max(500).nullable(),
  quotes: z.record(z.string(), z.string().max(400)),
  flags: z.array(z.string().max(80)).max(50),
  duplicateIds: z.array(z.number().int().positive()).max(200),
  model: z.string().max(200).optional(),
  sourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
const marker = "DOCUMENT_REVIEW_V1:";
export function readDocumentReview(note: string | null): DocumentReview | null {
  try {
    const line = note?.split("\n").findLast((l) => l.startsWith(marker));
    if (!line) return null;
    const p = JSON.parse(line.slice(marker.length));
    const parsed = storedReviewSchema.safeParse(p);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function writeDocumentReview(
  note: string | null,
  review: DocumentReview
) {
  return (
    (note ?? "")
      .split("\n")
      .filter((l) => !l.startsWith(marker))
      .join("\n")
      .trimEnd() +
    "\n" +
    marker +
    JSON.stringify(review)
  );
}
export function queuedReview(): DocumentReview {
  return {
    version: 1,
    state: "queued",
    checkedAt: new Date().toISOString(),
    attempts: 0,
    ai: "pending",
    kind: "unknown",
    group: "unknown",
    amount: null,
    date: null,
    remark: null,
    merchant: null,
    reference: null,
    quotes: {},
    flags: [],
    duplicateIds: [],
  };
}
export function redactDocumentText(text: string) {
  return text
    .slice(0, 16000)
    .split("\n")
    .map((line) => {
      if (
        /บัญชี|account|ผู้โอน|ผู้รับ|sender|recipient|เบอร์โทร|โทรศัพท์|phone|เลขประจำตัวผู้เสียภาษี|tax.?id/i.test(
          line
        ) &&
        !/(?:ref(?:erence)?|เลขอ้างอิง|รหัสรายการ)/i.test(line)
      )
        return "[REDACTED PERSONAL/ACCOUNT LINE]";
      return line
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[EMAIL]")
        .replace(/\b0[689]\d[- ]?\d{3}[- ]?\d{4}\b/g, "[PHONE]")
        .replace(/\b\d{3}[- ]\d[- ]\d{5}[- ]\d\b/g, "[ACCOUNT]")
        .replace(/\b\d{13}\b/g, "[IDENTIFIER]");
    })
    .join("\n")
    .slice(0, 8000);
}
const normalize = (s: string) =>
  s
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 3664))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const textField = z
  .object({
    value: z.string().trim().min(1).max(500),
    quote: z.string().trim().min(1).max(400),
  })
  .strict()
  .nullable();
export const aiDocumentSchema = z
  .object({
    kind: z.enum(["slip", "receipt", "other", "unknown"]),
    amount: z
      .object({
        value: z.number().finite().nonnegative().max(99_999_999),
        quote: z.string().min(1).max(400),
      })
      .strict()
      .nullable(),
    date: textField,
    merchant: textField,
    reference: textField,
    remark: textField,
    category: z
      .object({
        group: z.enum(DOCUMENT_GROUPS),
        quote: z.string().min(1).max(400),
      })
      .strict()
      .nullable(),
  })
  .strict();
export function groundedAiResult(raw: unknown, text: string) {
  const p = aiDocumentSchema.safeParse(raw);
  if (!p.success) return null;
  const data = p.data,
    source = normalize(text),
    quotes: Record<string, string> = {},
    flags: string[] = [];
  const quoted = (key: string, quote: string) => {
    if (!source.includes(normalize(quote))) {
      flags.push("unsupported_" + key);
      return false;
    }
    quotes[key] = quote;
    return true;
  };
  let amount: number | null = null,
    date: string | null = null;
  if (data.amount && quoted("amount", data.amount.quote)) {
    const quote = normalize(data.amount.quote);
    const nums = (quote.match(/\d[\d,]*(?:\.\d{1,2})?/g) ?? []).map((s) =>
      Number(s.replace(/,/g, ""))
    );
    if (
      /amount|total|รวม|จำนวนเงิน|ยอด|บาท|thb/i.test(quote) &&
      nums.some(
        (n) => Math.round(n * 100) === Math.round(data.amount!.value * 100)
      )
    )
      amount = data.amount.value;
    else flags.push("unsupported_amount");
  }
  if (
    data.date &&
    quoted("date", data.date.quote) &&
    extractEvidenceFields(data.date.quote).date === data.date.value
  )
    date = data.date.value;
  else if (data.date) flags.push("unsupported_date");
  const literal = (key: "merchant" | "reference" | "remark") => {
    const f = data[key];
    return f &&
      quoted(key, f.quote) &&
      normalize(f.quote).includes(normalize(f.value))
      ? f.value
      : null;
  };
  let group: DocumentGroup = "unknown";
  if (data.category && quoted("category", data.category.quote))
    group = data.category.group;
  if (
    group === "owner_capital" &&
    !/เพิ่มทุน|เงินทุน|เติมเงิน.*ร้าน|เพิ่มเงินบริหาร|owner.?s? capital/i.test(
      data.category?.quote ?? ""
    )
  )
    group = "unknown";
  if (
    group === "transfer" &&
    !/โอนระหว่างบัญชี|บัญชีตัวเอง|internal transfer|own account/i.test(
      data.category?.quote ?? ""
    )
  )
    group = "unknown";
  return {
    kind: data.kind,
    amount,
    date,
    merchant: literal("merchant"),
    reference: literal("reference"),
    remark: literal("remark"),
    group,
    quotes,
    flags,
  };
}
export function ruleDocumentReview(ocr: EvidenceOcr): DocumentReview {
  const r: DocumentReview = {
    ...queuedReview(),
    state: "review",
    ai: "rules",
    amount: ocr.amount,
    date: ocr.date,
    remark: ocr.remark,
  };
  const text = ocr.text;
  const slip =
    /โอนเงิน|โอนสำเร็จ|transfer.*(?:success|amount)|สลิป|ผู้โอน|ผู้รับโอน/i.test(
      text
    );
  const receipt = /ใบเสร็จ|ใบกำกับภาษี|receipt|tax invoice/i.test(text);
  r.kind = slip && !receipt ? "slip" : receipt && !slip ? "receipt" : "unknown";
  const rules: [RegExp, DocumentGroup][] = [
    [
      /เพิ่มทุน|เงินทุน|เพิ่มเงินบริหาร|เติมเงิน.*ร้าน|owner.?s? capital/i,
      "owner_capital",
    ],
    [/โอนระหว่างบัญชี|บัญชีตัวเอง|internal transfer/i, "transfer"],
    [/กล่องอาหาร|ถุงพลาสติก|บรรจุภัณฑ์|packaging/i, "packaging"],
    [/ค่าเช่า|ค่าไฟ|ค่าน้ำประปา|แก๊ส|internet/i, "occupancy"],
    [/เงินเดือน|ค่าจ้าง|ค่าแรง|ประกันสังคม|salary|payroll/i, "labor"],
  ];
  const relevant = rules.filter(([pattern]) =>
    pattern.test(ocr.remark ?? text)
  );
  if (relevant.length === 1) {
    r.group = relevant[0][1];
    r.quotes.category = (
      ocr.remark ??
      text.split("\n").find((l) => relevant[0][0].test(l)) ??
      ""
    ).slice(0, 400);
  }
  const reference =
    text.match(
      /(?:เลข(?:ที่)?อ้างอิง|รหัสรายการ|reference(?:\s*(?:no\.?|id))?|transaction\s*id)\s*[:：#]?\s*([A-Z0-9][A-Z0-9-]{5,79})/i
    )?.[1] ?? null;
  r.reference = reference;
  if (r.amount === null) r.flags.push("missing_amount");
  if (!r.date) r.flags.push("missing_date");
  if (r.group === "unknown") r.flags.push("unclear_category");
  r.flags.push("human_confirmation_required", "business_relevance_unverified");
  return r;
}
