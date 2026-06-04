"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BUSINESS_COOKIE, getAccessibleBusinesses } from "@/lib/business";
import { seedBusinessDefaults } from "@/lib/business-defaults";

async function requireOwner() {
  const session = await auth();
  if (!session || session.user.role !== "OWNER") {
    throw new Error("เฉพาะเจ้าของร้านเท่านั้นที่จัดการธุรกิจได้");
  }
  return session;
}

/**
 * Switch the active business. Validates the target is one the user may
 * actually access before writing the cookie, then refreshes the whole app.
 */
export async function switchBusiness(businessId: number) {
  const accessible = await getAccessibleBusinesses();
  if (!accessible.some((b) => b.id === businessId)) {
    throw new Error("ไม่มีสิทธิ์เข้าถึงธุรกิจนี้");
  }
  const store = await cookies();
  store.set(BUSINESS_COOKIE, String(businessId), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return base || "business";
}

const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อธุรกิจ").max(80),
});

/** Create a new business + seed its default bank accounts & categories. */
export async function createBusiness(
  input: z.input<typeof createBusinessSchema>
) {
  await requireOwner();
  const data = createBusinessSchema.parse(input);

  // Ensure a unique slug
  let slug = slugify(data.name);
  let n = 1;
  while (await prisma.business.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${slugify(data.name)}-${n}`;
  }

  const last = await prisma.business.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const created = await prisma.business.create({
    data: { name: data.name, slug, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });

  await seedBusinessDefaults(created.id);

  revalidatePath("/", "layout");
  return { id: created.id };
}

const renameBusinessSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "ต้องระบุชื่อธุรกิจ").max(80),
});

export async function renameBusiness(
  input: z.input<typeof renameBusinessSchema>
) {
  await requireOwner();
  const data = renameBusinessSchema.parse(input);
  await prisma.business.update({
    where: { id: data.id },
    data: { name: data.name },
  });
  revalidatePath("/", "layout");
}

/** Soft enable/disable a business (hidden from switcher when inactive). */
export async function setBusinessActive(id: number, active: boolean) {
  await requireOwner();
  if (!active) {
    const remaining = await prisma.business.count({ where: { active: true } });
    if (remaining <= 1) {
      throw new Error("ต้องมีธุรกิจที่ใช้งานอยู่อย่างน้อย 1 แห่ง");
    }
  }
  await prisma.business.update({ where: { id }, data: { active } });
  revalidatePath("/", "layout");
}
