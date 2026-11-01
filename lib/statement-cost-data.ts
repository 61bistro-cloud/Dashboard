import { prisma } from "@/lib/prisma";
import { summarizeStatementCosts } from "@/lib/statement-costs";

export async function getStatementCostSummaries(
  monthIds: number[],
  businessId: number
) {
  if (monthIds.length === 0)
    return new Map<number, import("./statement-costs").StatementCostSummary>();
  const transactions = await prisma.bankTransaction.findMany({
    where: { businessId, fiscalMonthId: { in: monthIds } },
    select: {
      fiscalMonthId: true,
      withdraw: true,
      category: { select: { id: true, name: true, kind: true } },
      account: { select: { accountType: true } },
    },
  });
  return summarizeStatementCosts(transactions);
}
