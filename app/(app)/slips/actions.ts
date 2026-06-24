"use server";

import { createHash } from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/business";
import { extractSlip, type SlipExtract } from "@/lib/slip-extract";
import { findCandidates, pickBest } from "@/lib/slip-match";

const APPROVE_PASSWORD =
  process.env.APPROVE_PASSWORD || process.env.DELETE_PASSWORD || "Owner123";

async function requireAccess() {
  const session = await auth();
  if (!session) throw new Error("unauthorized");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    throw new Error("forbidden");
  }
  return session;
}

function approve(password: string) {
  if (password !== APPROVE_PASSWORD) {
    throw new Error("รหัสอนุมัติไม่ถูกต้อง (ต้องใช้รหัสเจ้าของ)");
  }
}

const moneyOrNull = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
    return Number.isFinite(n) && n > 0 ? n : null;
  });

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const timeStr = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable()
  .optional();

function toTransferAt(date?: string | null, time?: string | null): Date | null {
  if (!date) return null;
  return new Date(`${date}T${time ?? "00:00"}:00Z`);
}

/** Decide the workflow status from extraction + match outcome. */
function decideStatus(
  amount: number | null,
  matchedTxId: number | null
): string {
  if (amount == null) return "FAILED";
  return matchedTxId != null ? "REVIEW" : "UNMATCHED";
}

async function runMatch(
  businessId: number,
  accountId: number | null,
  amount: number | null,
  transferAt: Date | null
) {
  if (amount == null)
    return { matchedTxId: null as number | null, status: "FAILED" };
  const cands = await findCandidates(businessId, {
    accountId,
    amount,
    transferAt,
  });
  const best = pickBest(cands, transferAt);
  return {
    matchedTxId: best.matchedTxId,
    status: decideStatus(amount, best.matchedTxId),
  };
}

export type UploadSlipResult = {
  ok: boolean;
  duplicate?: boolean;
  status?: string;
  aiUsed?: boolean;
  message?: string;
};

/** Upload ONE slip image. Called once per file by the client (keeps each request small + fast). */
export async function uploadSlip(
  formData: FormData
): Promise<UploadSlipResult> {
  try {
    const session = await requireAccess();
    const biz = await requireBusiness();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "ไม่มีไฟล์รูป" };
    }
    if (file.size > 8 * 1024 * 1024) {
      return { ok: false, message: "ไฟล์ใหญ่เกิน 8MB" };
    }
    const rawAccount = formData.get("accountId");
    const accountId = rawAccount ? Number(rawAccount) || null : null;

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(bytes).digest("hex");

    const dup = await prisma.slip.findUnique({
      where: { businessId_contentHash: { businessId: biz.id, contentHash } },
      select: { id: true },
    });
    if (dup)
      return { ok: true, duplicate: true, message: "สลิปนี้อัปโหลดแล้ว" };

    const mimeType =
      file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";

    // ── Read the slip with AI vision (optional — works without a key too) ──
    let ex: SlipExtract | null = null;
    let extractStatus = "PENDING";
    let extractError: string | null = null;
    const aiUsed = !!process.env.ANTHROPIC_API_KEY;
    if (aiUsed) {
      try {
        ex = await extractSlip(bytes.toString("base64"), mimeType);
        extractStatus = "OK";
      } catch (e) {
        extractStatus = "FAILED";
        extractError = ((e as Error).message ?? String(e)).slice(0, 300);
      }
    } else {
      extractStatus = "SKIPPED";
      extractError = "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — กรุณากรอกยอดเอง";
    }

    const amount = ex?.amount ?? null;
    const transferAt = toTransferAt(ex?.date ?? null, ex?.time ?? null);
    const { matchedTxId, status } = await runMatch(
      biz.id,
      accountId,
      amount,
      transferAt
    );

    await prisma.slip.create({
      data: {
        businessId: biz.id,
        imageData: bytes,
        mimeType,
        fileName: file.name ? file.name.slice(0, 200) : null,
        contentHash,
        status,
        extractStatus,
        extractError,
        amount,
        transferAt,
        senderName: ex?.sender ?? null,
        receiverName: ex?.receiver ?? null,
        bankName: ex?.bank ?? null,
        ref: ex?.ref ?? null,
        confidence: ex?.confidence ?? null,
        rawText: ex?.note ?? null,
        accountId,
        matchedTxId,
        uploadedByName: session.user.name || session.user.email || null,
      },
    });

    revalidatePath("/slips");
    return { ok: true, status, aiUsed };
  } catch (e) {
    console.error("[uploadSlip] error:", e);
    return { ok: false, message: (e as Error).message ?? String(e) };
  }
}

const slipScoped = z.object({ slipId: z.coerce.number().int().positive() });

async function getSlipOrThrow(businessId: number, slipId: number) {
  const slip = await prisma.slip.findFirst({
    where: { id: slipId, businessId },
  });
  if (!slip) throw new Error("ไม่พบสลิปนี้ในธุรกิจปัจจุบัน");
  return slip;
}

const saveSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  amount: moneyOrNull,
  date: dateStr,
  time: timeStr,
  accountId: z.union([z.string(), z.number(), z.null()]).transform((v) => {
    if (v == null || v === "" || v === "0") return null;
    return Number(v);
  }),
  note: z.string().max(300).optional().nullable(),
});

