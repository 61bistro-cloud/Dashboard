import { auth } from "@/auth";
import { getCurrentBusiness } from "@/lib/business";
import { consentUrl, googleConfigured } from "@/lib/google";

// Kick off the Google consent flow for Drive + Sheets (offline access).
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OWNER") {
    return new Response("forbidden", { status: 403 });
  }
  if (!googleConfigured()) {
    return new Response("ยังไม่ได้ตั้งค่า AUTH_GOOGLE_ID/SECRET", {
      status: 500,
    });
  }
  const biz = await getCurrentBusiness();
  if (!biz) return new Response("no business", { status: 403 });

  const origin = new URL(req.url).origin;
  const url = consentUrl(`${origin}/api/google/callback`, String(biz.id));
  return Response.redirect(url);
}
