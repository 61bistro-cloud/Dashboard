import { cookies } from "next/headers";
import { GOOGLE_STATE_COOKIE, newGoogleState } from "@/lib/google-oauth-state";
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
  const state = newGoogleState(session.user.id, biz.id);
  (await cookies()).set(GOOGLE_STATE_COOKIE, state.cookie, {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  const url = consentUrl(`${origin}/api/google/callback`, state.state);
  return Response.redirect(url);
}
