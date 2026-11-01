/** Stay below Vercel's 4.5 MB request limit, including multipart overhead. */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
export type EvidenceUploadItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  message?: string;
};
export type EvidenceUploadContext = {
  businessId: number;
  kind: "SLIP" | "BILL";
  fiscalMonthId: string;
};

/** Each action carries one file; a large selection never becomes one oversized
 * request. Keep IDs on retries so the server can recognize completed uploads.
 */
export async function uploadEvidenceQueue(
  items: EvidenceUploadItem[],
  context: EvidenceUploadContext,
  upload: (data: FormData) => Promise<{ ok: boolean; message?: string }>,
  update: (
    id: string,
    status: EvidenceUploadItem["status"],
    message?: string
  ) => void
) {
  let succeeded = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === "success") continue;
    if (item.file.size === 0 || item.file.size > MAX_EVIDENCE_BYTES) {
      failed++;
      update(
        item.id,
        "error",
        item.file.size === 0
          ? "ไฟล์ว่าง"
          : "ไฟล์ใหญ่เกิน 4 MB กรุณาลดขนาดแล้วเลือกใหม่"
      );
      continue;
    }
    if (
      !item.file.type.startsWith("image/") &&
      item.file.type !== "application/pdf"
    ) {
      failed++;
      update(item.id, "error", "รองรับไฟล์รูปภาพหรือ PDF เท่านั้น");
      continue;
    }
    update(item.id, "uploading");
    try {
      const data = new FormData();
      data.append("businessId", String(context.businessId));
      data.append("kind", context.kind);
      data.append("fiscalMonthId", context.fiscalMonthId);
      data.append("uploadId", item.id);
      data.append("file", item.file);
      const result = await upload(data);
      if (result.ok) {
        succeeded++;
        update(item.id, "success");
      } else {
        failed++;
        update(item.id, "error", result.message || "อัปโหลดไม่สำเร็จ");
      }
    } catch {
      failed++;
      update(
        item.id,
        "error",
        "การเชื่อมต่อขัดข้อง ตรวจรายการใน Drive ก่อนลองใหม่"
      );
    }
  }
  return { succeeded, failed };
}
