"use server";
import { z } from "zod";
import { auth } from "@/auth";
import { requireBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getManualCostData } from "@/lib/manual-cost-data";
import {
  COST_GROUPS,
  GROUP_MARKER,
  SUPPLIER_GROUP_MARKER,
} from "@/lib/cost-plan";

const schema = z.object({
  businessId: z.number().int().positive(),
  fiscalMonthId: z.number().int().positive(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  items: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        source: z.enum(["supplier", "category"]),
        name: z.string().trim().min(1).max(120),
        amount: z
          .number()
          .finite()
          .min(0)
          .max(99_999_999)
          .transform((value) => Math.round(value * 100) / 100),
        group: z.enum([
          "raw",
          "condiments",
          "beverage",
          "packaging",
          "freight",
          "labor",
          "selling",
          "occupancy",
          "admin",
        ]),
      })
    )
    .max(500),
});
export async function saveManualCostPlan(input: z.input<typeof schema>) {
  try {
    const session = await auth();
    if (!session || !["OWNER", "ACCOUNTANT"].includes(session.user.role))
      throw Error("ไม่มีสิทธิ์");
    const business = await requireBusiness();
    const data = schema.safeParse(input);
    if (!data.success) throw Error("กรุณาตรวจชื่อรายการ หมวด และจำนวนเงิน");
    const d = data.data;
    if (business.id !== d.businessId)
      throw Error("ธุรกิจเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า");
    const result = await prisma.$transaction(
      async (tx) => {
        if (
          !(await tx.fiscalMonth.findUnique({
            where: { id: d.fiscalMonthId },
            select: { id: true },
          }))
        )
          throw Error("ไม่พบเดือนนี้");
        const closing = await tx.monthlyClosing.findUnique({
          where: {
            businessId_fiscalMonthId: {
              businessId: business.id,
              fiscalMonthId: d.fiscalMonthId,
            },
          },
          select: { status: true },
        });
        if (closing && closing.status !== "OPEN")
          throw Error("เดือนนี้ปิดบัญชีแล้ว กรุณาเปิดบัญชีก่อนแก้ไข");
        const current = await getManualCostData(
          business.id,
          d.fiscalMonthId,
          tx
        );
        if (current.revision !== d.revision)
          throw Error("ข้อมูลต้นทุนเปลี่ยนไปแล้ว กรุณารีเฟรชและตรวจสอบใหม่");
        const keys = new Set<string>(),
          names = new Set<string>();
        for (const item of d.items) {
          if (item.name.startsWith("__supplier_group_"))
            throw Error("กรุณาเปลี่ยนชื่อรายการที่สงวนไว้สำหรับระบบ");
          const key = `${item.source}:${item.id}`;
          if (
            item.id &&
            (keys.has(key) ||
              !current.items.some(
                (r) => r.id === item.id && r.source === item.source
              ))
          )
            throw Error("ไม่พบรายการนี้ในธุรกิจปัจจุบัน");
          if (item.id) keys.add(key);
          if (item.source === "supplier" && !item.id)
            throw Error("ไม่พบรายการผู้จำหน่ายเดิม");
          if (item.source === "category") {
            const name = item.name.toLocaleLowerCase();
            if (
              names.has(name) ||
              current.categories.some(
                (c) =>
                  c.name === item.name &&
                  c.id !== item.id &&
                  !current.items.some(
                    (r) => r.source === "category" && r.id === c.id
                  ) &&
                  (c.active ||
                    c.icon?.startsWith("cost-setup:payroll-extra") ||
                    c.icon?.startsWith(SUPPLIER_GROUP_MARKER))
              )
            )
              throw Error("มีหมวดชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น");
            names.add(name);
          }
        }
        let order = Math.max(0, ...current.categories.map((c) => c.sortOrder));
        for (const item of d.items) {
          if (item.source === "supplier") {
            const supplier = current.suppliers.find((s) => s.id === item.id)!;
            await tx.supplierPurchase.upsert({
              where: {
                supplierId_fiscalMonthId: {
                  supplierId: supplier.id,
                  fiscalMonthId: d.fiscalMonthId,
                },
              },
              update: {
                amount: item.amount,
                nameOverride: item.name === supplier.name ? null : item.name,
              },
              create: {
                businessId: business.id,
                fiscalMonthId: d.fiscalMonthId,
                supplierId: supplier.id,
                amount: item.amount,
                nameOverride: item.name === supplier.name ? null : item.name,
              },
            });
            const name = `__supplier_group_${supplier.id}`;
            if (
              current.categories.some(
                (c) =>
                  c.name === name && !c.icon?.startsWith(SUPPLIER_GROUP_MARKER)
              )
            )
              throw Error("กรุณาเปลี่ยนชื่อหมวดที่ขัดแย้งกับข้อมูลระบบ");
            await tx.fixedCostCategory.upsert({
              where: { businessId_name: { businessId: business.id, name } },
              update: {
                icon: `${SUPPLIER_GROUP_MARKER}${supplier.id}:${item.group}`,
              },
              create: {
                businessId: business.id,
                name,
                icon: `${SUPPLIER_GROUP_MARKER}${supplier.id}:${item.group}`,
                active: false,
                sortOrder: 0,
              },
            });
          } else {
            const restoredId =
              item.id ??
              current.categories.find((c) => !c.active && c.name === item.name)
                ?.id;
            const category = restoredId
              ? await tx.fixedCostCategory.update({
                  where: { id: restoredId, businessId: business.id },
                  data: {
                    name: item.name,
                    icon: GROUP_MARKER + item.group,
                    active: true,
                  },
                })
              : await tx.fixedCostCategory.create({
                  data: {
                    businessId: business.id,
                    name: item.name,
                    icon: GROUP_MARKER + item.group,
                    active: true,
                    sortOrder: ++order,
                  },
                });
            await tx.fixedCost.upsert({
              where: {
                categoryId_fiscalMonthId: {
                  categoryId: category.id,
                  fiscalMonthId: d.fiscalMonthId,
                },
              },
              update: { amount: item.amount },
              create: {
                businessId: business.id,
                categoryId: category.id,
                fiscalMonthId: d.fiscalMonthId,
                amount: item.amount,
              },
            });
          }
        }
        for (const item of current.items) {
          if (d.items.some((r) => r.id === item.id && r.source === item.source))
            continue;
          if (item.source === "supplier") {
            await tx.supplierPurchase.deleteMany({
              where: {
                businessId: business.id,
                fiscalMonthId: d.fiscalMonthId,
                supplierId: item.id,
              },
            });
            await tx.supplier.update({
              where: { id: item.id, businessId: business.id },
              data: { active: false },
            });
          } else {
            await tx.fixedCost.deleteMany({
              where: {
                businessId: business.id,
                fiscalMonthId: d.fiscalMonthId,
                categoryId: item.id,
              },
            });
            await tx.fixedCostCategory.update({
              where: { id: item.id, businessId: business.id },
              data: { active: false },
            });
          }
        }
        const updated = await getManualCostData(
          business.id,
          d.fiscalMonthId,
          tx
        );
        return { items: updated.items, revision: updated.revision };
      },
      { isolationLevel: "Serializable", timeout: 30_000 }
    );
    for (const path of [
      "/cost-setup",
      "/",
      "/daily-pl",
      "/monthly-pl",
      "/closing",
      "/closing-print",
    ])
      revalidatePath(path);
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error &&
        /เดือนนี้ปิดบัญชี|ไม่มีสิทธิ์|กรุณาตรวจ|ธุรกิจเปลี่ยน|ไม่พบ|ข้อมูลต้นทุน|หมวดต้นทุนขาย|มีหมวด/.test(
          error.message
        )
          ? error.message
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่",
    };
  }
}
