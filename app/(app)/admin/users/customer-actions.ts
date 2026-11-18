"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/system-admin";
import { systemAdminEmails } from "@/lib/system-admin-policy";
import { DEFAULT_TX_CATEGORIES } from "@/lib/business-defaults";
const schema = z
  .object({
    businessName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().max(80).default(""),
  })
  .strict();
/** Atomic, new-tenant-only onboarding. No input business ID, existing-user
 * updates, financial records, demo data, copied integrations, or seed scripts. */
export async function createTrialCustomer(input: z.input<typeof schema>) {
  try {
    await requireSystemAdmin();
    const d = schema.parse(input);
    if (systemAdminEmails().includes(d.email))
      return {
        ok: false as const,
        message: "อีเมลนี้เป็นผู้ดูแลระบบ กรุณาใช้อีเมลลูกค้าอื่น",
      };
    const result = await prisma.$transaction(
      async (tx) => {
        if (
          await tx.user.findUnique({
            where: { email: d.email },
            select: { id: true },
          })
        )
          throw new Error("อีเมลนี้มีอยู่ในระบบแล้ว");
        const last = await tx.business.findFirst({
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        const business = await tx.business.create({
          data: {
            name: d.businessName,
            slug: `customer-${randomUUID()}`,
            active: true,
            sortOrder: (last?.sortOrder ?? 0) + 1,
          },
        });
        const user = await tx.user.create({
          data: { email: d.email, name: d.name || null, role: "OWNER" },
        });
        await tx.userBusiness.create({
          data: { userId: user.id, businessId: business.id },
        });
        await tx.transactionCategory.createMany({
          data: DEFAULT_TX_CATEGORIES.map((c, i) => ({
            businessId: business.id,
            name: c.name,
            kind: c.kind,
            posChannel: c.posChannel ?? null,
            sortOrder: i,
            active: true,
          })),
        });
        return {
          businessId: business.id,
          businessName: business.name,
          email: user.email,
        };
      },
      { isolationLevel: "Serializable", timeout: 15000 }
    );
    revalidatePath("/admin/users");
    revalidatePath("/admin/businesses");
    return { ok: true as const, ...result };
  } catch (e) {
    return {
      ok: false as const,
      message:
        e instanceof Error && /อีเมลนี้มีอยู่|เฉพาะผู้ดูแล/.test(e.message)
          ? e.message
          : (e as { code?: string })?.code === "P2002"
            ? "อีเมลนี้มีอยู่ในระบบแล้ว"
            : "สร้างบัญชีลูกค้าไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่",
    };
  }
}
