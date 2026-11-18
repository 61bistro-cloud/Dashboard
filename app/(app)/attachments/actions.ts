"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/business";
import { uploadEvidence } from "@/lib/google";

async function requireAccess() {
  const session = await auth();
  if (!session) throw new Error("unauthorized");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    throw new Error("forbidden");
  }
  return session;
}

function gerr(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (/ยังไม่ได้เชื่อม Google/.test(msg)) return msg;
  if (/Sheets API|Drive API/i.test(msg))
    return "ต้องเชื่อม Google Drive + สร้างโครงสร้างก่อน (เมนู เชื่อมต่อ Google / LINE)";
  return `อัปโหลดไม่สำเร็จ: ${msg}`;
}

const REF = z.enum(["BANK_TX", "PURCHASE", "CLOSING", "POS"]);

const REVALIDATE = ["/bank", "/cost-setup", "/closing", "/admin/google"];

/** Attach a file to a specific record → upload to Drive + DriveFile row. */
export async function attachFile(formData: FormData) {
  try {
    const session = await requireAccess();
    const biz = await requireBusiness();

    const refType = REF.parse(formData.get("refType"));
    const refId = String(formData.get("refId") ?? "");
    if (!refId) return { ok: false as const, message: "ไม่พบรายการ" };
    const kind = formData.get("kind") === "BILL" ? "BILL" : "SLIP";
    const fmId = formData.get("fiscalMonthId")
      ? Number(formData.get("fiscalMonthId")) || null
      : null;

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, message: "ไม่มีไฟล์" };
    }
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false as const, message: "ไฟล์ใหญ่เกิน 15MB" };
    }

    const fm = fmId
      ? await prisma.fiscalMonth.findUnique({
          where: { id: fmId },
          select: {
            calendarYear: true,
            calendarMonth: true,
            daysInMonth: true,
          },
        })
      : null;
    if (formData.get("fiscalMonthId") && (!Number.isSafeInteger(fmId) || !fm))
      return { ok: false as const, message: "ไม่พบเดือนที่เลือก" };
    const numericId = Number(refId);
    let owned = false;
    if (refType === "POS") {
      const bill = await prisma.posBill.findFirst({
        where: { id: refId, businessId: biz.id },
        select: { businessDate: true },
      });
      owned =
        !!bill &&
        (!fm ||
          bill.businessDate.startsWith(
            `${fm.calendarYear}-${String(fm.calendarMonth).padStart(2, "0")}-`
          ));
    } else if (
      /^[1-9]\d*$/.test(refId) &&
      Number.isSafeInteger(numericId) &&
      numericId > 0
    ) {
      const where = {
        id: numericId,
        businessId: biz.id,
        ...(fmId ? { fiscalMonthId: fmId } : {}),
      };
      owned = !!(refType === "BANK_TX"
        ? await prisma.bankTransaction.findFirst({
            where,
            select: { id: true },
          })
        : refType === "PURCHASE"
          ? await prisma.supplierPurchase.findFirst({
              where,
              select: { id: true },
            })
          : await prisma.monthlyClosing.findFirst({
              where,
              select: { id: true },
            }));
    }
    if (!owned)
      return {
        ok: false as const,
        message: "ไม่พบรายการในธุรกิจและเดือนที่เลือก",
      };
    const monthFolder = fm
      ? `${fm.calendarYear}-${String(fm.calendarMonth).padStart(2, "0")}`
      : null;

    const mimeType =
      file.type && file.type.length ? file.type : "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const { driveFileId, webViewLink } = await uploadEvidence(
      biz.id,
      kind,
      monthFolder,
      { name: file.name || "file", mimeType, buffer }
    );

    await prisma.driveFile.create({
      data: {
        businessId: biz.id,
        kind,
        refType,
        refId,
        fiscalMonthId: fmId,
        driveFileId,
        webViewLink,
        name: file.name || "file",
        mimeType,
        uploadedByName: session.user.name || session.user.email || null,
      },
    });

    for (const p of REVALIDATE) revalidatePath(p);
    return { ok: true as const, webViewLink };
  } catch (e) {
    console.error("[attachFile]", e);
    return { ok: false as const, message: gerr(e) };
  }
}

export async function removeAttachment(id: number) {
  await requireAccess();
  const biz = await requireBusiness();
  // Unlink the record; the file itself stays in Drive.
  await prisma.driveFile.deleteMany({
    where: { id, businessId: biz.id, kind: { in: ["SLIP", "BILL"] } },
  });
  for (const p of REVALIDATE) revalidatePath(p);
  return { ok: true };
}