/** Save manual edits to a slip and recompute the statement match. No password — nothing is committed yet. */
export async function saveAndRematch(input: z.input<typeof saveSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = saveSchema.parse(input);

  const slip = await getSlipOrThrow(biz.id, data.slipId);
  if (slip.status === "CONFIRMED") {
    throw new Error("สลิปนี้ยืนยันแล้ว — เปิดแก้ไขไม่ได้");
  }

  const transferAt = toTransferAt(data.date ?? null, data.time ?? null);
  const { matchedTxId, status } = await runMatch(
    biz.id,
    data.accountId,
    data.amount,
    transferAt
  );

  await prisma.slip.update({
    where: { id: slip.id },
    data: {
      amount: data.amount,
      transferAt,
      accountId: data.accountId,
      note: data.note || null,
      matchedTxId,
      status,
    },
  });
  revalidatePath("/slips");
  return { ok: true, status, matchedTxId };
}

const confirmSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  password: z.string().min(1),
  matchedTxId: z.union([z.string(), z.number(), z.null()]).transform((v) => {
    if (v == null || v === "" || v === "0") return null;
    return Number(v);
  }),
  categoryId: z.union([z.string(), z.number(), z.null()]).transform((v) => {
    if (v == null || v === "" || v === "0") return null;
    return Number(v);
  }),
  amount: moneyOrNull,
  date: dateStr,
  time: timeStr,
  note: z.string().max(300).optional().nullable(),
});

/** Owner confirms: link the slip to a statement row, set that row's category, freeze it. */
export async function confirmSlip(input: z.input<typeof confirmSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = confirmSchema.parse(input);
  approve(data.password);

  const slip = await getSlipOrThrow(biz.id, data.slipId);

  if (data.matchedTxId == null) {
    throw new Error(
      "ต้องเลือกบรรทัด statement ที่ตรงกันก่อนยืนยัน — ถ้ายังไม่มี ให้นำเข้า statement ในหน้า Bank ก่อน"
    );
  }
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: data.matchedTxId, businessId: biz.id },
    select: { id: true },
  });
  if (!tx) throw new Error("ไม่พบรายการ statement นี้ในธุรกิจปัจจุบัน");

  // Make sure this statement row isn't already claimed by another confirmed slip
  const clash = await prisma.slip.findFirst({
    where: {
      businessId: biz.id,
      status: "CONFIRMED",
      matchedTxId: data.matchedTxId,
      id: { not: slip.id },
    },
    select: { id: true },
  });
  if (clash) {
    throw new Error("บรรทัด statement นี้ถูกผูกกับสลิปอื่นแล้ว");
  }

  if (data.categoryId != null) {
    const cat = await prisma.transactionCategory.findFirst({
      where: { id: data.categoryId, businessId: biz.id },
      select: { id: true },
    });
    if (!cat) throw new Error("ไม่พบหมวดนี้ในธุรกิจปัจจุบัน");
  }

  // The "ลงรายละเอียดบัญชีเบื้องต้น" step: stamp the category onto the statement row.
  await prisma.bankTransaction.update({
    where: { id: tx.id },
    data: { categoryId: data.categoryId },
  });

  const transferAt = data.date
    ? toTransferAt(data.date, data.time ?? null)
    : slip.transferAt;

  await prisma.slip.update({
    where: { id: slip.id },
    data: {
      status: "CONFIRMED",
      matchedTxId: data.matchedTxId,
      suggestedCategoryId: data.categoryId,
      amount: data.amount ?? slip.amount,
      transferAt,
      note: data.note || null,
      confirmedByName: session.user.name || session.user.email || null,
      confirmedAt: new Date(),
    },
  });
  revalidatePath("/slips");
  revalidatePath("/bank");
  return { ok: true };
}

const rejectSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  password: z.string().min(1),
  note: z.string().max(300).optional().nullable(),
});

export async function rejectSlip(input: z.input<typeof rejectSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = rejectSchema.parse(input);
  approve(data.password);

  const slip = await getSlipOrThrow(biz.id, data.slipId);
  await prisma.slip.update({
    where: { id: slip.id },
    data: {
      status: "REJECTED",
      matchedTxId: null,
      note: data.note || null,
      confirmedByName: session.user.name || session.user.email || null,
      confirmedAt: new Date(),
    },
  });
  revalidatePath("/slips");
  return { ok: true };
}

const deleteSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  password: z.string().min(1),
});

export async function deleteSlip(input: z.input<typeof deleteSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = deleteSchema.parse(input);
  approve(data.password);

  await prisma.slip.deleteMany({
    where: { id: data.slipId, businessId: biz.id },
  });
  revalidatePath("/slips");
  return { ok: true };
}

/** Re-run AI vision on an already-uploaded slip (e.g. after setting the API key). */
export async function reExtractSlip(input: z.input<typeof slipScoped>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = slipScoped.parse(input);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — อ่านอัตโนมัติไม่ได้");
  }
  const slip = await getSlipOrThrow(biz.id, data.slipId);
  if (slip.status === "CONFIRMED") throw new Error("สลิปนี้ยืนยันแล้ว");

  const base64 = Buffer.from(slip.imageData).toString("base64");
  const ex = await extractSlip(base64, slip.mimeType);
  const amount = ex.amount;
  const transferAt = toTransferAt(ex.date, ex.time);
  const { matchedTxId, status } = await runMatch(
    biz.id,
    slip.accountId,
    amount,
    transferAt
  );

  await prisma.slip.update({
    where: { id: slip.id },
    data: {
      extractStatus: "OK",
      extractError: null,
      amount,
      transferAt,
      senderName: ex.sender,
      receiverName: ex.receiver,
      bankName: ex.bank,
      ref: ex.ref,
      confidence: ex.confidence,
      rawText: ex.note,
      matchedTxId,
      status,
    },
  });
  revalidatePath("/slips");
  return { ok: true, status };
}
