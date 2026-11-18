import { cookies } from "next/headers";
import {
  GOOGLE_STATE_COOKIE,
  validGoogleState,
  googleStateBusiness,
} from "@/lib/google-oauth-state";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { exchangeCode } from "@/lib/google";

// Google redirects here after consent. Store the refresh token on the business.
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OWNER") {
    return new Response("forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err || !code || !state) {
    return Response.redirect(`${origin}/admin/google?error=denied`);
  }
  const store = await cookies();
  const savedState = store.get(GOOGLE_STATE_COOKIE)?.value;
  store.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/google" });
  const businessId = googleStateBusiness(savedState);
  const current = await getCurrentBusiness();
  if (
    !businessId ||
    current?.id !== businessId ||
    !validGoogleState(savedState, state, session.user.id, businessId)
  ) {
    return Response.redirect(`${origin}/admin/google?error=forbidden`);
  }

  try {
    const { refreshToken, email } = await exchangeCode(
      `${origin}/api/google/callback`,
      code
    );
    if (!refreshToken) {
      return Response.redirect(`${origin}/admin/google?error=norefresh`);
    }
    await prisma.business.update({
      where: { id: businessId },
      data: { googleRefreshToken: refreshToken, googleEmail: email },
    });
    return Response.redirect(`${origin}/admin/google?connected=1`);
  } catch (e) {
    console.error("[google/callback]", e);
    return Response.redirect(`${origin}/admin/google?error=exchange`);
  }
}
