"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { parseKbankPdf, suggestCategoryName } from "@/lib/kbank-parser";
import { requireBusiness } from "@/lib/business";

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
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  description: z.string().min(1, "ต้องระบุรายการ").max(200),
  deposit: moneyField,
  withdraw: moneyField,
  channel: z.string().max(60).optional().default(""),
  note: z.string().max(200).optional().default(""),
});

export async function addTransaction(input: z.input<typeof addTxSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = addTxSchema.parse(input);

  if (data.deposit === 0 && data.withdraw === 0) {
    throw new Error("ต้องระบุยอดฝากหรือถอนอย่างน้อย 1 ฝั่ง");
  }
  if (data.deposit > 0 && data.withdraw > 0) {
    throw new Error("ระบุได้แค่ฝากหรือถอน ไม่ใช่ทั้งสองพร้อมกัน");
  }

  await prisma.bankTransaction.create({
    data: {
      businessId: biz.id,
      fiscalMonthId: data.fiscalMonthId,
      accountId: data.accountId,
      categoryId: data.categoryId,
      date: new Date(`${data.date}T${data.time ?? "00:00"}:00Z`),
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
  const biz = await requireBusiness();
  // Scope the delete to the current business so a stray id can't cross tenants
  await prisma.bankTransaction.deleteMany({
    where: { id, businessId: biz.id },
  });
  revalidatePath("/bank");
}

const openingSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  accountId: z.coerce.number().int().positive(),
  amount: moneyField,
});

export async function setOpeningBalance(input: z.input<typeof openingSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = openingSchema.parse(input);
  if (data.amount === 0) {
    await prisma.accountOpening.deleteMany({
      where: {
        businessId: biz.id,
        accountId: data.accountId,
        fiscalMonthId: data.fiscalMonthId,
      },
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
      create: { ...data, businessId: biz.id },
    });
  }
  revalidatePath("/bank");
}

// ───── BANK ACCOUNT / CHANNEL CRUD ─────

const addAccountSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อบัญชี/ช่องทาง").max(60),
  accountType: z.enum(["BANK", "CREDIT_CARD"]).default("BANK"),
});

export async function addBankAccount(input: z.input<typeof addAccountSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = addAccountSchema.parse(input);

  // Generate a URL-safe code, unique within this business.
  const base =
    data.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 12) || "ACCT";
  let code = base;
  let n = 1;
  while (
    await prisma.bankAccount.findUnique({
      where: { businessId_code: { businessId: biz.id, code } },
    })
  ) {
    n += 1;
    code = `${base}${n}`;
  }

  const last = await prisma.bankAccount.findFirst({
    where: { businessId: biz.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.bankAccount.create({
    data: {
      businessId: biz.id,
      code,
      name: data.name,
      accountType: data.accountType,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      active: true,
    },
  });

  revalidatePath("/bank");
}

export async function deleteBankAccount(id: number) {
  await requireAccess();
  const biz = await requireBusiness();

  const acc = await prisma.bankAccount.findFirst({
    where: { id, businessId: biz.id },
    select: { id: true },
  });
  if (!acc) throw new Error("ไม่พบบัญชีนี้ในธุรกิจปัจจุบัน");

  // Hard-delete only if never used; otherwise soft-hide to preserve history.
  const [txCount, openCount] = await Promise.all([
    prisma.bankTransaction.count({ where: { accountId: id } }),
    prisma.accountOpening.count({ where: { accountId: id } }),
  ]);

  if (txCount === 0 && openCount === 0) {
    await prisma.bankAccount.delete({ where: { id } });
  } else {
    await prisma.bankAccount.update({ where: { id }, data: { active: false } });
  }

  revalidatePath("/bank");
}

// ───── TRANSACTION CATEGORY CRUD + REORDER ─────

const catKind = z.enum(["INCOME", "EXPENSE", "TRANSFER"]);

const addCatSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อหมวด").max(80),
  kind: catKind.default("EXPENSE"),
});

