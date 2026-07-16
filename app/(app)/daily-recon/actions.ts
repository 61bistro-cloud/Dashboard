"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/business";

async function requireAccess() {
  const session = await auth();
  if (!session) throw new Error("unauthorized");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    throw new Error("forbidden");
  }
  return session;
}

const money = z.union([z.string(), z.number(), z.null()]).transform((v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
  return Number.isFinite(n) ? n : null;
});

const saveSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  entries: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      actual: money,
    })
  ),
});

/** Save the manually-entered "เข้าจริง" for one item across a month.
 *  A blank value removes the entry for that day. */
export async function saveReconEntries(input: z.input<typeof saveSchema>) {
  try {
    await requireAccess();
    const biz = await requireBusiness();
    const data = saveSchema.parse(input);

    const item = await prisma.reconItem.findFirst({
      where: { id: data.itemId, businessId: biz.id },
      select: { id: true },
    });
    if (!item) return { ok: false as const, message: "ไม่พบรายการนี้" };

    const toDelete = data.entries
      .filter((e) => e.actual == null)
      .map((e) => e.date);
    const toUpsert = data.entries.filter((e) => e.actual != null);

    await prisma.$transaction([
      ...(toDelete.length
        ? [
            prisma.reconEntry.deleteMany({
              where: { reconItemId: item.id, date: { in: toDelete } },
            }),
          ]
        : []),
      ...toUpsert.map((e) =>
        prisma.reconEntry.upsert({
          where: { reconItemId_date: { reconItemId: item.id, date: e.date } },
          update: { actual: e.actual! },
          create: {
            businessId: biz.id,
            reconItemId: item.id,
            date: e.date,
            actual: e.actual!,
          },
        })
      ),
    ]);

    revalidatePath("/daily-recon");
    return {
      ok: true as const,
      saved: toUpsert.length,
      cleared: toDelete.length,
    };
  } catch (e) {
    console.error("[saveReconEntries]", e);
    return { ok: false as const, message: (e as Error).message ?? String(e) };
  }
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อรายการ").max(60),
  matchField: z.enum(["PAYMENT", "TABLE", "CHANNEL", "NONE"]).default("NONE"),
  matchKeywords: z.string().trim().max(200).optional(),
});

export async function addReconItem(input: z.input<typeof itemSchema>) {
  try {
    await requireAccess();
    const biz = await requireBusiness();
    const d = itemSchema.parse(input);
    const last = await prisma.reconItem.findFirst({
      where: { businessId: biz.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.reconItem.create({
      data: {
        businessId: biz.id,
        name: d.name,
        matchField: d.matchField === "NONE" ? null : d.matchField,
        matchKeywords: d.matchField === "NONE" ? null : d.matchKeywords || null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
    revalidatePath("/daily-recon");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: (e as Error).message ?? String(e) };
  }
}

const updateSchema = itemSchema.extend({
  id: z.coerce.number().int().positive(),
});

export async function updateReconItem(input: z.input<typeof updateSchema>) {
  try {
    await requireAccess();
    const biz = await requireBusiness();
    const d = updateSchema.parse(input);
    const found = await prisma.reconItem.findFirst({
      where: { id: d.id, businessId: biz.id },
      select: { id: true },
    });
    if (!found) return { ok: false as const, message: "ไม่พบรายการนี้" };
    await prisma.reconItem.update({
      where: { id: d.id },
      data: {
        name: d.name,
        matchField: d.matchField === "NONE" ? null : d.matchField,
        matchKeywords: d.matchField === "NONE" ? null : d.matchKeywords || null,
      },
    });
    revalidatePath("/daily-recon");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: (e as Error).message ?? String(e) };
  }
}

export async function deleteReconItem(id: number) {
  await requireAccess();
  const biz = await requireBusiness();
  // Entries cascade with the item.
  await prisma.reconItem.deleteMany({ where: { id, businessId: biz.id } });
  revalidatePath("/daily-recon");
  return { ok: true };
}

/** Move an item up/down — this is the match PRIORITY order. */
export async function moveReconItem(id: number, dir: "up" | "down") {
  await requireAccess();
  const biz = await requireBusiness();
  const all = await prisma.reconItem.findMany({
    where: { businessId: biz.id, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return { ok: true };
  await prisma.$transaction([
    prisma.reconItem.update({
      where: { id: all[i].id },
      data: { sortOrder: all[j].sortOrder },
    }),
    prisma.reconItem.update({
      where: { id: all[j].id },
      data: { sortOrder: all[i].sortOrder },
    }),
  ]);
  revalidatePath("/daily-recon");
  return { ok: true };
}
