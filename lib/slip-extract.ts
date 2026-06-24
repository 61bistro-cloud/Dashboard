import Anthropic from "@anthropic-ai/sdk";

/** Structured data we try to read off a Thai bank-transfer slip. */
export type SlipExtract = {
  isSlip: boolean;
  amount: number | null;
  /** YYYY-MM-DD, Gregorian (Buddhist year already converted) */
  date: string | null;
  /** HH:MM 24h */
  time: string | null;
  sender: string | null;
  receiver: string | null;
  bank: string | null;
  ref: string | null;
  confidence: number | null;
  note: string | null;
};

// Default to the most capable model; override with SLIP_VISION_MODEL (e.g.
// "claude-haiku-4-5") to trade a little accuracy for lower cost.
const MODEL = process.env.SLIP_VISION_MODEL || "claude-opus-4-8";

const SUPPORTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type Media = (typeof SUPPORTED)[number];

const SYSTEM = `You read Thai bank money-transfer slips (สลิปโอนเงิน) from banks and wallets such as KBANK (กสิกร), SCB (ไทยพาณิชย์), BBL (กรุงเทพ), KTB (กรุงไทย), BAY (กรุงศรี), TTB, GSB, PromptPay, TrueMoney, ShopeePay, etc.

Return ONLY a single minified JSON object — no markdown fences, no commentary. Shape:
{"isSlip":boolean,"amount":number|null,"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"sender":string|null,"receiver":string|null,"bank":string|null,"ref":string|null,"confidence":number,"note":string|null}

Rules:
- amount: the transferred amount in THB as a plain number (no commas, no ฿). Use the main transfer amount, not any fee.
- date: convert a Thai Buddhist year (พ.ศ.) to the Gregorian year (ค.ศ.) by subtracting 543, then output ISO YYYY-MM-DD. Example: 15 มิ.ย. 2568 -> "2025-06-15".
- time: 24-hour HH:MM, or null if the slip shows none.
- sender / receiver: the account-holder names if shown (Thai or English), else null.
- bank: short name of the SENDING bank or wallet (e.g. "KBANK","SCB","PromptPay","TrueMoney").
- ref: the transaction reference / รหัสอ้างอิง / เลขที่รายการ if present, else null.
- confidence: 0..1, how confident you are this is a genuine transfer slip with a clearly readable amount.
- note: a very short Thai note if something looks off (e.g. blurry amount), else null.
- If the image is not a transfer slip, set isSlip=false and amount=null.`;

function pickMedia(mimeType: string): Media {
  return (SUPPORTED as readonly string[]).includes(mimeType)
    ? (mimeType as Media)
    : "image/jpeg";
}

function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("ไม่พบ JSON ในผลลัพธ์ของ AI");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n =
    typeof v === "string" ? Number(v.replace(/[,\s฿]/g, "")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim());
  if (!m) return null;
  let y = Number(m[1]);
  if (y > 2400) y -= 543; // safety net if the model left it in B.E.
  if (y < 2000 || y > 2100) return null;
  const mo = m[2].padStart(2, "0");
  const d = m[3].padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function normalizeTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const h = Math.min(23, Number(m[1]));
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t.slice(0, 200) : null;
}

/** Read one slip image (raw bytes) and return structured fields. Throws on API/parse error. */
export async function extractSlip(
  base64: string,
  mimeType: string
): Promise<SlipExtract> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: pickMedia(mimeType),
              data: base64,
            },
          },
          {
            type: "text",
            text: "อ่านสลิปนี้แล้วตอบเป็น JSON ตามรูปแบบที่กำหนด",
          },
        ],
      },
    ],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const raw = parseJsonObject(text);
  const conf = toNumberOrNull(raw.confidence);

  return {
    isSlip: raw.isSlip !== false,
    amount: toNumberOrNull(raw.amount),
    date: normalizeDate(raw.date),
    time: normalizeTime(raw.time),
    sender: str(raw.sender),
    receiver: str(raw.receiver),
    bank: str(raw.bank),
    ref: str(raw.ref),
    confidence: conf == null ? null : Math.max(0, Math.min(1, conf)),
    note: str(raw.note),
  };
}
