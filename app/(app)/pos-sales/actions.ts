"use server";

import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseFoodstoryBuffer, type ParsedBill } from "@/lib/foodstory-parser";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/business";

export type ImportResult = {
  ok: boolean;
  fileName?: string;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errored: number;
  errors: string[];
  batchId?: number;
  message?: string;
};

export async function importPosBills(
  formData: FormData
): Promise<ImportResult> {
  const session = await auth();
  if (!session || !["OWNER", "ACCOUNTANT"].includes(session.user.role)) {
    return baseError("unauthorized");
  }

  let biz;
  try {
    biz = await requireBusiness();
  } catch (e) {
    return baseError((e as Error).message);
  }

  if (Number(formData.get("businessId")) !== biz.id)
    return baseError("ธุรกิจเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return baseError("กรุณาเลือกไฟล์ก่อน");
  }

  if (file.size > 20 * 1024 * 1024) {
    return baseError("ไฟล์ใหญ่เกิน 20MB");
  }

  let parseResult;
  try {
    const buf = await file.arrayBuffer();
    parseResult = parseFoodstoryBuffer(buf);
  } catch (e) {
    return baseError(`อ่านไฟล์ไม่สำเร็จ: ${(e as Error).message}`);
  }

  if (parseResult.rows.length === 0 && parseResult.errors.length > 0) {
    return {
      ok: false,
      fileName: file.name,
      totalRows: parseResult.totalDataRows,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errored: parseResult.errors.length,
      errors: parseResult.errors.slice(0, 10).map((e) => e.message),
      message: parseResult.errors[0]?.message ?? "ไม่พบข้อมูลในไฟล์",
    };
  }

  let batch: { id: number };
  let inserted = 0;
  let updated = 0;
  try {
    const saved = await prisma.$transaction(
      async (tx) => {
        const ids = parseResult.rows.map((r) => r.id);
        const existing = new Set(
          (
            await tx.posBill.findMany({
              where: { businessId: biz.id, id: { in: ids } },
              select: { id: true },
            })
          ).map((b) => b.id)
        );
        const batch = await tx.posImportBatch.create({
          data: {
            businessId: biz.id,
            fileName: file.name,
            rowsTotal: parseResult.totalDataRows,
            rowsErrored: parseResult.errors.length,
            errorSample:
              parseResult.errors
                .slice(0, 5)
                .map((e) => e.message)
                .join("\n") || null,
            uploadedById: session.user.id,
          },
        });
        // Chunk inside ONE transaction: a failed later chunk cannot leave a partial import.
        for (let i = 0; i < parseResult.rows.length; i += 100) {
          await Promise.all(
            parseResult.rows
              .slice(i, i + 100)
              .map((r) => upsertOp(r, batch.id, biz.id, tx))
          );
        }
        const updated = parseResult.rows.filter((r) =>
          existing.has(r.id)
        ).length;
        const inserted = parseResult.rows.length - updated;
        await tx.posImportBatch.update({
          where: { id: batch.id },
          data: { rowsInserted: inserted, rowsUpdated: updated },
        });
        return { batch, inserted, updated };
      },
      { isolationLevel: "Serializable", timeout: 60_000 }
    );
    ({ batch, inserted, updated } = saved);
  } catch {
    return baseError(
      "นำเข้าไม่สำเร็จ ไม่มีการบันทึกข้อมูลบางส่วน กรุณาลองใหม่"
    );
  }

  for (const path of [
    "/pos-sales",
    "/cost-setup",
    "/",
    "/daily-pl",
    "/monthly-pl",
    "/bank",
    "/daily-recon",
    "/closing",
    "/closing-print",
  ])
    revalidatePath(path);

  return {
    ok: true,
    fileName: file.name,
    totalRows: parseResult.totalDataRows,
    inserted,
    updated,
    skipped: 0,
    errored: parseResult.errors.length,
    errors: parseResult.errors.slice(0, 10).map((e) => e.message),
    batchId: batch.id,
  };
}

function upsertOp(
  r: ParsedBill,
  batchId: number,
  businessId: number,
  db: Prisma.TransactionClient
) {
  const data = {
    paidAt: r.paidAt,
    paymentDate: r.paymentDate,
    businessDate: r.businessDate,
    posId: r.posId,
    invoiceNo: r.invoiceNo,
    grossAmount: r.grossAmount,
    itemDiscount: r.itemDiscount,
    billDiscount: r.billDiscount,
    totalAmount: r.totalAmount,
    serviceCharge: r.serviceCharge,
    vatAmount: r.vatAmount,
    voucherAmount: r.voucherAmount,
    voucherDiscount: r.voucherDiscount,
    roundingAmount: r.roundingAmount,
    shippingFee: r.shippingFee,
    grandTotal: r.grandTotal,
    tip: r.tip,
    refund: r.refund,
    totalDiscount: r.totalDiscount,
    netAmount: r.netAmount,
    orderType: r.orderType,
    paymentType: r.paymentType,
    paymentMethod: r.paymentMethod,
    channel: r.channel,
    tableNo: r.tableNo,
    customerCount: r.customerCount,
    customerName: r.customerName,
    note: r.note,
    promotionType: r.promotionType,
    promotionCode: r.promotionCode,
    openedBy: r.openedBy,
    closedBy: r.closedBy,
    branch: r.branch,
    lineManAdjustDate: r.lineManAdjustDate,
    lineManAdjustAmt: r.lineManAdjustAmt,
    importBatchId: batchId,
  };
  return db.posBill.upsert({
    where: { businessId_id: { businessId, id: r.id } },
    update: data,
    create: { id: r.id, businessId, ...data },
  });
}

function baseError(message: string): ImportResult {
  return {
    ok: false,
    totalRows: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errored: 0,
    errors: [message],
    message,
  };
}

// ───── DELETE BATCH (password-gated) ─────

export type DeleteBatchResult = {
  ok: boolean;
  message?: string;
  deletedBills?: number;
};

/** Password for deleting POS import batches. Override via env DELETE_PASSWORD. */
const DELETE_PASSWORD = process.env.DELETE_PASSWORD || "Owner123";

export async function deletePosBatch(input: {
  id: number;
  password: string;
}): Promise<DeleteBatchResult> {
  const session = await auth();
  if (!session) {
    return { ok: false, message: "ต้อง login ก่อน" };
  }
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    return { ok: false, message: "ไม่มีสิทธิ์ลบ" };
  }
  if (input.password !== DELETE_PASSWORD) {
    return { ok: false, message: "รหัสผ่านไม่ถูกต้อง" };
  }

  let biz;
  try {
    biz = await requireBusiness();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  // Batch must belong to the current business
  const batch = await prisma.posImportBatch.findFirst({
    where: { id: input.id, businessId: biz.id },
  });
  if (!batch) {
    return { ok: false, message: "ไม่พบ batch นี้ในธุรกิจปัจจุบัน" };
  }

  // Delete all bills linked to this batch, then the batch itself
  const result = await prisma.$transaction([
    prisma.posBill.deleteMany({
      where: { importBatchId: input.id, businessId: biz.id },
    }),
    prisma.posImportBatch.delete({ where: { id: input.id } }),
  ]);

  for (const path of [
    "/pos-sales",
    "/cost-setup",
    "/",
    "/daily-pl",
    "/monthly-pl",
    "/bank",
    "/daily-recon",
    "/closing",
    "/closing-print",
  ])
    revalidatePath(path);

  return { ok: true, deletedBills: result[0].count };
}
