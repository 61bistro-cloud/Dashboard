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

const fiscalMonthId = z.coerce.number().int().positive();

// ───── PAYROLL ─────

const savePayrollSchema = z.object({
  fiscalMonthId,
  payroll: z.array(
    z.object({
      employeeId: z.coerce.number().int().positive(),
      amount: moneyField,
    })
  ),
  extras: z.array(
    z.object({
      type: z.enum(["OT", "BONUS", "EXTRA", "SERVICE_CHARGE"]),
      amount: moneyField,
    })
  ),
});

export async function savePayroll(input: z.input<typeof savePayrollSchema>) {
  await requireAccess();
  const data = savePayrollSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    for (const p of data.payroll) {
      if (p.amount === 0) {
        await tx.employeePayroll.deleteMany({
          where: {
            employeeId: p.employeeId,
            fiscalMonthId: data.fiscalMonthId,
          },
        });
      } else {
        await tx.employeePayroll.upsert({
          where: {
            employeeId_fiscalMonthId: {
              employeeId: p.employeeId,
              fiscalMonthId: data.fiscalMonthId,
            },
          },
          update: { amount: p.amount },
          create: {
            employeeId: p.employeeId,
            fiscalMonthId: data.fiscalMonthId,
            amount: p.amount,
          },
        });
      }
    }
    for (const e of data.extras) {
      if (e.amount === 0) {
        await tx.payrollExtra.deleteMany({
          where: { fiscalMonthId: data.fiscalMonthId, type: e.type },
        });
      } else {
        await tx.payrollExtra.upsert({
          where: {
            fiscalMonthId_type: {
              fiscalMonthId: data.fiscalMonthId,
              type: e.type,
            },
          },
          update: { amount: e.amount },
          create: {
            fiscalMonthId: data.fiscalMonthId,
            type: e.type,
            amount: e.amount,
          },
        });
      }
    }
  });

  revalidatePath("/cost-setup");
}

// ───── SUPPLIERS ─────

const saveSuppliersSchema = z.object({
  fiscalMonthId,
  purchases: z.array(
    z.object({
      supplierId: z.coerce.number().int().positive(),
      amount: moneyField,
    })
  ),
});

export async function saveSuppliers(
  input: z.input<typeof saveSuppliersSchema>
) {
  await requireAccess();
  const data = saveSuppliersSchema.parse(input);

  await prisma.$transaction(
    data.purchases.map((p) =>
      p.amount === 0
        ? prisma.supplierPurchase.deleteMany({
            where: {
              supplierId: p.supplierId,
              fiscalMonthId: data.fiscalMonthId,
            },
          })
        : prisma.supplierPurchase.upsert({
            where: {
              supplierId_fiscalMonthId: {
                supplierId: p.supplierId,
                fiscalMonthId: data.fiscalMonthId,
              },
            },
            update: { amount: p.amount },
            create: {
              supplierId: p.supplierId,
              fiscalMonthId: data.fiscalMonthId,
              amount: p.amount,
            },
          })
    )
  );

  revalidatePath("/cost-setup");
}

// ───── FIXED COSTS ─────

const saveFixedSchema = z.object({
  fiscalMonthId,
  costs: z.array(
    z.object({
      categoryId: z.coerce.number().int().positive(),
      amount: moneyField,
    })
  ),
});

export async function saveFixed(input: z.input<typeof saveFixedSchema>) {
  await requireAccess();
  const data = saveFixedSchema.parse(input);

  await prisma.$transaction(
    data.costs.map((c) =>
      c.amount === 0
        ? prisma.fixedCost.deleteMany({
            where: {
              categoryId: c.categoryId,
              fiscalMonthId: data.fiscalMonthId,
            },
          })
        : prisma.fixedCost.upsert({
            where: {
              categoryId_fiscalMonthId: {
                categoryId: c.categoryId,
                fiscalMonthId: data.fiscalMonthId,
              },
            },
            update: { amount: c.amount },
            create: {
              categoryId: c.categoryId,
              fiscalMonthId: data.fiscalMonthId,
              amount: c.amount,
            },
          })
    )
  );

  revalidatePath("/cost-setup");
}

// ───── REVENUE OVERRIDE ─────

const saveOverrideSchema = z.object({
  fiscalMonthId,
  amount: moneyField,
  note: z.string().max(200).optional().default(""),
});

export async function saveRevenueOverride(
  input: z.input<typeof saveOverrideSchema>
) {
  await requireAccess();
  const data = saveOverrideSchema.parse(input);

  if (data.amount === 0) {
    await prisma.monthlyRevenueOverride.deleteMany({
      where: { fiscalMonthId: data.fiscalMonthId },
    });
  } else {
    await prisma.monthlyRevenueOverride.upsert({
      where: { fiscalMonthId: data.fiscalMonthId },
      update: { amount: data.amount, note: data.note || null },
      create: {
        fiscalMonthId: data.fiscalMonthId,
        amount: data.amount,
        note: data.note || null,
      },
    });
  }

  revalidatePath("/cost-setup");
}
