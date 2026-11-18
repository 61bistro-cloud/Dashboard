/** A manual annotation is separate from imported notes and evidence audit lines. */
const MARKER = "BANK_REMARK_V1:";
const internal =
  /^(?:BANK_REMARK_V1:|EVIDENCE_(?:OCR|AUTO)_V1:|DOCUMENT_REVIEW_V1:|DOCUMENT_(?:CONTENT|QR)_SHA256:)/;
export function transactionRemark(note: string | null | undefined): string {
  const lines = (note ?? "").split("\n");
  for (const line of [...lines].reverse()) {
    if (!line.startsWith(MARKER)) continue;
    try {
      const value = JSON.parse(line.slice(MARKER.length));
      if (typeof value.text === "string") return value.text;
    } catch {
      /* Fall back to readable legacy notes. */
    }
  }
  return lines
    .filter((line) => !internal.test(line))
    .map((line) => line.replace(/^หลักฐาน #\d+ · Remark: /, ""))
    .join("\n")
    .trim();
}
export function withTransactionRemark(
  note: string | null,
  text: string
): string {
  const retained = (note ?? "")
    .split("\n")
    .filter((line) => !line.startsWith(MARKER))
    .join("\n")
    .trimEnd();
  return [
    retained,
    MARKER + JSON.stringify({ text: text.replace(/\r\n?/g, "\n").trim() }),
  ]
    .filter(Boolean)
    .join("\n");
}
