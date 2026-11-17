"use server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/business";
import { revalidatePath } from "next/cache";
import { ACCOUNT_OPTIONS, type AccountKind } from "@/lib/bank-account-options";

async function access(businessId: number) {
  const session = await auth();
  if (!session || !["OWNER", "ACCOUNTANT"].includes(session.user.role))
    throw Error("ไม่มีสิทธิ์");
  const business = await requireBusiness();
  if (business.id !== businessId)
    throw Error("ธุรกิจเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า");
  return business;
}
function refresh() {
  for (const path of [
    "/bank",
    "/bank/evidence",
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
const scopeSchema = z.object({
  businessId: z.number().int().positive(),
  id: z.number().int().positive(),
});
async function deletionState(
  tx: Prisma.TransactionClient,
  businessId: number,
  id: number
) {
  const account = await tx.bankAccount.findFirst({ where: { id, businessId } });
  if (!account) throw Error("ไม่พบบัญชีนี้ในธุรกิจปัจจุบัน");
  const foreign = { accountId: id, businessId: { not: businessId } };
  if (
    (await tx.bankTransaction.count({ where: foreign })) ||
    (await tx.accountOpening.count({ where: foreign }))
  )
    throw Error("ข้อมูลบัญชีไม่สอดคล้องกัน กรุณาติดต่อผู้ดูแลก่อนลบ");
  const where = { businessId, accountId: id };
  const transactions = await tx.bankTransaction.findMany({
    where,
    orderBy: { id: "asc" },
  });
  const openings = await tx.accountOpening.findMany({
    where,
    orderBy: { id: "asc" },
  });
  const files = transactions.length
    ? await tx.driveFile.findMany({
        where: {
          businessId,
          refType: "BANK_TX",
          refId: { in: transactions.map((t) => String(t.id)) },
        },
        orderBy: { id: "asc" },
        select: { id: true, refId: true, note: true },
      })
    : [];
  const months = [
    ...new Set([
      ...transactions.map((t) => t.fiscalMonthId),
      ...openings.map((o) => o.fiscalMonthId),
    ]),
  ];
  const closed = months.length
    ? await tx.monthlyClosing.count({
        where: { businessId, fiscalMonthId: { in: months }, status: "CLOSED" },
      })
    : 0;
  const token = createHash("sha256")
    .update(JSON.stringify({ account, transactions, openings, files, closed }))
    .digest("hex");
  return { account, transactions, openings, files, closed, token, months };
}
function message(error: unknown) {
  return error instanceof Error &&
    /ไม่มีสิทธิ์|ธุรกิจเปลี่ยน|ไม่พบบัญชี|รายการเปลี่ยน|เดือนที่ปิดงบ|ข้อมูลบัญชีไม่สอดคล้อง/.test(
      error.message
    )
    ? error.message
    : "ดำเนินการไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่";
}
export async function addBankAccount(input: {
  businessId: number;
  kind: AccountKind;
}) {
  try {
    const data = z
      .object({
        businessId: z.number().int().positive(),
        kind: z.enum([
          "KBANK",
          "SCB",
          "KRUNGSRI",
          "CASH",
          "GRAB",
          "LINEMAN",
          "SHOPEEFOOD",
          "DELIVERY",
        ]),
      })
      .safeParse(input);
    if (!data.success)
      return {
        ok: false as const,
        message: "กรุณาเลือกบัญชีหรือช่องทางที่ระบบรองรับ",
      };
    await access(data.data.businessId);
    const option = ACCOUNT_OPTIONS.find((o) => o.kind === data.data.kind)!;
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.bankAccount.findMany({
          where: { businessId: data.data.businessId },
          select: { code: true, sortOrder: true },
        });
        let suffix = 1;
        while (
          existing.some(
            (a) => a.code === option.kind + (suffix === 1 ? "" : suffix)
          )
        )
          suffix++;
        await tx.bankAccount.create({
          data: {
            businessId: data.data.businessId,
            code: option.kind + (suffix === 1 ? "" : suffix),
            name: option.name + (suffix === 1 ? "" : ` (${suffix})`),
            accountType: "BANK",
            active: true,
            sortOrder: Math.max(0, ...existing.map((a) => a.sortOrder)) + 1,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );
    refresh();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}
export async function previewAccountDeletion(
  input: z.input<typeof scopeSchema>
) {
  try {
    const data = scopeSchema.parse(input);
    await access(data.businessId);
    const state = await prisma.$transaction(
      (tx) => deletionState(tx, data.businessId, data.id),
      { isolationLevel: "RepeatableRead" }
    );
    return {
      ok: true as const,
      name: state.account.name,
      transactions: state.transactions.length,
      openings: state.openings.length,
      evidence: state.files.length,
      months: state.months.length,
      closed: state.closed,
      token: state.token,
    };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}
export async function deleteBankAccount(input: {
  businessId: number;
  id: number;
  password: string;
  token: string;
}) {
  try {
    const data = scopeSchema
      .extend({
        password: z.string().min(1).max(500),
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .safeParse(input);
    if (!data.success)
      return {
        ok: false as const,
        message: "กรุณากรอกรหัสลบและตรวจสอบรายการก่อนยืนยัน",
      };
    const d = data.data;
    await access(d.businessId);
    const expected =
      process.env.DELETE_PASSWORD || process.env.APPROVE_PASSWORD || "Owner123";
    const hash = (s: string) => createHash("sha256").update(s).digest();
    if (!timingSafeEqual(hash(d.password), hash(expected)))
      return { ok: false as const, message: "รหัสลบไม่ถูกต้อง" };
    const deleted = await prisma.$transaction(
      async (tx) => {
        const state = await deletionState(tx, d.businessId, d.id);
        if (state.token !== d.token)
          throw Error("รายการเปลี่ยนไปแล้ว กรุณารีเฟรชหน้าและตรวจสอบใหม่");
        if (state.closed)
          throw Error("บัญชีนี้มีรายการในเดือนที่ปิดงบ กรุณาเปิดงบก่อนลบบัญชี");
        // Preserve original evidence files and OCR for later review, but remove
        // every link and automatic match status pointing to deleted transactions.
        for (const file of state.files)
          await tx.driveFile.update({
            where: { id: file.id },
            data: {
              refType: null,
              refId: null,
              note:
                file.note
                  ?.split("\n")
                  .filter((line) => !line.startsWith("EVIDENCE_AUTO_V1:"))
                  .join("\n")
                  .trim() || null,
            },
          });
        const where = { businessId: d.businessId, accountId: d.id };
        const count = await tx.bankTransaction.deleteMany({ where });
        const openings = await tx.accountOpening.deleteMany({ where });
        if (
          count.count !== state.transactions.length ||
          openings.count !== state.openings.length
        )
          throw Error("รายการเปลี่ยนไปแล้ว กรุณารีเฟรชหน้าและตรวจสอบใหม่");
        await tx.bankAccount.delete({
          where: { id: d.id, businessId: d.businessId },
        });
        return count.count;
      },
      { isolationLevel: "Serializable", timeout: 30_000 }
    );
    refresh();
    return { ok: true as const, deleted };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}
