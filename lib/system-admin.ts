import "server-only";
import { auth } from "@/auth";
export async function requireSystemAdmin() {
  const session = await auth();
  if (!session?.user.isSystemAdmin || session.user.role !== "OWNER")
    throw new Error("เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการลูกค้าและธุรกิจได้");
  return session;
}
