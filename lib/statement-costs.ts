/** Shared cash-basis expense classification for Cost Setup and all live P&Ls. */
export const COST_BUCKET_LABELS = {
  food: "วัตถุดิบอาหาร / จัดซื้อ",
  bev: "เครื่องดื่ม",
  pack: "บรรจุภัณฑ์",
  laborBase: "เงินเดือน",
  laborExtra: "ค่าจ้าง / OT / พิเศษ",
  fixed: "ค่าใช้จ่ายดำเนินงานอื่น",
} as const;
export type CostBucket = keyof typeof COST_BUCKET_LABELS;
export type CostAmounts = Record<CostBucket, number>;
export type ExpenseStatus = CostBucket | "pending" | "excluded";
export type StatementCostTx = {
  fiscalMonthId: number;
  withdraw: number;
  category: { id: number; name: string; kind: string } | null;
  account: { accountType: string };
};
export type StatementCostRow = {
  categoryId: number | null;
  name: string;
  status: ExpenseStatus;
  bankAmount: number;
  cardAmount: number;
  total: number;
  count: number;
};
export type StatementCostSummary = {
  hasTransactions: boolean;
  amounts: CostAmounts;
  rows: StatementCostRow[];
  bankTotal: number;
  cardTotal: number;
  grandTotal: number;
  withdrawalTotal: number;
  pendingTotal: number;
  excludedTotal: number;
};
export function emptyCosts(): CostAmounts {
  return { food: 0, bev: 0, pack: 0, laborBase: 0, laborExtra: 0, fixed: 0 };
}
export function emptyStatementCosts(): StatementCostSummary {
  return {
    hasTransactions: false,
    amounts: emptyCosts(),
    rows: [],
    bankTotal: 0,
    cardTotal: 0,
    grandTotal: 0,
    withdrawalTotal: 0,
    pendingTotal: 0,
    excludedTotal: 0,
  };
}

export function classifyExpense(
  category: StatementCostTx["category"]
): ExpenseStatus {
  if (category?.kind === "TRANSFER") return "excluded";
  if (!category || category.kind !== "EXPENSE") return "pending";
  const name = category.name;
  // These legacy default categories were EXPENSE even though they are balance
  // movements. Count card purchases once, never the later repayment as well.
  if (
    /ชำระบัตรเครดิต|ชำระค่าบัตร|credit\s*card\s*(payment|repayment)|เบิกเงิน.*ผู้บริหาร|โอนให้ผู้บริหาร|เบิกล่วงหน้า|owner.?s?\s*draw/i.test(
      name
    )
  )
    return "excluded";
  if (/เครื่องดื่ม|beverage/i.test(name)) return "bev";
  if (/แพ็ค|แพ็ก|บรรจุภัณฑ์|packaging/i.test(name)) return "pack";
  if (/เงินเดือน|salary|salaries/i.test(name)) return "laborBase";
  if (/ค่าจ้าง|\bot\b|โบนัส|ค่าแรง|wage|labor|labour/i.test(name))
    return "laborExtra";
  if (/วัตถุดิบ|ซื้อสินค้า|จัดซื้อ|ต้นทุนอาหาร|\bfood\b/i.test(name))
    return "food";
  return "fixed";
}
const cents = (amount: number) => Math.round(amount * 100);

/** Pure aggregation: cents throughout, keyed by assigned fiscal month (same as Bank). */
export function summarizeStatementCosts(
  txs: StatementCostTx[]
): Map<number, StatementCostSummary> {
  const months = new Map<number, StatementCostSummary>();
  for (const tx of txs) {
    let summary = months.get(tx.fiscalMonthId);
    if (!summary) {
      summary = emptyStatementCosts();
      months.set(tx.fiscalMonthId, summary);
    }
    summary.hasTransactions = true;
    if (!(tx.withdraw > 0)) continue;
    const amount = cents(tx.withdraw);
    const status = classifyExpense(tx.category);
    summary.withdrawalTotal += amount;
    if (status === "pending") summary.pendingTotal += amount;
    else if (status === "excluded") summary.excludedTotal += amount;
    else {
      summary.amounts[status] += amount;
      if (tx.account.accountType === "CREDIT_CARD") summary.cardTotal += amount;
      else summary.bankTotal += amount;
      summary.grandTotal += amount;
    }
    let row = summary.rows.find(
      (row) => row.categoryId === (tx.category?.id ?? null)
    );
    if (!row) {
      row = {
        categoryId: tx.category?.id ?? null,
        name: tx.category?.name ?? "ยังไม่จัดหมวด",
        status,
        bankAmount: 0,
        cardAmount: 0,
        total: 0,
        count: 0,
      };
      summary.rows.push(row);
    }
    if (tx.account.accountType === "CREDIT_CARD") row.cardAmount += amount;
    else row.bankAmount += amount;
    row.total += amount;
    row.count++;
  }
  for (const summary of months.values()) {
    for (const key of Object.keys(summary.amounts) as CostBucket[])
      summary.amounts[key] /= 100;
    for (const key of [
      "withdrawalTotal",
      "pendingTotal",
      "excludedTotal",
      "bankTotal",
      "cardTotal",
      "grandTotal",
    ] as const)
      summary[key] /= 100;
    for (const row of summary.rows) {
      row.bankAmount /= 100;
      row.cardAmount /= 100;
      row.total /= 100;
    }
    summary.rows.sort((a, b) => b.total - a.total);
  }
  return months;
}

/** One source per month prevents a statement payment duplicating a manual cost.
 * Manual books remain the fallback until Bank & Reconcile has data for a month.
 */
export function resolveCostAmounts(
  manual: CostAmounts,
  statement?: StatementCostSummary
): CostAmounts {
  return statement?.hasTransactions ? { ...statement.amounts } : { ...manual };
}