export async function addTxCategory(input: z.input<typeof addCatSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = addCatSchema.parse(input);

  const existing = await prisma.transactionCategory.findUnique({
    where: { businessId_name: { businessId: biz.id, name: data.name } },
  });
  if (existing) {
    if (existing.active) throw new Error("มีหมวดชื่อนี้อยู่แล้ว");
    await prisma.transactionCategory.update({
      where: { id: existing.id },
      data: { active: true, kind: data.kind },
    });
  } else {
    const last = await prisma.transactionCategory.findFirst({
      where: { businessId: biz.id, kind: data.kind },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.transactionCategory.create({
      data: {
        businessId: biz.id,
        name: data.name,
        kind: data.kind,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        active: true,
      },
    });
  }
  revalidatePath("/bank");
}

const updateCatSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "ต้องระบุชื่อหมวด").max(80),
  kind: catKind,
});

export async function updateTxCategory(input: z.input<typeof updateCatSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = updateCatSchema.parse(input);

  const cat = await prisma.transactionCategory.findFirst({
    where: { id: data.id, businessId: biz.id },
    select: { id: true },
  });
  if (!cat) throw new Error("ไม่พบหมวดนี้ในธุรกิจปัจจุบัน");

  const dupe = await prisma.transactionCategory.findFirst({
    where: { businessId: biz.id, name: data.name, id: { not: data.id } },
    select: { id: true },
  });
  if (dupe) throw new Error("มีหมวดชื่อนี้อยู่แล้ว");

  await prisma.transactionCategory.update({
    where: { id: data.id },
    data: { name: data.name, kind: data.kind },
  });
  revalidatePath("/bank");
}

export async function deleteTxCategory(id: number) {
  await requireAccess();
  const biz = await requireBusiness();
  const cat = await prisma.transactionCategory.findFirst({
    where: { id, businessId: biz.id },
    select: { id: true },
  });
  if (!cat) throw new Error("ไม่พบหมวดนี้ในธุรกิจปัจจุบัน");

  const usage = await prisma.bankTransaction.count({
    where: { categoryId: id },
  });
  if (usage === 0) {
    await prisma.transactionCategory.delete({ where: { id } });
  } else {
    // Keep history: unlink txns from this category, then soft-hide it
    await prisma.transactionCategory.update({
      where: { id },
      data: { active: false },
    });
  }
  revalidatePath("/bank");
}

