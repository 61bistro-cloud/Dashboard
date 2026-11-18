"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/system-admin";
import { isSystemAdmin } from "@/lib/system-admin-policy";
const roleSchema = z.enum(["OWNER", "ACCOUNTANT", "STAFF"]);
const businessIdsSchema = z
  .array(z.number().int().positive())
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "ข้อมูลธุรกิจซ้ำ");
async function assertBusinesses(tx: typeof prisma, ids: number[]) {
  if (
    (await tx.business.count({ where: { id: { in: ids }, active: true } })) !==
    ids.length
  )
    throw new Error("ไม่พบธุรกิจที่เลือกหรือธุรกิจปิดใช้งานแล้ว");
}
const addUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().max(80).optional().default(""),
    role: roleSchema,
    businessIds: businessIdsSchema.refine(
      (ids) => ids.length > 0,
      "กรุณาเลือกธุรกิจให้ผู้ใช้"
    ),
  })
  .strict();
export async function addUser(input: z.input<typeof addUserSchema>) {
  await requireSystemAdmin();
  const d = addUserSchema.parse(input);
  await prisma.$transaction(
    async (tx) => {
      await assertBusinesses(tx as typeof prisma, d.businessIds);
      if (
        await tx.user.findUnique({
          where: { email: d.email },
          select: { id: true },
        })
      )
        throw new Error("อีเมลนี้มีอยู่ในระบบแล้ว");
      const user = await tx.user.create({
        data: { email: d.email, name: d.name || null, role: d.role },
      });
      await tx.userBusiness.createMany({
        data: d.businessIds.map((businessId) => ({
          userId: user.id,
          businessId,
        })),
      });
    },
    { isolationLevel: "Serializable", timeout: 15000 }
  );
  revalidatePath("/admin/users");
}
export async function updateUserRole(input: {
  id: string;
  role: z.infer<typeof roleSchema>;
}) {
  await requireSystemAdmin();
  const d = z
    .object({ id: z.string().min(1), role: roleSchema })
    .strict()
    .parse(input);
  const target = await prisma.user.findUnique({
    where: { id: d.id },
    select: { id: true, email: true, role: true },
  });
  if (!target) throw new Error("ไม่พบผู้ใช้");
  if (isSystemAdmin(target))
    throw new Error("สิทธิ์ผู้ดูแลระบบต้องจัดการผ่านการตั้งค่าระบบ");
  await prisma.user.update({ where: { id: d.id }, data: { role: d.role } });
  revalidatePath("/admin/users");
}
export async function setUserBusinesses(input: {
  userId: string;
  businessIds: number[];
}) {
  await requireSystemAdmin();
  const d = z
    .object({ userId: z.string().min(1), businessIds: businessIdsSchema })
    .strict()
    .parse(input);
  await prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: d.userId },
        select: { id: true, email: true, role: true },
      });
      if (!target) throw new Error("ไม่พบผู้ใช้");
      if (isSystemAdmin(target))
        throw new Error("ผู้ดูแลระบบเข้าถึงธุรกิจผ่านสิทธิ์ระบบ");
      await assertBusinesses(tx as typeof prisma, d.businessIds);
      await tx.userBusiness.deleteMany({ where: { userId: d.userId } });
      if (d.businessIds.length)
        await tx.userBusiness.createMany({
          data: d.businessIds.map((businessId) => ({
            userId: d.userId,
            businessId,
          })),
        });
    },
    { isolationLevel: "Serializable", timeout: 15000 }
  );
  revalidatePath("/admin/users");
}
/** Revoke access without deleting user, POS import audit, bills or financials. */
export async function deleteUser(id: string) {
  await requireSystemAdmin();
  z.string().min(1).parse(id);
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!target) throw new Error("ไม่พบผู้ใช้");
  if (isSystemAdmin(target))
    throw new Error("สิทธิ์ผู้ดูแลระบบต้องจัดการผ่านการตั้งค่าระบบ");
  await prisma.userBusiness.deleteMany({ where: { userId: id } });
  revalidatePath("/admin/users");
}
