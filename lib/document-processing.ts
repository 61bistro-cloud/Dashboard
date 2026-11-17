import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { readEvidenceOcr, writeEvidenceOcr } from "./evidence-match";
import {
  queuedReview,
  readDocumentReview,
  writeDocumentReview,
  ruleDocumentReview,
} from "./document-review";
import { askDocumentAi } from "./openrouter-documents";

/** Durable note-based queue; only evidence metadata is written, never accounting. */
export async function processEvidenceDocument(
  businessId: number,
  fileId: number,
  monthId?: number,
  force = false
) {
  const where = {
    id: fileId,
    businessId,
    kind: { in: ["SLIP", "BILL"] },
    ...(monthId ? { fiscalMonthId: monthId } : {}),
  };
  const file = await prisma.driveFile.findFirst({ where });
  if (!file) throw Error("ไม่พบหลักฐานในธุรกิจและเดือนนี้");
  const previous = readDocumentReview(file.note);
  const now = Date.now();
  if (
    previous?.state === "processing" &&
    now - new Date(previous.checkedAt).getTime() < 120000
  )
    return { busy: true, review: previous };
  const cachedOcr = readEvidenceOcr(file.note);
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  if (
    !force &&
    previous?.state === "review" &&
    cachedOcr &&
    previous.sourceHash === hash(cachedOcr.text) &&
    ["complete", "rules"].includes(previous.ai)
  )
    return { busy: false, review: previous };
  if (!force && previous && previous.attempts >= 3) {
    const manual = {
      ...previous,
      state: "review" as const,
      flags: [
        ...new Set([
          ...previous.flags,
          "ocr_or_processing_failed",
          "human_confirmation_required",
        ]),
      ],
    };
    await prisma.driveFile.updateMany({
      where: { ...where, note: file.note },
      data: { note: writeDocumentReview(file.note, manual) },
    });
    return { busy: false, review: manual };
  }
  if (
    !force &&
    previous?.retryAfter &&
    new Date(previous.retryAfter).getTime() > now
  )
    return { busy: false, review: previous };
  const claimed = {
    ...(previous ?? queuedReview()),
    state: "processing" as const,
    checkedAt: new Date().toISOString(),
    attempts: (previous?.attempts ?? 0) + 1,
  };
  const claimNote = writeDocumentReview(file.note, claimed);
  const claimedRows = await prisma.driveFile.updateMany({
    where: { ...where, note: file.note },
    data: { note: claimNote },
  });
  if (!claimedRows.count)
    throw Error("ข้อมูลหลักฐานเปลี่ยนไปแล้ว กรุณาลองใหม่");
  let note = claimNote;
  try {
    let ocr = cachedOcr;
    if (!ocr) {
      const { readEvidenceText } = await import("./google");
      const text = await readEvidenceText(businessId, file.driveFileId);
      if (!text.trim()) throw Error("empty OCR");
      note = writeEvidenceOcr(note, text);
      ocr = readEvidenceOcr(note);
    }
    if (!ocr) throw Error("empty OCR");
    const result = {
      ...ruleDocumentReview(ocr),
      attempts: claimed.attempts,
      sourceHash: hash(ocr.text),
    };
    if (file.fiscalMonthId && ocr.date) {
      const month = await prisma.fiscalMonth.findUnique({
        where: { id: file.fiscalMonthId },
        select: { calendarYear: true, calendarMonth: true },
      });
      if (
        !month ||
        !ocr.date.startsWith(
          `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-`
        )
      )
        result.flags.push("different_month");
    }
    const clearlyRuled =
      result.kind !== "unknown" &&
      result.group !== "unknown" &&
      !!result.amount &&
      !!result.date &&
      !!result.remark;
    if (!clearlyRuled) {
      const ai = await askDocumentAi(businessId, ocr.text);
      result.ai = ai.status;
      if (ai.status === "complete") {
        const suggestion = ai.result;
        // AI fills suggestions, never changes cached OCR or automatic bank matching fields.
        result.kind = result.kind === "unknown" ? suggestion.kind : result.kind;
        result.group =
          result.group === "unknown" ? suggestion.group : result.group;
        result.amount = ocr.amount ?? suggestion.amount;
        result.date = ocr.date ?? suggestion.date;
        result.remark = ocr.remark ?? suggestion.remark;
        result.merchant = suggestion.merchant;
        result.reference = result.reference ?? suggestion.reference;
        result.quotes = { ...suggestion.quotes, ...result.quotes };
        result.model = ai.model;
        result.flags.push(...suggestion.flags);
        if (
          ocr.amount !== null &&
          suggestion.amount !== null &&
          Math.round(ocr.amount * 100) !== Math.round(suggestion.amount * 100)
        )
          result.flags.push("amount_conflict");
        if (ocr.date && suggestion.date && ocr.date !== suggestion.date)
          result.flags.push("date_conflict");
      } else if (ai.status === "unavailable" || ai.status === "invalid")
        result.retryAfter = new Date(Date.now() + 300000).toISOString();
    }
    if (result.reference) {
      const others = await prisma.driveFile.findMany({
        where: {
          businessId,
          kind: { in: ["SLIP", "BILL"] },
          id: { not: file.id },
          note: { contains: result.reference },
        },
        select: { id: true, note: true },
        take: 100,
      });
      result.duplicateIds = others
        .filter((other) => {
          const reviewed = readDocumentReview(other.note);
          return reviewed?.reference === result.reference;
        })
        .map((other) => other.id);
      if (result.duplicateIds.length)
        result.flags.push("same_payment_reference");
    }
    const qrLine = file.note
      ?.split("\n")
      .find((line) => line.startsWith("DOCUMENT_QR_SHA256:"));
    if (qrLine) {
      const sameQr = await prisma.driveFile.findMany({
        where: {
          businessId,
          kind: { in: ["SLIP", "BILL"] },
          id: { not: file.id },
          note: { contains: qrLine },
        },
        select: { id: true },
        take: 50,
      });
      if (sameQr.length) {
        result.flags.push("same_qr_review");
        result.duplicateIds.push(...sameQr.map((row) => row.id));
      }
    }
    result.duplicateIds = [...new Set(result.duplicateIds)];
    if (
      result.date &&
      file.fiscalMonthId &&
      !result.flags.includes("different_month")
    ) {
      const m = await prisma.fiscalMonth.findUnique({
        where: { id: file.fiscalMonthId },
        select: { calendarYear: true, calendarMonth: true },
      });
      if (
        m &&
        !result.date.startsWith(
          `${m.calendarYear}-${String(m.calendarMonth).padStart(2, "0")}-`
        )
      )
        result.flags.push("different_month");
    }
    result.flags = [...new Set(result.flags)];
    result.checkedAt = new Date().toISOString();
    const saved = await prisma.driveFile.updateMany({
      where: { ...where, note: claimNote },
      data: { note: writeDocumentReview(note, result) },
    });
    if (!saved.count) throw Error("stale evidence");
    return { busy: false, review: result };
  } catch {
    const failed = {
      ...claimed,
      state: claimed.attempts >= 3 ? ("review" as const) : ("failed" as const),
      ai: "unavailable" as const,
      flags: ["ocr_or_processing_failed", "human_confirmation_required"],
      retryAfter: new Date(Date.now() + 60000).toISOString(),
    };
    // Keep an OCR result that was already obtained, and never overwrite a concurrent edit.
    await prisma.driveFile.updateMany({
      where: { ...where, note: claimNote },
      data: { note: writeDocumentReview(note, failed) },
    });
    return { busy: false, review: failed };
  }
}
