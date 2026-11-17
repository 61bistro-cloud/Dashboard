import { PAYROLL_EXTRA_LABELS } from "@/lib/payroll-labels";

// Reserved category markers use the existing optional icon field. This keeps
// deployment schema-compatible; only an explicit user save writes these rows.
export const EXTRA_MARKER = "cost-setup:payroll-extra";
export const OTHER_MARKER = "cost-setup:other";
export type LegacyExtraType = keyof typeof PAYROLL_EXTRA_LABELS;
export type FlexibleCostRow = {
  id?: number;
  legacyType?: LegacyExtraType;
  name: string;
  amount: number;
};
export function isPayrollExtraCategory(icon?: string | null) {
  return icon === EXTRA_MARKER || icon?.startsWith(EXTRA_MARKER + ":") === true;
}
export function isOtherCostCategory(icon?: string | null) {
  return icon === OTHER_MARKER;
}
export function legacyExtraType(
  icon?: string | null
): LegacyExtraType | undefined {
  const type = icon?.slice(EXTRA_MARKER.length + 1);
  return type && Object.hasOwn(PAYROLL_EXTRA_LABELS, type)
    ? (type as LegacyExtraType)
    : undefined;
}
export function extraMarker(type?: LegacyExtraType) {
  return type ? `${EXTRA_MARKER}:${type}` : EXTRA_MARKER;
}

type Category = {
  id: number;
  name: string;
  icon: string | null;
  active: boolean;
};
type Cost = { categoryId: number; amount: number };
export function payrollExtraRows(
  categories: Category[],
  costs: Cost[],
  legacy: { type: LegacyExtraType; amount: number }[]
): FlexibleCostRow[] {
  const amounts = new Map(costs.map((c) => [c.categoryId, c.amount]));
  const legacyAmounts = new Map(legacy.map((e) => [e.type, e.amount]));
  const result: FlexibleCostRow[] = [];
  for (const type of Object.keys(PAYROLL_EXTRA_LABELS) as LegacyExtraType[]) {
    const category = categories.find((c) => legacyExtraType(c.icon) === type);
    const amount = category
      ? (amounts.get(category.id) ?? legacyAmounts.get(type) ?? 0)
      : (legacyAmounts.get(type) ?? 0);
    if (!category || category.active || amount !== 0)
      result.push({
        id: category?.id,
        legacyType: type,
        name: category?.name ?? PAYROLL_EXTRA_LABELS[type],
        amount,
      });
  }
  for (const category of categories) {
    if (
      !isPayrollExtraCategory(category.icon) ||
      legacyExtraType(category.icon)
    )
      continue;
    const amount = amounts.get(category.id) ?? 0;
    if (category.active || amount !== 0)
      result.push({ id: category.id, name: category.name, amount });
  }
  return result;
}

/** Client-side feedback before invoking the server's authoritative validation. */
export function validateFlexibleCostRows(rows: FlexibleCostRow[]) {
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim().toLocaleLowerCase();
    if (!name) throw new Error("ต้องระบุชื่อรายการ");
    if (names.has(name)) throw new Error("มีรายการซ้ำ กรุณาตรวจชื่อและรายการ");
    if (
      !Number.isFinite(row.amount) ||
      row.amount < 0 ||
      row.amount > 99_999_999
    )
      throw new Error("จำนวนเงินไม่ถูกต้อง");
    names.add(name);
  }
}
