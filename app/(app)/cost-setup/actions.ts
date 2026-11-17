"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  EXTRA_MARKER,
  OTHER_MARKER,
  extraMarker,
  isPayrollExtraCategory,
  legacyExtraType,
  type FlexibleCostRow,
} from "@/lib/flexible-costs";
import { PAYROLL_EXTRA_LABELS } from "@/lib/payroll-labels";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/business";

function revalidateCostViews() {
  for (const path of [
    "/cost-setup",
    "/",
    "/daily-pl",
    "/monthly-pl",
    "/closing",
    "/closing-print",
  ])
    revalidatePath(path);
}

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

const flexibleRowSchema = z.object({
  id: z.number().int().positive().optional(),
  legacyType: z.enum(["OT", "BONUS", "EXTRA", "SERVICE_CHARGE"]).optional(),
  name: z.string().trim().min(1, "ต้องระบุชื่อรายการ").max(120),
  amount: z.number().finite().min(0).max(99_999_999),
});
const flexibleRowsSchema = z
  .array(flexibleRowSchema)
  .max(200)
  .superRefine((rows, ctx) => {
    const names = new Set<string>(),
      ids = new Set<number>(),
      types = new Set<string>();
    for (const row of rows) {
      const name = row.name.toLocaleLowerCase();
      if (
        names.has(name) ||
        (row.id && ids.has(row.id)) ||
        (row.legacyType && types.has(row.legacyType))
      )
        ctx.addIssue({
          code: "custom",
          message: "มีรายการซ้ำ กรุณาตรวจชื่อและรายการ",
        });
      names.add(name);
      if (row.id) ids.add(row.id);
      if (row.legacyType) types.add(row.legacyType);
    }
  });

async function saveFlexibleRows(
  tx: Prisma.TransactionClient,
  businessId: number,
  monthId: number,
  kind: "extra" | "other",
  rows: FlexibleCostRow[]
) {
  if (
    !(await tx.fiscalMonth.findUnique({
      where: { id: monthId },
      select: { id: true },
    }))
  )
    throw new Error("ไม่พบเดือนนี้");
  const marker = kind === "extra" ? EXTRA_MARKER : OTHER_MARKER;
  const categories = await tx.fixedCostCategory.findMany({
    where: { businessId },
  });
  const belongs = (icon: string | null) =>
    kind === "extra" ? isPayrollExtraCategory(icon) : icon === OTHER_MARKER;
  for (const row of rows) {
    const existing = row.id
      ? categories.find((c) => c.id === row.id)
      : undefined;
    if (
      row.id &&
      (!existing ||
        !belongs(existing.icon) ||
        legacyExtraType(existing.icon) !== row.legacyType)
    )
      throw new Error("ไม่พบรายการนี้ในธุรกิจปัจจุบัน");
    if (kind === "other" && row.legacyType) throw new Error("ข้อมูลไม่ถูกต้อง");
    if (
      !row.id &&
      row.legacyType &&
      categories.some((c) => legacyExtraType(c.icon) === row.legacyType)
    )
      throw new Error("รายการเปลี่ยนไปแล้ว กรุณารีเฟรชหน้าและเลือกใหม่");
  }
  for (const row of rows) {
    const collision = categories.find(
      (c) => c.name === row.name && c.id !== row.id
    );
    if (
      collision &&
      (row.id ||
        !belongs(collision.icon) ||
        legacyExtraType(collision.icon) !== row.legacyType)
    )
      throw new Error("มีหมวดชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น");
  }
  const keep = new Set<number>();
  let order = Math.max(0, ...categories.map((c) => c.sortOrder));
  for (const row of rows) {
    const icon = kind === "extra" ? extraMarker(row.legacyType) : marker;
    const existingId =
      row.id ??
      categories.find(
        (c) =>
          c.name === row.name &&
          belongs(c.icon) &&
          legacyExtraType(c.icon) === row.legacyType
      )?.id;
    const category = existingId
      ? await tx.fixedCostCategory.update({
          where: { id: existingId },
          data: { name: row.name, active: true },
        })
      : await tx.fixedCostCategory.create({
          data: {
            businessId,
            name: row.name,
            icon,
            active: true,
            sortOrder: ++order,
          },
        });
    keep.add(category.id);
    // Keep an explicit zero so a deleted/zero legacy amount cannot reappear.
    await tx.fixedCost.upsert({
      where: {
        categoryId_fiscalMonthId: {
          categoryId: category.id,
          fiscalMonthId: monthId,
        },
      },
      update: { amount: row.amount },
      create: {
        businessId,
        categoryId: category.id,
        fiscalMonthId: monthId,
        amount: row.amount,
      },
    });
  }
  for (const category of categories.filter(
    (c) => belongs(c.icon) && !keep.has(c.id)
  )) {
    await tx.fixedCostCategory.update({
      where: { id: category.id },
      data: { active: false },
    });
    await tx.fixedCost.deleteMany({
      where: { businessId, categoryId: category.id, fiscalMonthId: monthId },
    });
  }
  if (kind === "extra") {
    // Missing built-in rows get a hidden marker, so removal survives reload.
    for (const type of Object.keys(PAYROLL_EXTRA_LABELS) as Array<
      keyof typeof PAYROLL_EXTRA_LABELS
    >) {
      if (
        rows.some((r) => r.legacyType === type) ||
        categories.some((c) => legacyExtraType(c.icon) === type)
      )
        continue;
      await tx.fixedCostCategory.create({
        data: {
          businessId,
          name: PAYROLL_EXTRA_LABELS[type],
          icon: extraMarker(type),
          active: false,
          sortOrder: ++order,
        },
      });
    }
    // Move only this month's explicitly saved extras; historical months stay intact.
    await tx.payrollExtra.deleteMany({
      where: { businessId, fiscalMonthId: monthId },
    });
  }
}

