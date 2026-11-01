import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth } from "@/lib/fiscal";
import { uploadEvidence } from "@/lib/google";
import { getLineContent, replyLine, extFromMime } from "@/lib/line";

/** Runs inside Next.js after(): uploads must not delay LINE's acknowledgement. */
export async function processLineEvents(
  biz: { id: number },
  token: string,
  events: LineEvent[]
) {
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
          where: { businessId: biz.id, name: { startsWith: `LINE-${m.id}` } },
          select: { id: true },
        });
        if (dup) continue;

        const { buffer, mimeType } = await getLineContent(m.id, token);
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
        await prisma.driveFile.create({
          data: {
            businessId: biz.id,
            kind: "SLIP",
            fiscalMonthId: fm?.id ?? null,
            driveFileId,
            webViewLink,
            name,
            mimeType,
            uploadedByName: "LINE",
            note: "ส่งผ่าน LINE",
          },
        });
        if (ev.replyToken) {
          await replyLine(
            ev.replyToken,
            "✅ บันทึกหลักฐานเข้าระบบ + Google Drive แล้ว",
            token
          ).catch(() => {});
        }
      } catch (e) {
        console.error("[line/webhook]", e);
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
