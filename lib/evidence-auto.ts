import {
  suggestEvidenceMatches,
  type EvidenceOcr,
  type MatchTransaction,
} from "@/lib/evidence-match";
import {
  suggestRemarkCategories,
  type EvidenceCategory,
} from "@/lib/evidence-category";
export type AutoEvidenceStatus = {
  status: "applied" | "review" | "skipped";
  message: string;
  transactionId?: number;
  categoryId?: number;
  checkedAt: string;
};
const MARKER = "\nEVIDENCE_AUTO_V1:";
export function readAutoEvidenceStatus(
  note: string | null
): AutoEvidenceStatus | null {
  const start = note?.lastIndexOf(MARKER) ?? -1;
  if (start < 0) return null;
  try {
    const value = JSON.parse(note!.slice(start + MARKER.length).split("\n")[0]);
    return ["applied", "review", "skipped"].includes(value.status) &&
      typeof value.message === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeAutoEvidenceStatus(
  note: string | null,
  result: Omit<AutoEvidenceStatus, "checkedAt">
): string {
  const original = (note ?? "")
    .split("\n")
    .filter((line) => !line.startsWith("EVIDENCE_AUTO_V1:"))
    .join("\n")
    .replace(/\n+$/, "");
  return (
    original +
    MARKER +
    JSON.stringify({ ...result, checkedAt: new Date().toISOString() })
  );
}
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(
      /(?:ธนาคาร|กสิกรไทย|กรุงศรีอยุธยา|ไทยพาณิชย์|กรุงเทพ|กรุงไทย|kasikornbank|kbank|siamcommercial|scb|bank|ชื่อบัญชี|เลขบัญชี|บัญชี|นางสาว|นาย|นาง|\bmr\b|\bms\b|\bmrs\b)/gi,
      ""
    )
    .replace(/[^\p{L}\p{N}]/gu, "");
function accountTails(text: string): string[] {
  const tokens =
    text.match(/[xX*•]+[\dxX*• -]*\d|\b\d{3}[- ]\d[- ]\d{5}[- ]\d\b/g) ?? [];
  return tokens
    .map((token) =>
      token
        .replace(/[ -]/g, "")
        .match(/\d{4,}$/)?.[0]
        .slice(-4)
    )
    .filter((tail): tail is string => !!tail);
}
function reference(text: string): string | null {
  const found = text.match(
    /(?:เลข(?:ที่รายการ|อ้างอิง)|รหัส(?:อ้างอิง|รายการ)|transaction\s*(?:id|no\.?|number)|reference\s*(?:no\.?|number)?)[ \t:：]*\n?[ \t]*([A-Z0-9-]{8,50})/i
  );
  return found?.[1].replace(/-/g, "").toLowerCase() ?? null;
}
/** Corroborate the relevant counterparty section, never an unrelated payer logo. */
export function corroboratesCounterparty(
  text: string,
  transaction: MatchTransaction
): boolean {
  const outgoing = transaction.withdraw > 0;
  const wanted = outgoing
    ? /^(?:(?:ไปยัง|ผู้รับ(?:เงิน|โอน)?|ชื่อผู้รับ|บัญชีปลายทาง)(?:\s*[:：]|\s|$)|(?:to|recipient|beneficiary)(?:\s*[:：]|\s*$))/i
    : /^(?:(?:จาก|ผู้โอน|ผู้ส่ง|ชื่อผู้โอน|บัญชีต้นทาง)(?:\s*[:：]|\s|$)|(?:from|sender)(?:\s*[:：]|\s*$))/i;
  const stop =
    /^(?:จำนวนเงิน|ค่าธรรมเนียม|วันที่|เวลา|remark|หมายเหตุ|บันทึก|เลขอ้างอิง|รหัสอ้างอิง|amount|fee|reference|transaction)/i;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const description = normalize(transaction.description);
  const bankTails = accountTails(transaction.description);
  for (let i = 0; i < lines.length; i++) {
    if (!wanted.test(lines[i])) continue;
    const section = [lines[i].replace(wanted, "").replace(/^[:：\s]+/, "")];
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      if (
        stop.test(lines[j]) ||
        /^(?:จาก|ไปยัง|ผู้รับ|ผู้โอน|from\b|to\b)/i.test(lines[j])
      )
        break;
      section.push(lines[j]);
    }
    const tails = accountTails(section.join("\n"));
    if (tails.length && bankTails.length) {
      if (tails.some((tail) => bankTails.includes(tail))) return true;
      // A name alone must never override contradictory account digits.
      continue;
    }
    if (
      section.some((line) => {
        const name = normalize(line);
        return (
          name.length >= 8 && /\p{L}/u.test(name) && description.includes(name)
        );
      })
    )
      return true;
  }
  return false;
}
export type AutomationDecision =
  | {
      status: "apply";
      transaction: MatchTransaction;
      categoryId: number;
      remark: string;
    }
  | { status: "review" | "skipped"; message: string };
export function decideEvidenceAutomation(
  ocr: EvidenceOcr,
  transactions: MatchTransaction[],
  categories: EvidenceCategory[],
  linkedId: number | null,
  accountId?: number
): AutomationDecision {
  let transaction: MatchTransaction | undefined;
  if (linkedId !== null) {
    transaction = transactions.find((tx) => tx.id === linkedId);
    if (!transaction)
      return { status: "review", message: "คู่เดิมถูกลบหรืออยู่นอกเดือนนี้" };
  } else {
    const matches = suggestEvidenceMatches(ocr, transactions);
    if (matches.length !== 1)
      return {
        status: "review",
        message:
          matches.length > 1
            ? "พบหลายรายการที่ยอดและวันที่ตรงกัน ต้องตรวจเลือกคู่"
            : "ยังไม่พบคู่ที่ยอดและวันที่ตรงกัน หรืออ่านข้อมูลไม่ครบ",
      };
    transaction = transactions.find(
      (tx) => tx.id === matches[0].transactionId
    )!;
    const ref = reference(ocr.text);
    const sameReference =
      !!ref && normalize(transaction.description).includes(ref);
    if (!sameReference) {
      if (
        !ocr.time ||
        !matches[0].reasons.some((reason) => reason.includes("เวลา"))
      )
        return {
          status: "review",
          message: "ข้อมูลเวลาหรือเลขอ้างอิงยังไม่พอสำหรับยืนยันอัตโนมัติ",
        };
      if (!corroboratesCounterparty(ocr.text, transaction))
        return {
          status: "review",
          message:
            "ยอดและวันตรง แต่ยังยืนยันผู้รับหรือบัญชีจาก Statement ไม่ได้",
        };
    }
  }
  if (accountId !== undefined && transaction.accountId !== accountId)
    return {
      status: "review",
      message:
        "คู่ที่พบอยู่ในบัญชีอื่น ให้เลือกบัญชีที่ถูกต้องหรือตรวจทุกบัญชี",
    };
  if (transaction.withdraw > 0 === transaction.deposit > 0)
    return { status: "review", message: "ทิศทางเงินเข้า / ออกไม่ชัดเจน" };
  if (/หลักฐาน #\d+ · Remark:/.test(transaction.note ?? ""))
    return {
      status: "skipped",
      message: "รายการนี้เคยยืนยันหมวดจากหลักฐานแล้ว จึงคงข้อมูลเดิม",
    };
  const remark = ocr.remark?.trim();
  if (!remark)
    return { status: "review", message: "ไม่พบ Remark ที่ชัดเจนสำหรับจัดหมวด" };
  const suggestions = suggestRemarkCategories(remark, transaction, categories);
  if (suggestions.length !== 1)
    return {
      status: "review",
      message:
        suggestions.length > 1
          ? "Remark อาจอยู่ได้หลายหมวด"
          : "ยังไม่พบหมวดบัญชีที่ตรงกับ Remark",
    };
  const categoryId = suggestions[0].categoryId;
  if (
    transaction.categoryId &&
    transaction.categoryId !== categoryId &&
    !/เบ็ดเตล็ด|ไม่ระบุ|uncategorized/i.test(transaction.categoryName ?? "")
  )
    return {
      status: "review",
      message: "หมวดเดิมต่างจากหมวดที่แนะนำ จึงไม่ทับหมวดเฉพาะที่มีอยู่",
    };
  return { status: "apply", transaction, categoryId, remark };
}
