"use server";

import { mergeConfirmedRemark } from "@/lib/evidence-category";
import { z } from "zod";
import { auth } from "@/auth";
import { requireBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { readEvidenceOcr, writeEvidenceOcr } from "@/lib/evidence-match";

const scopeSchema = z.object({
  businessId: z.number().int().positive(),
  fileId: z.number().int().positive(),
  monthId: z.number().int().positive(),
});
async function scope(input: unknown) {
  const session = await auth();
  if (!session || !["OWNER", "ACCOUNTANT"].includes(session.user.role))
    throw new Error("ไม่มีสิทธิ์จัดการหลักฐาน");
  const data = scopeSchema.parse(input);
  const business = await requireBusiness();
  if (business.id !== data.businessId)
    throw new Error("ธุรกิจเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า");
  const file = await prisma.driveFile.findFirst({
    where: {
      id: data.fileId,
      businessId: business.id,
      fiscalMonthId: data.monthId,
      kind: { in: ["SLIP", "BILL"] },
    },
  });
  if (!file) throw new Error("ไม่พบหลักฐานในธุรกิจและเดือนที่เลือก");
  return { data, file, business };
}
function refresh() {
  for (const path of [
    "/bank",
    "/bank/evidence",
    "/admin/google",
    "/cost-setup",
    "/",
    "/daily-pl",
    "/monthly-pl",
    "/daily-recon",
    "/closing",
    "/closing-print",
  ])
    revalidatePath(path);
}
export async function readEvidence(input: z.infer<typeof scopeSchema>) {
  try {
    const { file, business, data } = await scope(input);
    const cached = readEvidenceOcr(file.note);
    if (cached) return { ok: true as const, fields: cached };
    const { readEvidenceText } = await import("@/lib/google");
    const text = await readEvidenceText(business.id, file.driveFileId);
    if (!text.trim())
      return {
        ok: false as const,
        message: "อ่านตัวอักษรไม่ชัด กรอกยอดและวันที่เองเพื่อหาคู่ได้ครับ",
      };
    const note = writeEvidenceOcr(file.note, text);
    await prisma.driveFile.updateMany({
      where: {
        id: file.id,
        businessId: business.id,
        fiscalMonthId: data.monthId,
      },
      data: { note },
    });
    return { ok: true as const, fields: readEvidenceOcr(note)! };
  } catch {
    return {
      ok: false as const,
      message:
        "อ่านรูปจาก Drive ไม่สำเร็จ ตรวจการเชื่อมต่อ Google หรือกรอกยอดและวันที่เองเพื่อหาคู่",
    };
  }
}
const confirmSchema = scopeSchema.extend({
  transactionId: z.number().int().positive(),
});
export async function confirmEvidenceMatch(
  input: z.infer<typeof confirmSchema>
) {
  try {
    const data = confirmSchema.parse(input);
    const { file, business } = await scope(data);
    if (
      file.refType &&
      (file.refType !== "BANK_TX" || file.refId !== String(data.transactionId))
    )
      return {
        ok: false as const,
        message: "หลักฐานนี้มีคู่เดิมอยู่ กรุณายกเลิกคู่เดิมก่อน",
      };
    const transaction = await prisma.bankTransaction.findFirst({
      where: {
        id: data.transactionId,
        businessId: business.id,
        fiscalMonthId: data.monthId,
      },
      select: { id: true },
    });
    if (!transaction)
      return {
        ok: false as const,
        message: "ไม่พบรายการธนาคารในธุรกิจและเดือนนี้ กรุณารีเฟรชหน้า",
      };
    const updated = await prisma.driveFile.updateMany({
      where: {
        id: file.id,
        businessId: business.id,
        fiscalMonthId: data.monthId,
        OR: [
          { refType: null },
          { refType: "BANK_TX", refId: String(data.transactionId) },
        ],
      },
      data: { refType: "BANK_TX", refId: String(transaction.id) },
    });
    if (!updated.count)
      return {
        ok: false as const,
        message: "คู่หลักฐานเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า",
      };
    refresh();
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      message: "บันทึกคู่ไม่สำเร็จ โปรดตรวจสิทธิ์และธุรกิจที่เลือก",
    };
  }
}
export async function unlinkEvidence(input: z.infer<typeof confirmSchema>) {
  try {
    const data = confirmSchema.parse(input);
    const { file, business } = await scope(data);
    const updated = await prisma.driveFile.updateMany({
      where: {
        id: file.id,
        businessId: business.id,
        fiscalMonthId: data.monthId,
        refType: "BANK_TX",
        refId: String(data.transactionId),
      },
      data: { refType: null, refId: null },
    });
    if (!updated.count)
      return {
        ok: false as const,
        message: "คู่หลักฐานเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า",
      };
    refresh();
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "ยกเลิกคู่ไม่สำเร็จ" };
  }
}

const categorySchema = confirmSchema.extend({
  categoryId: z.number().int().positive().nullable(),
  expectedCategoryId: z.number().int().positive().nullable(),
  remark: z.string().trim().max(1000),
});
/** Only an explicitly confirmed link may change the linked transaction category. */
export async function saveEvidenceCategory(
  input: z.infer<typeof categorySchema>
) {
  try {
    const data = categorySchema.parse(input);
    const { file, business } = await scope(data);
    if (file.refType !== "BANK_TX" || file.refId !== String(data.transactionId))
      return {
        ok: false as const,
        message: "ยืนยันคู่หลักฐานกับรายการนี้ก่อนบันทึกหมวด",
      };
    const transaction = await prisma.bankTransaction.findFirst({
      where: {
        id: data.transactionId,
        businessId: business.id,
        fiscalMonthId: data.monthId,
      },
      select: { id: true, categoryId: true, note: true },
    });
    if (!transaction || transaction.categoryId !== data.expectedCategoryId)
      return {
        ok: false as const,
        message: "รายการหรือหมวดเปลี่ยนไปแล้ว กรุณารีเฟรชและตรวจใหม่",
      };
    if (data.categoryId !== null) {
      const category = await prisma.transactionCategory.findFirst({
        where: {
          id: data.categoryId,
          businessId: business.id,
          ...(data.categoryId === transaction.categoryId
            ? {}
            : { active: true }),
        },
        select: { id: true },
      });
      if (!category)
        return { ok: false as const, message: "ไม่พบหมวดที่เลือกในธุรกิจนี้" };
    }
    const updated = await prisma.bankTransaction.updateMany({
      where: {
        id: transaction.id,
        businessId: business.id,
        fiscalMonthId: data.monthId,
        categoryId: data.expectedCategoryId,
        note: transaction.note,
      },
      data: {
        categoryId: data.categoryId,
        note: mergeConfirmedRemark(transaction.note, file.id, data.remark),
      },
    });
    if (!updated.count)
      return {
        ok: false as const,
        message: "ข้อมูลเปลี่ยนไประหว่างบันทึก กรุณารีเฟรชและตรวจใหม่",
      };
    refresh();
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      message: "บันทึกหมวดไม่สำเร็จ โปรดตรวจสิทธิ์และธุรกิจที่เลือก",
    };
  }
}
