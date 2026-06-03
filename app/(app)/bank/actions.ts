"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireAccess() {
  const session = await auth();
  if (!session) throw new Error("unauthorized");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    throw new Error("forbidden");
  }
  return session;
}

const moneyField = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => {
    if (v == null || v === "") return 0;
    const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
    return Number.isFinite(n) ? n : 0;
  })
  .pipe(z.number().min(0).max(99_999_999));

const addTxSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  accountId: z.coerce.number().int().positive(),
  categoryId: z.union([z.string(), z.number(), z.null()]).transform((v) => {
    if (v == null || v === "" || v === "0") return null;
    return Number(v);
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น YYYY-MM-DD"),
  description: z.string().min(1, "ต้องระบุรายการ").max(200),
  deposit: moneyField,
  withdraw: moneyField,
  channel: z.string().max(60).optional().default(""),
  note: z.string().max(200).optional().default(""),
});

export async function addTransaction(input: z.input<typeof addTxSchema>) {
  const session = await requireAccess();
  const data = addTxSchema.parse(input);

  if (data.deposit === 0 && data.withdraw === 0) {
    throw new Error("ต้องระบุยอดฝากหรือถอนอย่างน้อย 1 ฝั่ง");
  }
  if (data.deposit > 0 && data.withdraw > 0) {
    throw new Error("ระบุได้แค่ฝากหรือถอน ไม่ใช่ทั้งสองพร้อมกัน");
  }

  await prisma.bankTransaction.create({
    data: {
      fiscalMonthId: data.fiscalMonthId,
      accountId: data.accountId,
      categoryId: data.categoryId,
      date: new Date(data.date + "T00:00:00Z"),
      description: data.description,
      deposit: data.deposit,
      withdraw: data.withdraw,
      channel: data.channel || null,
      note: data.note || null,
      createdById: session.user.id,
    },
  });

  revalidatePath("/bank");
}

export async function deleteTransaction(id: number) {
  await requireAccess();
  await prisma.bankTransaction.delete({ where: { id } });
  revalidatePath("/bank");
}

const openingSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  accountId: z.coerce.number().int().positive(),
  amount: moneyField,
});

export async function setOpeningBalance(input: z.input<typeof openingSchema>) {
  await requireAccess();
  const data = openingSchema.parse(input);
  if (data.amount === 0) {
    await prisma.accountOpening.deleteMany({
      where: { accountId: data.accountId, fiscalMonthId: data.fiscalMonthId },
    });
  } else {
    await prisma.accountOpening.upsert({
      where: {
        accountId_fiscalMonthId: {
          accountId: data.accountId,
          fiscalMonthId: data.fiscalMonthId,
        },
      },
      update: { amount: data.amount },
      create: data,
    });
  }
  revalidatePath("/bank");
}
