import { prisma } from "@/lib/prisma";
import {
  emptyStatementCosts,
  summarizeStatementCosts,
} from "@/lib/statement-costs";

export type StatementCostDetail = {
  id: number;
  categoryId: number | null;
  date: string;
  description: string;
  note: string | null;
  channel: string | null;
  amount: number;
  accountName: string;
  accountCode: string;
  accountType: string;
  evidence: { id: number; name: string; url: string }[];
};

/** Read-only drilldown for Cost Setup. Summary and rows use the same snapshot
 * of transactions, including receipt-only months and excluded withdrawals.
 * Call only after authenticating and resolving the user's current business.
 */
export async function getDetailedStatementExpenses(
  monthId: number,
  businessId: number
) {
  const transactions = await prisma.bankTransaction.findMany({
    where: { businessId, fiscalMonthId: monthId },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: {
      id: true,
      fiscalMonthId: true,
      categoryId: true,
      date: true,
      description: true,
      note: true,
      channel: true,
      withdraw: true,
      category: { select: { id: true, name: true, kind: true } },
      account: { select: { name: true, code: true, accountType: true } },
    },
  });
  const withdrawals = transactions.filter((tx) => tx.withdraw > 0);
  const files = withdrawals.length
    ? await prisma.driveFile.findMany({
        where: {
          businessId,
          fiscalMonthId: monthId,
          refType: "BANK_TX",
          refId: { in: withdrawals.map((tx) => String(tx.id)) },
        },
        orderBy: { id: "asc" },
        select: { id: true, refId: true, name: true, webViewLink: true },
      })
    : [];
  const evidence = new Map<string, StatementCostDetail["evidence"]>();
  for (const file of files) {
    if (!file.refId) continue;
    const group = evidence.get(file.refId) ?? [];
    group.push({ id: file.id, name: file.name, url: file.webViewLink });
    evidence.set(file.refId, group);
  }
  return {
    summary:
      summarizeStatementCosts(transactions).get(monthId) ??
      emptyStatementCosts(),
    details: withdrawals.map(
      (tx) =>
        ({
          id: tx.id,
          categoryId: tx.category?.id ?? null,
          date: tx.date.toISOString(),
          description: tx.description,
          note: tx.note,
          channel: tx.channel,
          amount: tx.withdraw,
          accountName: tx.account.name,
          accountCode: tx.account.code,
          accountType: tx.account.accountType,
          evidence: evidence.get(String(tx.id)) ?? [],
        }) satisfies StatementCostDetail
    ),
  };
}
