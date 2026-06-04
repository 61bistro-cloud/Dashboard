"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { parseKbankPdf, suggestCategoryName } from "@/lib/kbank-parser";

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

// ───── PDF STATEMENT IMPORT (KBANK) ─────

export type PreviewTx = {
  /** Index in the parse — used as React key + select identity */
  idx: number;
  date: string; // YYYY-MM-DD
  description: string;
  deposit: number;
  withdraw: number;
  balance: number | null;
  channel: string | null;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
};

export type ParseStatementResult = {
  ok: boolean;
  message?: string;
  needPassword?: boolean;
  wrongPassword?: boolean;
  preview: PreviewTx[];
  rawText?: string;
};

export async function parseStatementPdf(
  formData: FormData
): Promise<ParseStatementResult> {
  try {
    await requireAccess();

    const file = formData.get("file");
    const password = String(formData.get("password") ?? "");

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "กรุณาเลือกไฟล์ PDF ก่อน", preview: [] };
    }
    if (file.size > 20 * 1024 * 1024) {
      return { ok: false, message: "ไฟล์ใหญ่เกิน 20MB", preview: [] };
    }

    let buf: ArrayBuffer;
    try {
      buf = await file.arrayBuffer();
    } catch (e) {
      return {
        ok: false,
        message: `อ่านไฟล์ไม่ได้: ${(e as Error).message}`,
        preview: [],
      };
    }

    const parsed = await parseKbankPdf(buf, password);

    if (!parsed.ok) {
      return {
        ok: false,
        message: parsed.message,
        needPassword: parsed.password === "missing",
        wrongPassword: parsed.password === "wrong",
        preview: [],
        rawText: parsed.rawText.join("\n\n"),
      };
    }

    // Resolve suggested category name → id
    const categories = await prisma.transactionCategory.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    const byName = new Map(categories.map((c) => [c.name, c.id]));

    const preview: PreviewTx[] = parsed.rows.map((r, idx) => {
      const suggestedName = suggestCategoryName(
        r.description,
        r.deposit,
        r.withdraw
      );
      return {
        idx,
        date: r.date,
        description: r.description,
        deposit: r.deposit,
        withdraw: r.withdraw,
        balance: r.balance,
        channel: r.channel,
        suggestedCategoryId: suggestedName
          ? (byName.get(suggestedName) ?? null)
          : null,
        suggestedCategoryName: suggestedName,
      };
    });

    return {
      ok: true,
      preview,
      rawText: parsed.rawText.join("\n\n"),
    };
  } catch (e) {
    // Log the real error to Vercel logs, but return a friendly string so the
    // client never hits the generic "Server Components render" mask.
    console.error("[parseStatementPdf] unexpected error:", e);
    return {
      ok: false,
      message: `เกิดข้อผิดพลาดในการประมวลผล: ${(e as Error).message ?? String(e)}`,
      preview: [],
    };
  }
}

const importStatementSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  accountId: z.coerce.number().int().positive(),
  rows: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      // Real statement rows can be quite long once channel text is included —
      // bumped to 1000 so we never reject a parsed row for length alone.
      description: z.string().min(1).max(1000),
      deposit: moneyField,
      withdraw: moneyField,
      channel: z.string().max(500).optional().nullable().default(""),
      note: z.string().max(500).optional().nullable().default(""),
      categoryId: z.union([z.string(), z.number(), z.null()]).transform((v) => {
        if (v == null || v === "" || v === "0") return null;
        return Number(v);
      }),
    })
  ),
});

export type ImportStatementResult = {
  ok: boolean;
  inserted: number;
  message?: string;
};

export async function importStatementRows(
  input: z.input<typeof importStatementSchema>
): Promise<ImportStatementResult> {
  try {
    const session = await requireAccess();

    // safeParse instead of parse — we want the real Zod error message to
    // surface to the client, not the generic Server Components mask.
    const parsed = importStatementSchema.safeParse(input);
    if (!parsed.success) {
      console.error(
        "[importStatementRows] validation failed:",
        parsed.error.issues
      );
      const first = parsed.error.issues[0];
      const path = first?.path?.join(".") || "input";
      return {
        ok: false,
        inserted: 0,
        message: `ข้อมูลบางช่องไม่ถูกต้อง (${path}): ${first?.message ?? "unknown"}`,
      };
    }
    const data = parsed.data;

    if (data.rows.length === 0) {
      return { ok: false, inserted: 0, message: "ไม่มีรายการให้บันทึก" };
    }

    const result = await prisma.bankTransaction.createMany({
      data: data.rows.map((r) => ({
        fiscalMonthId: data.fiscalMonthId,
        accountId: data.accountId,
        categoryId: r.categoryId,
        date: new Date(r.date + "T00:00:00Z"),
        description: r.description,
        deposit: r.deposit,
        withdraw: r.withdraw,
        channel: r.channel || null,
        note: r.note || null,
        createdById: session.user.id,
      })),
    });

    revalidatePath("/bank");
    return { ok: true, inserted: result.count };
  } catch (e) {
    console.error("[importStatementRows] unexpected error:", e);
    return {
      ok: false,
      inserted: 0,
      message: `บันทึกไม่สำเร็จ: ${(e as Error).message ?? String(e)}`,
    };
  }
}
