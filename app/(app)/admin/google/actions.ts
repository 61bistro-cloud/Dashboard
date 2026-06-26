"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/business";
import { ensureStructure, syncMaster, uploadEvidence } from "@/lib/google";
import { buildMasterTabs } from "@/lib/google-sheets-data";

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("unauthorized");
  if (session.user.role !== "OWNER") throw new Error("forbidden");
  return session;
}

export async function createStructure() {
  await requireOwner();
  const biz = await requireBusiness();
  await ensureStructure(biz.id);
  revalidatePath("/admin/google");
  return { ok: true };
}

export async function syncNow() {
  await requireOwner();
  const biz = await requireBusiness();
  const tabs = await buildMasterTabs(biz.id);
  const url = await syncMaster(biz.id, tabs);
  revalidatePath("/admin/google");
  return { ok: true, url, tabs: tabs.length };
}

export async function disconnectGoogle() {
  await requireOwner();
  const biz = await requireBusiness();
  await prisma.business.update({
    where: { id: biz.id },
    data: {
      googleRefreshToken: null,
      googleEmail: null,
      driveRootFolderId: null,
      driveSlipFolderId: null,
      driveBillFolderId: null,
      masterSheetId: null,
      googleSyncedAt: null,
    },
  });
  revalidatePath("/admin/google");
  return { ok: true };
}

const uploadSchema = z.object({
  kind: z.enum(["SLIP", "BILL"]),
  fiscalMonthId: z.coerce.number().int().positive().optional(),
  note: z.string().max(200).optional(),
});

export async function uploadEvidenceFile(formData: FormData) {
  try {
    const session = await auth();
    if (!session) return { ok: false, message: "unauthorized" };
    if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
      return { ok: false, message: "forbidden" };
    }
    const biz = await requireBusiness();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "ไม่มีไฟล์" };
    }
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, message: "ไฟล์ใหญ่เกิน 15MB" };
    }
    const parsed = uploadSchema.safeParse({
      kind: formData.get("kind"),
      fiscalMonthId: formData.get("fiscalMonthId") || undefined,
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };
    }
    const { kind, fiscalMonthId, note } = parsed.data;

    // month folder name = "YYYY-MM" (calendar) for tidy grouping
    let monthFolder: string | null = null;
    if (fiscalMonthId) {
      const fm = await prisma.fiscalMonth.findUnique({
        where: { id: fiscalMonthId },
        select: { calendarYear: true, calendarMonth: true },
      });
      if (fm) {
        monthFolder = `${fm.calendarYear}-${String(fm.calendarMonth).padStart(2, "0")}`;
      }
    }

    const mimeType =
      file.type && file.type.length ? file.type : "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const { driveFileId, webViewLink } = await uploadEvidence(
      biz.id,
      kind,
      monthFolder,
      { name: file.name || "evidence", mimeType, buffer }
    );

    await prisma.driveFile.create({
      data: {
        businessId: biz.id,
        kind,
        fiscalMonthId: fiscalMonthId ?? null,
        driveFileId,
        webViewLink,
        name: file.name || "evidence",
        mimeType,
        uploadedByName: session.user.name || session.user.email || null,
        note: note || null,
      },
    });

    revalidatePath("/admin/google");
    return { ok: true, webViewLink };
  } catch (e) {
    console.error("[uploadEvidenceFile]", e);
    return { ok: false, message: (e as Error).message ?? String(e) };
  }
}
