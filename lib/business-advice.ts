/** Read-only scenario mathematics. Rates are fractions; all targets use POS net sales. */
export type AdviceCost = {
  key: string;
  name: string;
  amount: number;
  variable: boolean;
};
export function monthTiming(
  year: number,
  month: number,
  days: number,
  now = new Date()
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const current = today.slice(0, 7);
  return {
    today,
    phase:
      key < current
        ? ("past" as const)
        : key > current
          ? ("future" as const)
          : ("current" as const),
    remainingDays:
      key < current
        ? 0
        : key > current
          ? days
          : days - Number(today.slice(8)) + 1,
  };
}
export function calculateAdvice(input: {
  revenue: number;
  billCount: number;
  fixed: number;
  variableRate: number;
  profitGoal: number;
  openDays: number;
  remainingDays: number;
  averageBill: number | null;
}) {
  const {
    revenue,
    billCount,
    fixed,
    variableRate,
    profitGoal,
    openDays,
    remainingDays,
    averageBill,
  } = input;
  if (
    ![
      revenue,
      billCount,
      fixed,
      variableRate,
      profitGoal,
      openDays,
      remainingDays,
    ].every(Number.isFinite) ||
    revenue < 0 ||
    billCount < 0 ||
    fixed < 0 ||
    profitGoal < 0 ||
    variableRate < 0 ||
    variableRate >= 1 ||
    !Number.isInteger(openDays) ||
    openDays < 1 ||
    openDays > 31 ||
    !Number.isInteger(remainingDays) ||
    remainingDays < 0 ||
    remainingDays > openDays ||
    (averageBill !== null &&
      (!Number.isFinite(averageBill) || averageBill <= 0))
  )
    return null;
  const contribution = 1 - variableRate;
  const breakEven = fixed / contribution;
  const target = (fixed + profitGoal) / contribution;
  const remainingTarget =
    remainingDays > 0 ? Math.max(0, target - revenue) / remainingDays : null;
  const remainingBreakEven =
    remainingDays > 0 ? Math.max(0, breakEven - revenue) / remainingDays : null;
  const result = {
    contribution,
    breakEven,
    target,
    dailyBreakEven: breakEven / openDays,
    dailyTarget: target / openDays,
    remainingTarget,
    remainingBreakEven,
    billsPerDay:
      averageBill === null ? null : Math.ceil(target / openDays / averageBill),
    remainingBills:
      averageBill === null || remainingTarget === null
        ? null
        : Math.ceil(remainingTarget / averageBill),
    fixedSaving: (fixed * 0.1) / contribution,
  };
  return Object.values(result).every((v) => v === null || Number.isFinite(v))
    ? result
    : null;
}
export function numericInput(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