export async function moveTxCategory(id: number, dir: "up" | "down") {
  await requireAccess();
  const biz = await requireBusiness();
  const cat = await prisma.transactionCategory.findFirst({
    where: { id, businessId: biz.id },
  });
  if (!cat) throw new Error("ไม่พบหมวดนี้ในธุรกิจปัจจุบัน");

  // Swap sortOrder with the adjacent active category of the SAME kind
  const siblings = await prisma.transactionCategory.findMany({
    where: { businessId: biz.id, kind: cat.kind, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return; // already at edge
  const other = siblings[swapIdx];

  await prisma.$transaction([
    prisma.transactionCategory.update({
      where: { id: cat.id },
      data: { sortOrder: other.sortOrder },
    }),
    prisma.transactionCategory.update({
      where: { id: other.id },
      data: { sortOrder: cat.sortOrder },
    }),
  ]);
  revalidatePath("/bank");
}

const setTxCatSchema = z.object({
  txId: z.coerce.number().int().positive(),
  categoryId: z.union([z.string(), z.number(), z.null()]).transform((v) => {
    if (v == null || v === "" || v === "0") return null;
    return Number(v);
  }),
});

/** Change the category of an already-recorded bank transaction (inline edit). */
export async function setTransactionCategory(
  input: z.input<typeof setTxCatSchema>
) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = setTxCatSchema.parse(input);

  const tx = await prisma.bankTransaction.findFirst({
    where: { id: data.txId, businessId: biz.id },
    select: { id: true },
  });
  if (!tx) throw new Error("ไม่พบรายการนี้ในธุรกิจปัจจุบัน");

  if (data.categoryId != null) {
    const cat = await prisma.transactionCategory.findFirst({
      where: { id: data.categoryId, businessId: biz.id },
      select: { id: true },
    });
    if (!cat) throw new Error("ไม่พบหมวดนี้ในธุรกิจปัจจุบัน");
  }

  await prisma.bankTransaction.update({
    where: { id: data.txId },
    data: { categoryId: data.categoryId },
  });
  revalidatePath("/bank");
}

// ───── PDF STATEMENT IMPORT (KBANK) ─────

export type PreviewTx = {
  /** Index in the parse — used as React key + select identity */
  idx: number;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  description: string;
  deposit: number;
  withdraw: number;
  balance: number | null;
  channel: string | null;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
  /** true = already imported into this account, or repeated earlier in this file */
  duplicate: boolean;
};

export type ParseStatementResult = {
  ok: boolean;
  message?: string;
  needPassword?: boolean;
  wrongPassword?: boolean;
  preview: PreviewTx[];
  /** Brought-forward balance (ยอดยกมา) from the statement, if detected */
  openingBalance?: number | null;
  rawText?: string;
};

export async function parseStatementPdf(
  formData: FormData
): Promise<ParseStatementResult> {
  try {
    await requireAccess();
    const biz = await requireBusiness();

    const file = formData.get("file");
    const password = String(formData.get("password") ?? "");
    const accountId = Number(formData.get("accountId")) || null;

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

    // Resolve suggested category name → id (within the current business)
    const categories = await prisma.transactionCategory.findMany({
      where: { active: true, businessId: biz.id },
      select: { id: true, name: true },
    });
    const byName = new Map(categories.map((c) => [c.name, c.id]));

    // Flag rows already imported into this account, or repeated within the file.
    // Balance-primary dedup so legit same-day / same-amount rows aren't dropped.
    const seen = newSeen();
    if (accountId) {
      const existing = await prisma.bankTransaction.findMany({
        where: { businessId: biz.id, accountId },
        select: {
          date: true,
          deposit: true,
          withdraw: true,
          balanceAfter: true,
          description: true,
        },
      });
      for (const t of existing) {
        const d = t.date.toISOString().slice(0, 10);
        addSeen(seen, d, t.deposit, t.withdraw, t.description, t.balanceAfter);
      }
    }

    const preview: PreviewTx[] = parsed.rows.map((r, idx) => {
      const suggestedName = suggestCategoryName(
        r.description,
        r.deposit,
        r.withdraw
      );
      const duplicate = isDupRow(
        seen,
        r.date,
        r.deposit,
        r.withdraw,
        r.description,
        r.balance
      );
      addSeen(seen, r.date, r.deposit, r.withdraw, r.description, r.balance);
      return {
        idx,
        date: r.date,
        time: r.time,
        description: r.description,
        deposit: r.deposit,
        withdraw: r.withdraw,
        balance: r.balance,
        channel: r.channel,
        suggestedCategoryId: suggestedName
          ? (byName.get(suggestedName) ?? null)
          : null,
        suggestedCategoryName: suggestedName,
        duplicate,
      };
    });

    return {
      ok: true,
      preview,
      openingBalance: parsed.openingBalance ?? null,
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
  // Optional: set the month's opening balance (ยอดยกมา) from the statement
  setOpening: z.boolean().optional().default(false),
  openingBalance: z.union([z.number(), z.null()]).optional(),
  rows: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      // HH:MM from the statement (for chronological sort). Null/absent → midnight.
      time: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .nullable()
        .optional(),
      // Real statement rows can be quite long once channel text is included —
      // bumped to 1000 so we never reject a parsed row for length alone.
      description: z.string().min(1).max(1000),
      deposit: moneyField,
      withdraw: moneyField,
      // Running balance after this row (for dedup). Null if not parseable.
      balance: z.union([z.number(), z.null()]).optional(),
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
  skipped?: number;
  message?: string;
};

// Dedup fingerprints. The statement's running balance is unique per row, so it
// is the PRIMARY key — two different transactions with the same date+amount+desc
// (e.g. two ฿50 PromptPay receipts in one day) have different running balances
// and must NOT be collapsed. The description key is only a fallback for rows
// that genuinely have no balance (manual entries / pre-balanceAfter imports).
const r2 = (n: number) => Math.round(n * 100) / 100;
function fpBalance(d: string, dep: number, wd: number, bal: number): string {
  return `${d}|${r2(dep)}|${r2(wd)}|b${r2(bal)}`;
}
function fpDesc(d: string, dep: number, wd: number, desc: string): string {
  return `${d}|${r2(dep)}|${r2(wd)}|d${(desc || "").trim().slice(0, 60)}`;
}

type SeenSets = {
  bal: Set<string>; // balance fingerprints of rows that have a balance
  descAll: Set<string>; // desc fingerprints of every row
  descNoBal: Set<string>; // desc fingerprints of rows WITHOUT a balance
};

function newSeen(): SeenSets {
  return { bal: new Set(), descAll: new Set(), descNoBal: new Set() };
}

function addSeen(
  s: SeenSets,
  d: string,
  dep: number,
  wd: number,
  desc: string,
  bal: number | null
) {
  s.descAll.add(fpDesc(d, dep, wd, desc));
  if (bal != null) s.bal.add(fpBalance(d, dep, wd, bal));
  else s.descNoBal.add(fpDesc(d, dep, wd, desc));
}

/**
 * A row is a duplicate when:
 *  - it has a balance and that exact balance was already seen (same line), OR
 *  - it has a balance but matches an older balance-less row by description, OR
 *  - it has no balance and matches any seen row by description.
 * Two balance-bearing rows are NEVER merged on description alone, so legit
 * same-day / same-amount transactions are kept.
 */
function isDupRow(
  s: SeenSets,
  d: string,
  dep: number,
  wd: number,
  desc: string,
  bal: number | null
): boolean {
  if (bal != null) {
    return (
      s.bal.has(fpBalance(d, dep, wd, bal)) ||
      s.descNoBal.has(fpDesc(d, dep, wd, desc))
    );
  }
  return s.descAll.has(fpDesc(d, dep, wd, desc));
}

export async function importStatementRows(
  input: z.input<typeof importStatementSchema>
): Promise<ImportStatementResult> {
  try {
    const session = await requireAccess();
    const biz = await requireBusiness();

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

    // ── Dedup against what's already in this account ──
    const existing = await prisma.bankTransaction.findMany({
      where: { businessId: biz.id, accountId: data.accountId },
      select: {
        date: true,
        deposit: true,
        withdraw: true,
        balanceAfter: true,
        description: true,
      },
    });
    const seen = newSeen();
    for (const t of existing) {
      const d = t.date.toISOString().slice(0, 10);
      addSeen(seen, d, t.deposit, t.withdraw, t.description, t.balanceAfter);
    }

    const toInsert: typeof data.rows = [];
    let skipped = 0;
    for (const r of data.rows) {
      const bal = r.balance ?? null;
      if (isDupRow(seen, r.date, r.deposit, r.withdraw, r.description, bal)) {
        skipped += 1;
        continue;
      }
      addSeen(seen, r.date, r.deposit, r.withdraw, r.description, bal);
      toInsert.push(r);
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      const result = await prisma.bankTransaction.createMany({
        data: toInsert.map((r) => ({
          businessId: biz.id,
          fiscalMonthId: data.fiscalMonthId,
          accountId: data.accountId,
          categoryId: r.categoryId,
          // Store full timestamp so rows sort by date+time (re-imports interleave
          // correctly instead of appending at the end of the day).
          date: new Date(`${r.date}T${r.time ?? "00:00"}:00Z`),
          description: r.description,
          deposit: r.deposit,
          withdraw: r.withdraw,
          balanceAfter: r.balance ?? null,
          channel: r.channel || null,
          note: r.note || null,
          createdById: session.user.id,
        })),
      });
      inserted = result.count;
    }

    // ── Optionally set the month's opening balance from the statement ──
    if (data.setOpening && data.openingBalance != null) {
      await prisma.accountOpening.upsert({
        where: {
          accountId_fiscalMonthId: {
            accountId: data.accountId,
            fiscalMonthId: data.fiscalMonthId,
          },
        },
        update: { amount: data.openingBalance },
        create: {
          businessId: biz.id,
          accountId: data.accountId,
          fiscalMonthId: data.fiscalMonthId,
          amount: data.openingBalance,
        },
      });
    }

    revalidatePath("/bank");
    return {
      ok: true,
      inserted,
      skipped,
      message:
        skipped > 0
          ? `บันทึก ${inserted} รายการ — ข้ามรายการซ้ำ ${skipped} รายการ`
          : undefined,
    };
  } catch (e) {
    console.error("[importStatementRows] unexpected error:", e);
    return {
      ok: false,
      inserted: 0,
      message: `บันทึกไม่สำเร็จ: ${(e as Error).message ?? String(e)}`,
    };
  }
}
