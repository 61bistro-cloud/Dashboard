import { prisma } from "@/lib/prisma";

export const THAI_MONTH_LABELS = [
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
];

export const PAYROLL_EXTRA_LABELS = {
  OT: "OT รวม",
  BONUS: "โบนัส",
  EXTRA: "ค่าจ้างพิเศษ / Extra",
  SERVICE_CHARGE: "Service Charge 3% (ส่วนแบ่งพนักงาน)",
} as const;

export const SUPPLIER_CATEGORY_LABELS = {
  FOOD: { label: "ต้นทุนวัตถุดิบอาหาร (Food Cost)" },
  BEVERAGE: { label: "ต้นทุนเครื่องดื่ม (Beverage)" },
  PACKAGING: { label: "บรรจุภัณฑ์ (Packaging)" },
} as const;

/** Map calendar (year, month) → fiscal monthIndex (1=Apr ... 12=Mar) */
export function calendarToFiscalIndex(calendarMonth: number): number {
  // calendarMonth: 1-12 → fiscal: Jan=10, Feb=11, Mar=12, Apr=1, ..., Dec=9
  return ((calendarMonth - 4 + 12) % 12) + 1;
}

/** Map calendar (year, month) → fiscal yearBE (BE = year + 543, with Apr boundary) */
export function calendarToFiscalYearBE(
  calendarYear: number,
  calendarMonth: number
): number {
  // Apr 2026 → 2569 ; Mar 2027 → 2569 ; Apr 2027 → 2570
  const calendarFiscalStartYear =
    calendarMonth >= 4 ? calendarYear : calendarYear - 1;
  return calendarFiscalStartYear + 543;
}

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

/** Format number as Thai Baht with 2 decimals; 0 → "-" */
export function fmtTHB(n: number | null | undefined): string {
  if (n == null || n === 0) return "-";
  const negative = n < 0;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return negative ? `(${formatted})` : formatted;
}
