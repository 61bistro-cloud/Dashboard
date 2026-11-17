import "server-only";
import { prisma } from "@/lib/prisma";
import { calendarToFiscalIndex, calendarToFiscalYearBE } from "./fiscal";

/** Get the FiscalMonth row matching the current calendar date (or the most recent past one). */
export async function getCurrentFiscalMonth(now: Date = new Date()) {
  const yearBE = calendarToFiscalYearBE(now.getFullYear(), now.getMonth() + 1);
  const year = await prisma.fiscalYear.findUnique({ where: { yearBE } });
  if (!year) {
    // fall back to whichever year exists
    const any = await prisma.fiscalYear.findFirst({
      orderBy: { yearBE: "desc" },
    });
    if (!any) return null;
    return prisma.fiscalMonth.findFirst({
      where: { yearId: any.id },
      orderBy: { monthIndex: "asc" },
    });
  }
  const monthIndex = calendarToFiscalIndex(now.getMonth() + 1);
  return prisma.fiscalMonth.findUnique({
    where: { yearId_monthIndex: { yearId: year.id, monthIndex } },
  });
}