export async function saveOtherCosts(input: {
  fiscalMonthId: number;
  rows: FlexibleCostRow[];
}) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = z
    .object({ fiscalMonthId, rows: flexibleRowsSchema })
    .parse(input);
  await prisma.$transaction(
    (tx) =>
      saveFlexibleRows(tx, biz.id, data.fiscalMonthId, "other", data.rows),
    { timeout: 30_000 }
  );
  revalidateCostViews();
}

const savePayrollSchema = z.object({
  fiscalMonthId,
  payroll: z.array(
    z.object({
      employeeId: z.coerce.number().int().positive(),
      amount: moneyField,
      // Per-month custom name. Empty/null means "use the global Employee.name".
      nameOverride: z.string().trim().max(200).optional().nullable(),
    })
  ),
  extras: flexibleRowsSchema,
});

export async function savePayroll(input: z.input<typeof savePayrollSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = savePayrollSchema.parse(input);

  await prisma.$transaction(
    async (tx) => {
      const owned = await tx.employee.findMany({
        where: {
          businessId: biz.id,
          id: { in: data.payroll.map((p) => p.employeeId) },
        },
        select: { id: true },
      });
      if (data.payroll.some((p) => !owned.some((e) => e.id === p.employeeId)))
        throw new Error("ไม่พบพนักงานในธุรกิจปัจจุบัน");
      for (const p of data.payroll) {
        const override =
          p.nameOverride && p.nameOverride.length > 0 ? p.nameOverride : null;
        // Delete the row only when there's NOTHING worth saving — amount is 0
        // AND there's no per-month name override the user wants to keep.
        if (p.amount === 0 && override == null) {
          await tx.employeePayroll.deleteMany({
            where: {
              businessId: biz.id,
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
            update: { amount: p.amount, nameOverride: override },
            create: {
              businessId: biz.id,
              employeeId: p.employeeId,
              fiscalMonthId: data.fiscalMonthId,
              amount: p.amount,
              nameOverride: override,
            },
          });
        }
      }
      await saveFlexibleRows(
        tx,
        biz.id,
        data.fiscalMonthId,
        "extra",
        data.extras
      );
    },
    { timeout: 30_000 }
  );

  revalidateCostViews();
}

// ───── SUPPLIERS ─────

const saveSuppliersSchema = z.object({
  fiscalMonthId,
  purchases: z.array(
    z.object({
      supplierId: z.coerce.number().int().positive(),
      amount: moneyField,
      nameOverride: z.string().trim().max(200).optional().nullable(),
    })
  ),
});

export async function saveSuppliers(
  input: z.input<typeof saveSuppliersSchema>
) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = saveSuppliersSchema.parse(input);

  await prisma.$transaction(
    data.purchases.map((p) => {
      const override =
        p.nameOverride && p.nameOverride.length > 0 ? p.nameOverride : null;
      return p.amount === 0 && override == null
        ? prisma.supplierPurchase.deleteMany({
            where: {
              businessId: biz.id,
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
            update: { amount: p.amount, nameOverride: override },
            create: {
              businessId: biz.id,
              supplierId: p.supplierId,
              fiscalMonthId: data.fiscalMonthId,
              amount: p.amount,
              nameOverride: override,
            },
          });
    })
  );

  revalidateCostViews();
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
  const biz = await requireBusiness();
  const data = saveFixedSchema.parse(input);

  await prisma.$transaction(
    data.costs.map((c) =>
      c.amount === 0
        ? prisma.fixedCost.deleteMany({
            where: {
              businessId: biz.id,
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
              businessId: biz.id,
              categoryId: c.categoryId,
              fiscalMonthId: data.fiscalMonthId,
              amount: c.amount,
            },
          })
    )
  );

  revalidateCostViews();
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
  const biz = await requireBusiness();
  const data = saveOverrideSchema.parse(input);

  if (data.amount === 0) {
    await prisma.monthlyRevenueOverride.deleteMany({
      where: { businessId: biz.id, fiscalMonthId: data.fiscalMonthId },
    });
  } else {
    await prisma.monthlyRevenueOverride.upsert({
      where: {
        businessId_fiscalMonthId: {
          businessId: biz.id,
          fiscalMonthId: data.fiscalMonthId,
        },
      },
      update: { amount: data.amount, note: data.note || null },
      create: {
        businessId: biz.id,
        fiscalMonthId: data.fiscalMonthId,
        amount: data.amount,
        note: data.note || null,
      },
    });
  }

  revalidateCostViews();
}

// ───── FIXED CATEGORY CRUD ─────

const addFixedCategorySchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อหมวด").max(80),
});

