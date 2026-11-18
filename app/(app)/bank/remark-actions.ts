"use server";
import { z } from "zod";
import { auth } from "@/auth";
import { requireBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import {
  transactionRemark,
  withTransactionRemark,
} from "@/lib/transaction-remark";
import { transactionRemarkVersion } from "@/lib/transaction-remark-server";
import { revalidatePath } from "next/cache";
const schema = z
  .object({
    businessId: z.number().int().positive(),
    accountId: z.number().int().positive(),
    fiscalMonthId: z.number().int().positive(),
    transactionId: z.number().int().positive(),
    version: z.string().regex(/^[a-f0-9]{64}$/),
    remark: z
      .string()
      .max(2000)
      .transform((s) => s.replace(/\r\n?/g, "\n").trim()),
  })
  .strict();
export async function saveTransactionRemark(input: z.input<typeof schema>) {
  try {
    const session = await auth();
    if (!session || !["OWNER", "ACCOUNTANT"].includes(session.user.role))
      return { ok: false as const, message: "ไม่มีสิทธิ์แก้ไขหมายเหตุ" };
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false as const,
        message: "กรุณาตรวจข้อมูล หมายเหตุยาวได้ไม่เกิน 2,000 ตัวอักษร",
      };
    const data = parsed.data;
    const biz = await requireBusiness();
    if (biz.id !== data.businessId)
      return {
        ok: false as const,
        message: "ธุรกิจเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า",
      };
    const result = await prisma.$transaction(
      async (tx) => {
        const account = await tx.bankAccount.findFirst({
          where: { id: data.accountId, businessId: biz.id },
          select: { id: true },
        });
        if (!account)
          return {
            ok: false as const,
            message: "ไม่พบรายการนี้ในบัญชีและเดือนที่เลือก",
          };
        const where = {
          id: data.transactionId,
          businessId: biz.id,
          accountId: data.accountId,
          fiscalMonthId: data.fiscalMonthId,
        };
        const row = await tx.bankTransaction.findFirst({
          where,
          select: { id: true, note: true },
        });
        if (!row)
          return {
            ok: false as const,
            message: "ไม่พบรายการนี้ในบัญชีและเดือนที่เลือก",
          };
        const closing = await tx.monthlyClosing.findUnique({
          where: {
            businessId_fiscalMonthId: {
              businessId: biz.id,
              fiscalMonthId: data.fiscalMonthId,
            },
          },
          select: { status: true },
        });
        if (closing && closing.status !== "OPEN")
          return {
            ok: false as const,
            message: "เดือนนี้ปิดบัญชีแล้ว กรุณาเปิดบัญชีก่อนแก้ไข",
          };
        if (transactionRemarkVersion(row.note) !== data.version)
          return {
            ok: false as const,
            message: "หมายเหตุเปลี่ยนไปแล้ว กรุณาตรวจข้อความล่าสุดก่อนบันทึก",
            current: {
              remark: transactionRemark(row.note),
              version: transactionRemarkVersion(row.note),
            },
          };
        const note = withTransactionRemark(row.note, data.remark);
        const updated = await tx.bankTransaction.updateMany({
          where: { ...where, note: row.note },
          data: { note },
        });
        if (!updated.count)
          return {
            ok: false as const,
            message: "ข้อมูลเปลี่ยนไประหว่างบันทึก กรุณาลองใหม่",
          };
        return {
          ok: true as const,
          remark: transactionRemark(note),
          version: transactionRemarkVersion(note),
        };
      },
      { isolationLevel: "Serializable", timeout: 15000 }
    );
    if (result.ok) {
      for (const path of ["/bank", "/bank/evidence", "/cost-setup"])
        revalidatePath(path);
    }
    return result;
  } catch {
    return {
      ok: false as const,
      message: "บันทึกหมายเหตุไม่สำเร็จ ข้อความที่แก้ไขยังอยู่ กรุณาลองใหม่",
    };
  }
}
