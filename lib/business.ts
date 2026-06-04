import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type BusinessLite = {
  id: number;
  name: string;
  slug: string;
};

export const BUSINESS_COOKIE = "businessId";

/**
 * Businesses the current user may access.
 *   OWNER         → every active business (super-admin)
 *   ACCOUNTANT /  → only businesses linked via UserBusiness
 *   STAFF
 */
export async function getAccessibleBusinesses(): Promise<BusinessLite[]> {
  const session = await auth();
  if (!session) return [];

  if (session.user.role === "OWNER") {
    return prisma.business.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true },
    });
  }

  const links = await prisma.userBusiness.findMany({
    where: { userId: session.user.id, business: { active: true } },
    orderBy: { business: { sortOrder: "asc" } },
    select: {
      business: { select: { id: true, name: true, slug: true } },
    },
  });
  return links.map((l) => l.business);
}

/**
 * The business the user is currently working in.
 * Reads the `businessId` cookie and validates it against the accessible
 * list (falls back to the first accessible business). Null = no access.
 */
export async function getCurrentBusiness(): Promise<BusinessLite | null> {
  const accessible = await getAccessibleBusinesses();
  if (accessible.length === 0) return null;
  const store = await cookies();
  const id = Number(store.get(BUSINESS_COOKIE)?.value);
  return accessible.find((b) => b.id === id) ?? accessible[0];
}

/**
 * Like getCurrentBusiness but throws — for use in server actions where a
 * missing business is a hard error, never a render fallback.
 */
export async function requireBusiness(): Promise<BusinessLite> {
  const biz = await getCurrentBusiness();
  if (!biz) {
    throw new Error("ไม่มีสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน");
  }
  return biz;
}
