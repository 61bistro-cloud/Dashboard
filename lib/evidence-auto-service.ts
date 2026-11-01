import { prisma } from "@/lib/prisma";
import { readEvidenceOcr } from "@/lib/evidence-match";
import { mergeConfirmedRemark } from "@/lib/evidence-category";
import {
  decideEvidenceAutomation,
  writeAutoEvidenceStatus,
  type AutoEvidenceStatus,
} from "@/lib/evidence-auto";

/** The caller supplies an authenticated business scope. No external network in
 * the transaction; link, category and audit status commit or roll back together.
 */
export async function applyEvidenceAutomation(
  businessId: number,
  monthId: number,
  fileId: number,
  accountId?: number
): Promise<Omit<AutoEvidenceStatus, "checkedAt">> {
  return prisma.$transaction(async (tx) => {
    const scope = { id: fileId, businessId, fiscalMonthId: monthId };
    const file = await tx.driveFile.findFirst({
      where: { ...scope, kind: { in: ["SLIP", "BILL"] } },
    });
    if (!file)
      return { status: "review", message: "ไม่พบหลักฐานในธุรกิจและเดือนนี้" };
    const record = async (result: Omit<AutoEvidenceStatus, "checkedAt">) => {
      const updated = await tx.driveFile.updateMany({
        where: {
          ...scope,
          note: file.note,
          refType: file.refType,
          refId: file.refId,
        },
        data: { note: writeAutoEvidenceStatus(file.note, result) },
      });
      if (!updated.count) throw new Error("ข้อมูลหลักฐานเปลี่ยนไปแล้ว");
      return result;
    };
    if (file.refType && file.refType !== "BANK_TX")
      return record({
        status: "skipped",
        message: "หลักฐานนี้แนบกับข้อมูลประเภทอื่นอยู่แล้ว",
      });
    const ocr = readEvidenceOcr(file.note);
    if (!ocr)
      return record({
        status: "review",
        message: "อ่านข้อความไม่สำเร็จ กรุณาตรวจรูปหรือกรอกข้อมูลเอง",
      });
    const month = await tx.fiscalMonth.findUnique({
      where: { id: monthId },
      select: { calendarYear: true, calendarMonth: true },
    });
    if (
      !month ||
      (ocr.date &&
        !ocr.date.startsWith(
          `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}-`
        ))
    )
      return record({
        status: "review",
        message: "วันที่ในสลิปไม่อยู่ในเดือนที่เลือก กรุณาตรวจเดือนก่อนจัดหมวด",
      });
    const [rows, categories] = await Promise.all([
      tx.bankTransaction.findMany({
        where: { businessId, fiscalMonthId: monthId },
        include: {
          account: { select: { name: true } },
          category: { select: { name: true } },
        },
      }),
      tx.transactionCategory.findMany({
        where: { businessId, active: true },
        select: { id: true, name: true, kind: true },
      }),
    ]);
    const transactions = rows.map((row) => ({
      ...row,
      date: row.date.toISOString(),
      accountName: row.account.name,
      categoryName: row.category?.name ?? null,
    }));
    const linkedId = file.refType === "BANK_TX" ? Number(file.refId) : null;
    const decision = decideEvidenceAutomation(
      ocr,
      transactions,
      categories,
      linkedId,
      accountId
    );
    if (decision.status !== "apply") return record(decision);
    const target = decision.transaction;
    const updated = await tx.bankTransaction.updateMany({
      where: {
        id: target.id,
        businessId,
        fiscalMonthId: monthId,
        categoryId: target.categoryId ?? null,
        note: target.note ?? null,
      },
      data: {
        categoryId: decision.categoryId,
        note: mergeConfirmedRemark(
          target.note ?? null,
          file.id,
          decision.remark
        ),
      },
    });
    if (!updated.count) throw new Error("หมวดหรือรายการเปลี่ยนไปแล้ว");
    const result = {
      status: "applied" as const,
      message: "จับคู่และจัดหมวดอัตโนมัติแล้ว",
      transactionId: target.id,
      categoryId: decision.categoryId,
    };
    const linked = await tx.driveFile.updateMany({
      where: {
        ...scope,
        note: file.note,
        refType: file.refType,
        refId: file.refId,
      },
      data: {
        refType: "BANK_TX",
        refId: String(target.id),
        note: writeAutoEvidenceStatus(file.note, result),
      },
    });
    if (!linked.count) throw new Error("คู่หลักฐานเปลี่ยนไประหว่างทำรายการ");
    return result;
  });
}
