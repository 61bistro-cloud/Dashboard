"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

async function requireOwner() {
  const session = await auth();
  if (!session || session.user.role !== "OWNER") {
    throw new Error("เฉพาะเจ้าของร้านเท่านั้นที่จัดการผู้ใช้ได้");
  }
  return session;
}

const roleSchema = z.enum(["OWNER", "ACCOUNTANT", "STAFF"]);

const addUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("รูปแบบอีเมลไม่ถูกต้อง"),
  name: z.string().trim().max(80).optional().default(""),
  role: roleSchema,
});

export async function addUser(input: z.input<typeof addUserSchema>) {
  await requireOwner();
  const data = addUserSchema.parse(input);

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    throw new Error("อีเมลนี้มีอยู่ในระบบแล้ว");
  }

  await prisma.user.create({
    data: {
      email: data.email,
      name: data.name || null,
      role: data.role as Role,
      // passwordHash left null — OAuth users only
    },
  });

  revalidatePath("/admin/users");
}

const updateRoleSchema = z.object({
  id: z.string().min(1),
  role: roleSchema,
});

export async function updateUserRole(input: z.input<typeof updateRoleSchema>) {
  const session = await requireOwner();
  const data = updateRoleSchema.parse(input);

  // Block demoting yourself — would lock you out of this page
  if (data.id === session.user.id && data.role !== "OWNER") {
    throw new Error(
      "เปลี่ยนสิทธิ์ของตัวเองไม่ได้ — ให้คนอื่นที่เป็น OWNER เป็นคนเปลี่ยนให้"
    );
  }

  await prisma.user.update({
    where: { id: data.id },
    data: { role: data.role as Role },
  });

  revalidatePath("/admin/users");
}

export async function deleteUser(id: string) {
  const session = await requireOwner();

  if (id === session.user.id) {
    throw new Error("ลบบัญชีตัวเองไม่ได้");
  }

  // Make sure there will still be at least one OWNER after deletion
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new Error("ไม่พบผู้ใช้");
  if (target.role === "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER" } });
    if (ownerCount <= 1) {
      throw new Error("ต้องมี OWNER อย่างน้อย 1 คนในระบบเสมอ");
    }
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
}
