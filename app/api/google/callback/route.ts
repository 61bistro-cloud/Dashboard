import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBusinesses } from "@/lib/business";
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
  const businessId = Number(state);

  // Only let the owner connect a business they can actually access.
  const accessible = await getAccessibleBusinesses();
  if (!accessible.some((b) => b.id === businessId)) {
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
