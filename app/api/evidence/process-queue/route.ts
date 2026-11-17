import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readDocumentReview } from "@/lib/document-review";
import { processEvidenceDocument } from "@/lib/document-processing";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get("authorization");
  if (
    !secret ||
    !supplied ||
    !timingSafeEqual(
      createHash("sha256").update(supplied).digest(),
      createHash("sha256").update(`Bearer ${secret}`).digest()
    )
  )
    return new Response("unauthorized", { status: 401 });
  const rows = await prisma.driveFile.findMany({
    where: {
      kind: { in: ["SLIP", "BILL"] },
      AND: [{ note: { contains: "\nDOCUMENT_REVIEW_V1:" } }],
      business: { active: true },
      OR: [
        { note: { contains: '"state":"queued"' } },
        { note: { contains: '"state":"failed"' } },
        { note: { contains: '"state":"processing"' } },
      ],
    },
    orderBy: { id: "asc" },
    take: 50,
    select: { id: true, businessId: true, note: true },
  });
  const now = Date.now();
  let processed = 0;
  for (const row of rows) {
    if (processed >= 3 || Date.now() - now > 210000) break;
    const state = readDocumentReview(row.note);
    if (
      !state ||
      (state.retryAfter && new Date(state.retryAfter).getTime() > Date.now()) ||
      (state.state === "processing" &&
        Date.now() - new Date(state.checkedAt).getTime() < 120000)
    )
      continue;
    await processEvidenceDocument(row.businessId, row.id).catch(() => {});
    processed++;
  }
  return Response.json({ processed });
}
