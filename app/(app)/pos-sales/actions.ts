"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseFoodstoryBuffer, type ParsedBill } from "@/lib/foodstory-parser";
import { revalidatePath } from "next/cache";

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
  if (!session) {
    return baseError("unauthorized");
  }

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

  // Check existing IDs in one query
  const ids = parseResult.rows.map((r) => r.id);
  const existing = new Set(
    (
      await prisma.posBill.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      })
    ).map((b) => b.id)
  );

  let inserted = 0;
  let updated = 0;

  // Create batch first so we can FK each bill to it
  const batch = await prisma.posImportBatch.create({
    data: {
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

  // Bulk upsert in chunks to keep transaction size small
  const CHUNK = 100;
  for (let i = 0; i < parseResult.rows.length; i += CHUNK) {
    const chunk = parseResult.rows.slice(i, i + CHUNK);
    await prisma.$transaction(chunk.map((r) => upsertOp(r, batch.id)));
    for (const r of chunk) {
      if (existing.has(r.id)) updated++;
      else inserted++;
    }
  }

  await prisma.posImportBatch.update({
    where: { id: batch.id },
    data: { rowsInserted: inserted, rowsUpdated: updated },
  });

  revalidatePath("/pos-sales");

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

function upsertOp(r: ParsedBill, batchId: number) {
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
  return prisma.posBill.upsert({
    where: { id: r.id },
    update: data,
    create: { id: r.id, ...data },
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

  const batch = await prisma.posImportBatch.findUnique({
    where: { id: input.id },
  });
  if (!batch) {
    return { ok: false, message: "ไม่พบ batch นี้" };
  }

  // Delete all bills linked to this batch, then the batch itself
  const result = await prisma.$transaction([
    prisma.posBill.deleteMany({ where: { importBatchId: input.id } }),
    prisma.posImportBatch.delete({ where: { id: input.id } }),
  ]);

  revalidatePath("/pos-sales");

  return { ok: true, deletedBills: result[0].count };
}
