"use server";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { requireBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { uploadGrabReport } from "@/lib/google";
import { getGrabReports, rowsFromGrabReports } from "@/lib/grab-data";
import {
  GRAB_MAX_BYTES,
  GRAB_REPORT_KIND,
  GrabError,
  encodeGrabReport,
  parseGrabCsv,
  grabKey,
  summarizeGrab,
  type GrabRow,
} from "@/lib/grab-report";
import { revalidatePath } from "next/cache";

function checkRows(rows: GrabRow[], existing: GrabRow[], prefix: string) {
  if (rows.some((r) => !r.saleDate.startsWith(prefix)))
    throw new GrabError("grab.month");
  if (
    existing.length &&
    rows.some(
      (r) =>
        r.storeId !== existing[0].storeId ||
        r.merchantId !== existing[0].merchantId
    )
  )
    throw new GrabError("grab.storeMismatch");
  const map = new Map(existing.map((r) => [grabKey(r), r]));
  for (const row of rows) {
    const old = map.get(grabKey(row));
    if (old && JSON.stringify(old) !== JSON.stringify(row))
      throw new GrabError("grab.conflict");
  }
  return rows.filter((r) => !map.has(grabKey(r)));
}
function revision(
  bytes: Buffer,
  businessId: number,
  monthId: number,
  reports: { id: number; note: string | null }[]
) {
  return createHash("sha256")
    .update(bytes)
    .update(
      JSON.stringify([businessId, monthId, reports.map((r) => [r.id, r.note])])
    )
    .digest("hex");
}
/** The preview and commit both parse the original bytes on the server. The
 * commit accepts no client-supplied totals, normalized rows or Drive IDs. */
export async function importGrabCsv(form: FormData) {
  try {
    const session = await auth();
    if (!session || !["OWNER", "ACCOUNTANT"].includes(session.user.role))
      return { ok: false as const, message: "grab.forbidden" };
    const biz = await requireBusiness();
    if (String(biz.id) !== String(form.get("businessId")))
      throw new GrabError("grab.business");
    const monthId = Number(form.get("monthId"));
    if (!Number.isSafeInteger(monthId) || monthId <= 0)
      throw new GrabError("grab.month");
    const month = await prisma.fiscalMonth.findUnique({
      where: { id: monthId },
    });
    if (!month) throw new GrabError("grab.month");
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > GRAB_MAX_BYTES ||
      !file.name.toLowerCase().endsWith(".csv")
    )
      throw new GrabError("grab.size");
    const bytes = Buffer.from(await file.arrayBuffer());
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new GrabError("grab.format");
    }
    const report = parseGrabCsv(source);
    const prefix = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}`;
    const reports = await getGrabReports(biz.id);
    const newRows = checkRows(
      report.rows,
      rowsFromGrabReports(reports),
      prefix
    );
    const token = revision(bytes, biz.id, monthId, reports);
    if (form.get("mode") === "preview")
      return {
        ok: true as const,
        preview: {
          token,
          storeName: report.rows[0].storeName,
          storeId: report.rows[0].storeId,
          summary: summarizeGrab(report.rows),
          newCount: newRows.length,
          duplicateCount: report.rows.length - newRows.length,
          from: report.rows.map((r) => r.saleDate).sort()[0],
          to: report.rows
            .map((r) => r.saleDate)
            .sort()
            .at(-1)!,
        },
      };
    if (
      form.get("mode") !== "commit" ||
      form.get("confirmed") !== "true" ||
      form.get("token") !== token
    )
      throw new GrabError("grab.stale");
    if (!newRows.length)
      return {
        ok: true as const,
        saved: 0,
        duplicateCount: report.rows.length,
      };
    const connected = await prisma.business.findUnique({
      where: { id: biz.id },
      select: { googleRefreshToken: true },
    });
    if (!connected?.googleRefreshToken) throw new GrabError("grab.connect");
    const original = await uploadGrabReport(biz.id, prefix, {
      name: file.name.slice(0, 240),
      mimeType: "text/csv",
      buffer: bytes,
    });
    const saved = await prisma.$transaction(
      async (tx) => {
        const current = await tx.driveFile.findMany({
          where: { businessId: biz.id, kind: GRAB_REPORT_KIND },
          select: { id: true, note: true },
          orderBy: { id: "asc" },
        });
        if (revision(bytes, biz.id, monthId, current) !== token)
          throw new GrabError("grab.stale");
        const added = checkRows(
          report.rows,
          rowsFromGrabReports(current),
          prefix
        );
        await tx.driveFile.create({
          data: {
            businessId: biz.id,
            kind: GRAB_REPORT_KIND,
            fiscalMonthId: monthId,
            ...original,
            name: file.name.slice(0, 240),
            mimeType: "text/csv",
            uploadedByName: session.user.name || session.user.email || null,
            note: encodeGrabReport({ version: 1, rows: added }),
          },
        });
        return added.length;
      },
      { isolationLevel: "Serializable", timeout: 15000 }
    );
    for (const path of ["/bank/grab", "/bank", "/", "/admin/google"])
      revalidatePath(path);
    return {
      ok: true as const,
      saved,
      duplicateCount: report.rows.length - saved,
    };
  } catch (e) {
    // No financial rows, POS bills, costs or existing documents are updated.
    // If Drive upload succeeded but DB commit failed, retain the original there.
    return {
      ok: false as const,
      message:
        e instanceof GrabError
          ? e.code
          : (e as { code?: string })?.code === "P2034"
            ? "grab.stale"
            : "grab.failed",
    };
  }
}
