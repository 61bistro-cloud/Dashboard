import { contentFingerprint, qrFingerprint } from "@/lib/document-fingerprint";
import { queuedReview, writeDocumentReview } from "@/lib/document-review";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth } from "@/lib/fiscal-server";
import { uploadEvidence } from "@/lib/google";
import { getLineContent, replyLine, extFromMime } from "@/lib/line";

/** Runs inside Next.js after(): uploads must not delay LINE's acknowledgement. */
export async function processLineEvents(
  biz: { id: number },
  token: string,
  events: LineEvent[]
) {
  const queued: number[] = [];
  const started = Date.now();
  const fm = await getCurrentFiscalMonth();
  const monthFolder = fm
    ? `${fm.calendarYear}-${String(fm.calendarMonth).padStart(2, "0")}`
    : null;

  for (const ev of events) {
    if (ev.type !== "message" || !ev.message) continue;
    const m = ev.message;

    if (m.type === "text") {
      if (ev.replyToken) {
        await replyLine(
          ev.replyToken,
          "ส่งรูป “สลิปโอนเงิน” หรือ “บิลซื้อ” เข้ามาได้เลย ระบบจะเก็บเข้า Google Drive ให้อัตโนมัติ ✅",
          token
        ).catch(() => {});
      }
      continue;
    }

    if (m.type === "image" || m.type === "file") {
      try {
        // dedupe LINE retries (same message id)
        const dup = await prisma.driveFile.findFirst({
          where: {
            businessId: biz.id,
            OR: [
              { name: { startsWith: `LINE-${m.id}.` } },
              { name: { startsWith: `LINE-${m.id}-` } },
            ],
          },
          select: { id: true },
        });
        if (dup) continue;

        const { buffer, mimeType } = await getLineContent(m.id, token);
        const hash = contentFingerprint(buffer);
        const prior = await prisma.driveFile.findFirst({
          where: {
            businessId: biz.id,
            kind: { in: ["SLIP", "BILL"] },
            note: { contains: `DOCUMENT_CONTENT_SHA256:${hash}` },
          },
          select: { id: true },
        });
        if (prior) {
          if (ev.replyToken)
            await replyLine(
              ev.replyToken,
              "ℹ️ เคยรับไฟล์นี้แล้ว ใช้หลักฐานเดิมเพื่อไม่สร้างซ้ำ",
              token
            ).catch(() => {});
          continue;
        }
        const qr = await qrFingerprint(buffer, mimeType);
        const name =
          m.type === "file" && m.fileName
            ? `LINE-${m.id}-${m.fileName}`
            : `LINE-${m.id}.${extFromMime(mimeType)}`;

        const { driveFileId, webViewLink } = await uploadEvidence(
          biz.id,
          "SLIP",
          monthFolder,
          { name, mimeType, buffer }
        );
        const saved = await prisma.driveFile.create({
          data: {
            businessId: biz.id,
            kind: "SLIP",
            fiscalMonthId: fm?.id ?? null,
            driveFileId,
            webViewLink,
            name,
            mimeType,
            uploadedByName: "LINE",
            note: writeDocumentReview(
              `ส่งผ่าน LINE\nDOCUMENT_CONTENT_SHA256:${hash}${qr ? `\nDOCUMENT_QR_SHA256:${qr}` : ""}`,
              queuedReview()
            ),
          },
        });
        if (saved?.id) queued.push(saved.id);
        if (ev.replyToken) {
          await replyLine(
            ev.replyToken,
            "✅ บันทึกหลักฐานเข้าระบบ + Google Drive แล้ว กำลังคัดกรองเอกสาร ข้อมูลบัญชีจะยังไม่เปลี่ยน",
            token
          ).catch(() => {});
        }
      } catch (e) {
        console.error("[line/webhook] evidence storage failed");
        if (ev.replyToken) {
          await replyLine(
            ev.replyToken,
            "⚠️ บันทึกไม่สำเร็จ — ตรวจสอบว่าเชื่อม Google Drive + สร้างโครงสร้างแล้ว",
            token
          ).catch(() => {});
        }
      }
    }
  }
  // Files are durable before OCR/AI starts. Remaining work stays queued for retry.
  if (queued.length) {
    const { processEvidenceDocument } =
      await import("@/lib/document-processing");
    for (const id of queued) {
      if (Date.now() - started > 220000) break;
      await processEvidenceDocument(biz.id, id).catch(() => {});
    }
  }
}

export type LineEvent = {
  type: string;
  replyToken?: string;
  message?: {
    type: string;
    id: string;
    fileName?: string;
  };
};
