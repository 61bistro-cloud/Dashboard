"use server";
import { auth } from "@/auth";
import { requireBusiness } from "@/lib/business";
import { askDocumentAi } from "@/lib/openrouter-documents";
export async function testDocumentAi(businessId: number) {
  const session = await auth();
  if (!session || session.user.role !== "OWNER")
    return { status: "forbidden" as const };
  const business = await requireBusiness();
  if (business.id !== businessId) return { status: "forbidden" as const };
  const result = await askDocumentAi(
    business.id,
    "ใบเสร็จทดสอบระบบ ไม่ใช่เอกสารจริง\nวันที่ 01/10/2569\nรายการ กล่องอาหาร\nยอดรวม 100.00 บาท\nหมายเหตุ: ซื้อบรรจุภัณฑ์"
  );
  return { status: result.status };
}
