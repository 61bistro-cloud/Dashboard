import "server-only";
import { prisma } from "./prisma";
import { supportsStatement } from "./bank-account-options";
import {
  decodeGrabReport,
  GRAB_REPORT_KIND,
  uniqueGrabRows,
} from "./grab-report";
import { reconcileGrabBank, reconcileGrabPos } from "./grab-reconciliation";
export async function getGrabReports(businessId: number) {
  return prisma.driveFile.findMany({
    where: { businessId, kind: GRAB_REPORT_KIND },
    select: {
      id: true,
      name: true,
      note: true,
      webViewLink: true,
      createdAt: true,
      fiscalMonthId: true,
    },
    orderBy: { id: "asc" },
  });
}
export function rowsFromGrabReports(reports: { note: string | null }[]) {
  return uniqueGrabRows(reports.flatMap((r) => decodeGrabReport(r.note).rows));
}
export async function getGrabMonth(
  businessId: number,
  month: {
    id: number;
    calendarYear: number;
    calendarMonth: number;
    daysInMonth: number;
  }
) {
  const prefix = `${month.calendarYear}-${String(month.calendarMonth).padStart(2, "0")}`;
  const start = prefix + "-01",
    end = `${prefix}-${month.daysInMonth}`;
  const reports = await getGrabReports(businessId);
  const allRows = rowsFromGrabReports(reports);
  const rows = allRows.filter((r) => r.saleDate.startsWith(prefix));
  // Match the FULL known payout group even when it includes sales from another
  // month. Partial report coverage is always disclosed; no bank link is saved.
  const payoutDates = [
    ...new Set(
      allRows
        .filter(
          (r) =>
            r.saleDate.startsWith(prefix) || r.transferDate.startsWith(prefix)
        )
        .map((r) => r.transferDate)
    ),
  ];
  const payoutRows = allRows.filter((r) =>
    payoutDates.includes(r.transferDate)
  );
  const [bills, credits] = await Promise.all([
    prisma.posBill.findMany({
      where: { businessId, businessDate: { gte: start, lte: end } },
      select: {
        id: true,
        businessDate: true,
        netAmount: true,
        grandTotal: true,
        paymentType: true,
        channel: true,
        invoiceNo: true,
        note: true,
      },
    }),
    payoutDates.length
      ? prisma.bankTransaction.findMany({
          where: {
            businessId,
            deposit: { gt: 0 },
            date: {
              gte: new Date(payoutDates.sort()[0] + "T00:00:00Z"),
              lt: new Date(
                new Date(payoutDates.at(-1)! + "T00:00:00Z").getTime() +
                  86400000
              ),
            },
            account: { businessId, accountType: "BANK" },
          },
          select: {
            id: true,
            fiscalMonthId: true,
            date: true,
            deposit: true,
            description: true,
            account: { select: { code: true, name: true, accountType: true } },
            category: { select: { businessId: true, posChannel: true } },
          },
        })
      : [],
  ]);
  return {
    rows,
    reports: reports
      .filter((r) => r.fiscalMonthId === month.id)
      .map(({ note, ...r }) => r),
    pos: reconcileGrabPos(rows, bills),
    payouts: reconcileGrabBank(
      payoutRows,
      credits
        .filter((c) => supportsStatement(c.account))
        .map((c) => ({
          id: c.id,
          fiscalMonthId: c.fiscalMonthId,
          date: c.date.toISOString().slice(0, 10),
          deposit: c.deposit,
          description: c.description,
          accountCode: c.account.code,
          accountName: c.account.name,
          grabCategory:
            c.category?.businessId === businessId &&
            c.category.posChannel === "GRAB",
        }))
    ),
    receivedInMonth: allRows
      .filter((r) => r.transferDate.startsWith(prefix))
      .reduce((s, r) => s + r.net, 0),
    crossMonth: rows
      .filter((r) => !r.transferDate.startsWith(prefix))
      .reduce((s, r) => s + r.net, 0),
  };
}