export async function addFixedCategory(
  input: z.input<typeof addFixedCategorySchema>
) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = addFixedCategorySchema.parse(input);

  // Reactivate if a soft-deleted category with same name exists in THIS business
  const existing = await prisma.fixedCostCategory.findUnique({
    where: { businessId_name: { businessId: biz.id, name: data.name } },
  });
  if (existing) {
    if (existing.active) {
      throw new Error("มีหมวดชื่อนี้อยู่แล้ว");
    }
    await prisma.fixedCostCategory.update({
      where: { id: existing.id },
      data: { active: true },
    });
  } else {
    const last = await prisma.fixedCostCategory.findFirst({
      where: { businessId: biz.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.fixedCostCategory.create({
      data: {
        businessId: biz.id,
        name: data.name,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        active: true,
      },
    });
  }

  revalidateCostViews();
}

export async function deleteFixedCategory(id: number) {
  await requireAccess();
  const biz = await requireBusiness();

  // Guard: the category must belong to the current business
  const cat = await prisma.fixedCostCategory.findFirst({
    where: { id, businessId: biz.id },
    select: { id: true },
  });
  if (!cat) throw new Error("ไม่พบหมวดนี้ในธุรกิจปัจจุบัน");

  // Hard delete if no costs ever recorded; otherwise soft-delete (preserve history)
  const usage = await prisma.fixedCost.count({ where: { categoryId: id } });
  if (usage === 0) {
    await prisma.fixedCostCategory.delete({ where: { id } });
  } else {
    await prisma.fixedCostCategory.update({
      where: { id },
      data: { active: false },
    });
  }

  revalidateCostViews();
}

// ───── EMPLOYEE CRUD ─────

const addEmployeeSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อพนักงาน").max(120),
});

