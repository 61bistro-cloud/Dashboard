import { extractEvidenceRemark } from "@/lib/evidence-category";

/** Suggestions only: no expense/transaction is created by matching evidence. */
export type EvidenceFields = {
  amount: number | null;
  date: string | null;
  time: string | null;
};
export type MatchTransaction = {
  id: number;
  date: string;
  description: string;
  deposit: number;
  withdraw: number;
  accountName: string;
  accountId: number;
  categoryId?: number | null;
  categoryName?: string | null;
  note?: string | null;
};
export type EvidenceCandidate = {
  transactionId: number;
  score: number;
  reasons: string[];
};
const MARKER = "\nEVIDENCE_OCR_V1:";
export type EvidenceOcr = EvidenceFields & {
  text: string;
  readAt: string;
  remark: string | null;
};
export function readEvidenceOcr(note: string | null): EvidenceOcr | null {
  if (!note) return null;
  const index = note.lastIndexOf(MARKER);
  if (index < 0) return null;
  try {
    const parsed = JSON.parse(note.slice(index + MARKER.length).split("\n")[0]);
    if (typeof parsed.text !== "string" || typeof parsed.readAt !== "string")
      return null;
    return {
      text: parsed.text,
      readAt: parsed.readAt,
      remark: extractEvidenceRemark(parsed.text),
      ...extractEvidenceFields(parsed.text),
    };
  } catch {
    return null;
  }
}
export function writeEvidenceOcr(note: string | null, text: string): string {
  const original = (note ?? "")
    .split("\n")
    .filter((line) => !line.startsWith("EVIDENCE_OCR_V1:"))
    .join("\n")
    .replace(/\n+$/, "");
  return (
    original +
    MARKER +
    JSON.stringify({
      text: text.slice(0, 16000),
      readAt: new Date().toISOString(),
    })
  );
}
function isoDate(day: string, month: number, year: string): string | null {
  let y = Number(year);
  if (year.length === 2) y += y <= 50 ? 2000 : 2500;
  if (y > 2400) y -= 543;
  const d = Number(day);
  if (y < 2000 || y > 2200 || month < 1 || month > 12 || d < 1 || d > 31)
    return null;
  const date = new Date(Date.UTC(y, month - 1, d));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function extractEvidenceFields(raw: string): EvidenceFields {
  const text = raw.replace(/[๐-๙]/g, (d) =>
    String(d.charCodeAt(0) - "๐".charCodeAt(0))
  );
  let date: string | null = null;
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) date = isoDate(iso[3], Number(iso[2]), iso[1]);
  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!date && numeric)
    date = isoDate(numeric[1], Number(numeric[2]), numeric[3]);
  if (!date) {
    const named = text.match(
      /(\d{1,2})\s+(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{2,4})/i
    );
    if (named) {
      const key = named[2].replace(/\./g, "").toLowerCase();
      const month =
        [
          ["มค", "มกราคม", "jan", "january"],
          ["กพ", "กุมภาพันธ์", "feb", "february"],
          ["มีค", "มีนาคม", "mar", "march"],
          ["เมย", "เมษายน", "apr", "april"],
          ["พค", "พฤษภาคม", "may"],
          ["มิย", "มิถุนายน", "jun", "june"],
          ["กค", "กรกฎาคม", "jul", "july"],
          ["สค", "สิงหาคม", "aug", "august"],
          ["กย", "กันยายน", "sep", "september"],
          ["ตค", "ตุลาคม", "oct", "october"],
          ["พย", "พฤศจิกายน", "nov", "november"],
          ["ธค", "ธันวาคม", "dec", "december"],
        ].findIndex((keys) => keys.includes(key)) + 1;
      date = isoDate(named[1], month, named[3]);
    }
  }
  const clock = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  const time = clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : null;
  const lines = text.split(/\r?\n/);
  const money = (line: string) =>
    Array.from(
      line.matchAll(
        /(?:^|[^\d.,])(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?!\d)/g
      ),
      (m) => Number(m[1].replace(/,/g, ""))
    ).filter((value) => value > 0);
  const labelled: number[] = [];
  const all: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/ค่าธรรมเนียม|fee|ยอดคงเหลือ|balance/i.test(line)) continue;
    all.push(...money(line));
    if (
      /จำนวนเงิน|ยอดโอน|ยอดชำระ|ยอดสุทธิ|รวมทั้งสิ้น|ยอดรวม|total|amount/i.test(
        line
      )
    ) {
      const values = money(line);
      labelled.push(...(values.length ? values : money(lines[i + 1] ?? "")));
    }
  }
  const choices = [...new Set(labelled.length ? labelled : all)];
  return { amount: choices.length === 1 ? choices[0] : null, date, time };
}
export function suggestEvidenceMatches(
  fields: EvidenceFields,
  transactions: MatchTransaction[]
): EvidenceCandidate[] {
  if (fields.amount == null || !fields.date || !(fields.amount > 0)) return [];
  const cents = Math.round(fields.amount * 100);
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return transactions
    .filter(
      (tx) =>
        tx.date.slice(0, 10) === fields.date &&
        (Math.round(tx.withdraw * 100) === cents ||
          Math.round(tx.deposit * 100) === cents)
    )
    .map((tx) => {
      let score = 2;
      const reasons = ["ยอดเงินตรง", "วันที่ตรง"];
      if (fields.time) {
        const delta = Math.abs(
          minutes(tx.date.slice(11, 16)) - minutes(fields.time)
        );
        if (delta <= 5) {
          score += 2;
          reasons.push("เวลาใกล้เคียงไม่เกิน 5 นาที");
        }
      }
      return { transactionId: tx.id, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.transactionId - b.transactionId);
}
