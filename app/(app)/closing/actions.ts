"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/business";
import { getYearlyPL } from "@/lib/pl-calc";

/** Owner approval password. Override via env, defaults to the shared Owner123. */
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

async function computeSnapshot(businessId: number, fiscalMonthId: number) {
  const fm = await prisma.fiscalMonth.findUnique({
    where: { id: fiscalMonthId },
    include: { year: true },
  });
  if (!fm) throw new Error("ไม่พบเดือนนี้");
  const yearly = await getYearlyPL(fm.year.yearBE, businessId);
  const m = yearly?.months.find((x) => x.fiscalMonthId === fiscalMonthId);
  if (!m) throw new Error("คำนวณ P&L ไม่ได้");
  return {
    netRevenue: m.netRevenue,
    posBillCount: m.posBillCount,
    food: m.food,
    bev: m.bev,
    pack: m.pack,
    cogs: m.cogs,
    laborBase: m.laborBase,
    laborExtra: m.laborExtra,
    labor: m.labor,
    fixed: m.fixed,
    totalCost: m.totalCost,
    netProfit: m.netProfit,
    marginPct: m.marginPct,
  };
}

async function getRecordOrThrow(businessId: number, fiscalMonthId: number) {
  const rec = await prisma.monthlyClosing.findUnique({
    where: { businessId_fiscalMonthId: { businessId, fiscalMonthId } },
    select: { id: true },
  });
  if (!rec) throw new Error("ยังไม่ได้ปิดงบเดือนนี้");
  return rec;
}

const closeSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  password: z.string().min(1),
  note: z.string().max(500).optional().default(""),
});

export async function closeMonth(input: z.input<typeof closeSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = closeSchema.parse(input);
  approve(data.password);

  const snap = await computeSnapshot(biz.id, data.fiscalMonthId);

  const closing = await prisma.monthlyClosing.upsert({
    where: {
      businessId_fiscalMonthId: {
        businessId: biz.id,
        fiscalMonthId: data.fiscalMonthId,
      },
    },
    update: {
      ...snap,
      status: "CLOSED",
      note: data.note || null,
      closedById: session.user.id,
      closedAt: new Date(),
    },
    create: {
      businessId: biz.id,
      fiscalMonthId: data.fiscalMonthId,
      status: "CLOSED",
      note: data.note || null,
      closedById: session.user.id,
      ...snap,
    },
  });

  await prisma.closingLog.create({
    data: {
      closingId: closing.id,
      action: "CLOSE",
      detail: `ปิดงบ — กำไรสุทธิ ${snap.netProfit.toFixed(2)}`,
      byUserId: session.user.id,
    },
  });

  revalidatePath("/closing");
}

const fmPwSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  password: z.string().min(1),
});

export async function resyncClosing(input: z.input<typeof fmPwSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = fmPwSchema.parse(input);
  approve(data.password);

  const rec = await getRecordOrThrow(biz.id, data.fiscalMonthId);
  const snap = await computeSnapshot(biz.id, data.fiscalMonthId);

  await prisma.monthlyClosing.update({
    where: { id: rec.id },
    data: { ...snap, status: "CLOSED", closedById: session.user.id },
  });
  await prisma.closingLog.create({
    data: {
      closingId: rec.id,
      action: "RESYNC",
      detail: "ดึงตัวเลขล่าสุดมาปิดงบใหม่",
      byUserId: session.user.id,
    },
  });
  revalidatePath("/closing");
}

export async function reopenMonth(input: z.input<typeof fmPwSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = fmPwSchema.parse(input);
  approve(data.password);

  const rec = await getRecordOrThrow(biz.id, data.fiscalMonthId);
  await prisma.monthlyClosing.update({
    where: { id: rec.id },
    data: { status: "OPEN" },
  });
  await prisma.closingLog.create({
    data: {
      closingId: rec.id,
      action: "REOPEN",
      detail: "เปิดงบเพื่อแก้ไข",
      byUserId: session.user.id,
    },
  });
  revalidatePath("/closing");
}

const noteSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  password: z.string().min(1),
  note: z.string().max(500),
});

export async function saveClosingNote(input: z.input<typeof noteSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = noteSchema.parse(input);
  approve(data.password);

  const rec = await getRecordOrThrow(biz.id, data.fiscalMonthId);
  await prisma.monthlyClosing.update({
    where: { id: rec.id },
    data: { note: data.note || null },
  });
  await prisma.closingLog.create({
    data: {
      closingId: rec.id,
      action: "NOTE",
      detail: "แก้ไขหมายเหตุ",
      byUserId: session.user.id,
    },
  });
  revalidatePath("/closing");
}

const addAdjSchema = z.object({
  fiscalMonthId: z.coerce.number().int().positive(),
  password: z.string().min(1),
  kind: z.enum(["REVENUE", "COST"]),
  label: z.string().trim().min(1, "ต้องระบุรายละเอียด").max(120),
  amount: z.coerce.number().finite(),
});

export async function addAdjustment(input: z.input<typeof addAdjSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = addAdjSchema.parse(input);
  approve(data.password);

  const rec = await getRecordOrThrow(biz.id, data.fiscalMonthId);
  await prisma.closingAdjustment.create({
    data: {
      closingId: rec.id,
      kind: data.kind,
      label: data.label,
      amount: data.amount,
    },
  });
  await prisma.closingLog.create({
    data: {
      closingId: rec.id,
      action: "ADJUST_ADD",
      detail: `${data.kind === "REVENUE" ? "ปรับรายได้" : "ปรับต้นทุน"} ${data.label} ${data.amount.toFixed(2)}`,
      byUserId: session.user.id,
    },
  });
  revalidatePath("/closing");
}

const removeAdjSchema = z.object({
  adjustmentId: z.coerce.number().int().positive(),
  password: z.string().min(1),
});

export async function removeAdjustment(input: z.input<typeof removeAdjSchema>) {
  const session = await requireAccess();
  const biz = await requireBusiness();
  const data = removeAdjSchema.parse(input);
  approve(data.password);

  // Make sure the adjustment belongs to a closing of the current business
  const adj = await prisma.closingAdjustment.findFirst({
    where: { id: data.adjustmentId, closing: { businessId: biz.id } },
    select: { id: true, closingId: true, label: true },
  });
  if (!adj) throw new Error("ไม่พบรายการปรับปรุงนี้");

  await prisma.closingAdjustment.delete({ where: { id: adj.id } });
  await prisma.closingLog.create({
    data: {
      closingId: adj.closingId,
      action: "ADJUST_REMOVE",
      detail: `ลบรายการปรับปรุง: ${adj.label}`,
      byUserId: session.user.id,
    },
  });
  revalidatePath("/closing");
}