export async function addEmployee(input: z.input<typeof addEmployeeSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = addEmployeeSchema.parse(input);

  // Reactivate inactive employee with same name if exists in THIS business
  const existing = await prisma.employee.findFirst({
    where: { businessId: biz.id, name: data.name },
  });
  if (existing) {
    if (existing.active) {
      throw new Error("มีพนักงานชื่อนี้อยู่แล้ว");
    }
    await prisma.employee.update({
      where: { id: existing.id },
      data: { active: true },
    });
  } else {
    const last = await prisma.employee.findFirst({
      where: { businessId: biz.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.employee.create({
      data: {
        businessId: biz.id,
        name: data.name,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        active: true,
      },
    });
  }

  revalidateCostViews();
}

export async function deleteEmployee(id: number) {
  await requireAccess();
  const biz = await requireBusiness();

  const emp = await prisma.employee.findFirst({
    where: { id, businessId: biz.id },
    select: { id: true },
  });
  if (!emp) throw new Error("ไม่พบพนักงานในธุรกิจปัจจุบัน");

  const usage = await prisma.employeePayroll.count({
    where: { employeeId: id },
  });
  if (usage === 0) {
    await prisma.employee.delete({ where: { id } });
  } else {
    await prisma.employee.update({
      where: { id },
      data: { active: false },
    });
  }

  revalidateCostViews();
}

// ───── SUPPLIER CRUD ─────

const addSupplierSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อ supplier").max(120),
  category: z.enum(["FOOD", "BEVERAGE", "PACKAGING"]),
});

export async function addSupplier(input: z.input<typeof addSupplierSchema>) {
  await requireAccess();
  const biz = await requireBusiness();
  const data = addSupplierSchema.parse(input);

  const existing = await prisma.supplier.findUnique({
    where: {
      businessId_category_name: {
        businessId: biz.id,
        category: data.category,
        name: data.name,
      },
    },
  });
  if (existing) {
    if (existing.active) {
      throw new Error("มี supplier ชื่อนี้ในหมวดนี้อยู่แล้ว");
    }
    await prisma.supplier.update({
      where: { id: existing.id },
      data: { active: true },
    });
  } else {
    const last = await prisma.supplier.findFirst({
      where: { businessId: biz.id, category: data.category },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.supplier.create({
      data: {
        businessId: biz.id,
        name: data.name,
        category: data.category,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        active: true,
      },
    });
  }

  revalidateCostViews();
}

export async function deleteSupplier(id: number) {
  await requireAccess();
  const biz = await requireBusiness();

  const sup = await prisma.supplier.findFirst({
    where: { id, businessId: biz.id },
    select: { id: true },
  });
  if (!sup) throw new Error("ไม่พบ supplier ในธุรกิจปัจจุบัน");

  const usage = await prisma.supplierPurchase.count({
    where: { supplierId: id },
  });
  if (usage === 0) {
    await prisma.supplier.delete({ where: { id } });
  } else {
    await prisma.supplier.update({
      where: { id },
      data: { active: false },
    });
  }

  revalidateCostViews();
}

// ───── REORDER (drag & drop → persist new order) ─────

const idListSchema = z.array(z.coerce.number().int().positive());

export async function reorderEmployees(ids: number[]) {
  await requireAccess();
  const biz = await requireBusiness();
  const order = idListSchema.parse(ids);

  // Only touch rows that actually belong to this business
  const owned = new Set(
    (
      await prisma.employee.findMany({
        where: { businessId: biz.id, id: { in: order } },
        select: { id: true },
      })
    ).map((e) => e.id)
  );

  await prisma.$transaction(
    order
      .filter((id) => owned.has(id))
      .map((id, i) =>
        prisma.employee.update({ where: { id }, data: { sortOrder: i } })
      )
  );
  // No revalidate — the client already reordered optimistically; this keeps
  // any unsaved amount edits in the form intact.
}

export async function reorderSuppliers(ids: number[]) {
  await requireAccess();
  const biz = await requireBusiness();
  const order = idListSchema.parse(ids);

  const owned = new Set(
    (
      await prisma.supplier.findMany({
        where: { businessId: biz.id, id: { in: order } },
        select: { id: true },
      })
    ).map((s) => s.id)
  );

  await prisma.$transaction(
    order
      .filter((id) => owned.has(id))
      .map((id, i) =>
        prisma.supplier.update({ where: { id }, data: { sortOrder: i } })
      )
  );
  // No revalidate — see reorderEmployees.
}

export async function reorderFixedCategories(ids: number[]) {
  await requireAccess();
  const biz = await requireBusiness();
  const order = idListSchema.parse(ids);

  const owned = new Set(
    (
      await prisma.fixedCostCategory.findMany({
        where: { businessId: biz.id, id: { in: order } },
        select: { id: true },
      })
    ).map((c) => c.id)
  );

  await prisma.$transaction(
    order
      .filter((id) => owned.has(id))
      .map((id, i) =>
        prisma.fixedCostCategory.update({
          where: { id },
          data: { sortOrder: i },
        })
      )
  );
  // No revalidate — see reorderEmployees.
}
