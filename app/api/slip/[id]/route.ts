import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";

// Serve a slip image straight from the DB, scoped to the caller's business so
// one tenant can never read another's slips by guessing an id.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new Response("unauthorized", { status: 401 });
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    return new Response("forbidden", { status: 403 });
  }
  const biz = await getCurrentBusiness();
  if (!biz) return new Response("no business", { status: 403 });

  const { id } = await ctx.params;
  const slip = await prisma.slip.findFirst({
    where: { id: Number(id), businessId: biz.id },
    select: { imageData: true, mimeType: true },
  });
  if (!slip) return new Response("not found", { status: 404 });

  return new Response(Buffer.from(slip.imageData), {
    headers: {
      "Content-Type": slip.mimeType || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
