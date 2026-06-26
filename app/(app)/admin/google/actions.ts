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

/** Turn a googleapis error into a friendly Thai message. */
function gerr(e: unknown): string {
  const any = e as {
    response?: { data?: { error?: { message?: string } } };
    errors?: { message?: string }[];
    message?: string;
  };
  const msg =
    any?.response?.data?.error?.message ||
    any?.errors?.[0]?.message ||
    any?.message ||
    String(e);
  if (/Sheets API has not been used|Sheets API.*disabled/i.test(msg))
    return "ยังไม่ได้เปิด Google Sheets API ใน Google Cloud — เปิดแล้วรอ 1-2 นาที ลองใหม่";
  if (/Drive API has not been used|Drive API.*disabled/i.test(msg))
    return "ยังไม่ได้เปิด Google Drive API ใน Google Cloud — เปิดแล้วรอ 1-2 นาที ลองใหม่";
  if (
    /insufficient.*scope|insufficientPermissions|SCOPE_INSUFFICIENT/i.test(msg)
  )
    return "สิทธิ์ไม่พอ — กด ‘ตัดการเชื่อม’ แล้วเชื่อมใหม่ (กดอนุญาตให้ครบ)";
  if (/invalid_grant|expired or revoked/i.test(msg))
    return "การเชื่อมหมดอายุ — กด ‘ตัดการเชื่อม’ แล้วเชื่อมใหม่";
  return `Google error: ${msg}`;
}

export async function createStructure() {
  try {
    await requireOwner();
    const biz = await requireBusiness();
    await ensureStructure(biz.id);
    revalidatePath("/admin/google");
    return { ok: true as const };
  } catch (e) {
    console.error("[createStructure]", e);
    return { ok: false as const, message: gerr(e) };
  }
}

export async function syncNow() {
  try {
    await requireOwner();
    const biz = await requireBusiness();
    const tabs = await buildMasterTabs(biz.id);
    const url = await syncMaster(biz.id, tabs);
    revalidatePath("/admin/google");
    return { ok: true as const, url, tabs: tabs.length };
  } catch (e) {
    console.error("[syncNow]", e);
    return { ok: false as const, message: gerr(e) };
  }
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

// ───── LINE channel config ─────

const lineSchema = z.object({
  channelSecret: z.string().trim().max(200).optional(),
  channelToken: z.string().trim().max(4000).optional(),
});

export async function saveLineConfig(input: z.input<typeof lineSchema>) {
  try {
    await requireOwner();
    const biz = await requireBusiness();
    const data = lineSchema.parse(input);
    await prisma.business.update({
      where: { id: biz.id },
      data: {
        // only overwrite a field when a new value is given (blank = keep old)
        lineChannelSecret: data.channelSecret || undefined,
        lineChannelToken: data.channelToken || undefined,
      },
    });
    revalidatePath("/admin/google");
    return { ok: true as const };
  } catch (e) {
    console.error("[saveLineConfig]", e);
    return { ok: false as const, message: (e as Error).message ?? String(e) };
  }
}

export async function disconnectLine() {
  await requireOwner();
  const biz = await requireBusiness();
  await prisma.business.update({
    where: { id: biz.id },
    data: { lineChannelSecret: null, lineChannelToken: null },
  });
  revalidatePath("/admin/google");
  return { ok: true };
}
