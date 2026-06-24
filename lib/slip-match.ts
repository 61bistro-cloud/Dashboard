import { prisma } from "@/lib/prisma";

export type SlipCandidate = {
  id: number;
  date: Date;
  deposit: number;
  withdraw: number;
  description: string;
  accountId: number;
  accountName: string;
  /** already linked to a CONFIRMED slip — shouldn't be auto-picked again */
  alreadyLinked: boolean;
};

/**
 * Bank-statement rows whose amount equals the slip amount (either side — a slip
 * can be money in OR out), optionally restricted to one account and a date window
 * around the transfer time.
 */
export async function findCandidates(
  businessId: number,
  opts: {
    accountId?: number | null;
    amount: number | null;
    transferAt?: Date | null;
    windowDays?: number;
  }
): Promise<SlipCandidate[]> {
  if (
    opts.amount == null ||
    !Number.isFinite(opts.amount) ||
    opts.amount <= 0
  ) {
    return [];
  }
  const amt = Math.round(opts.amount * 100) / 100;
  const lo = amt - 0.01;
  const hi = amt + 0.01;

  const where: {
    businessId: number;
    OR: Array<Record<string, unknown>>;
    accountId?: number;
    date?: { gte: Date; lte: Date };
  } = {
    businessId,
    OR: [{ deposit: { gte: lo, lte: hi } }, { withdraw: { gte: lo, lte: hi } }],
  };
  if (opts.accountId) where.accountId = opts.accountId;
  if (opts.transferAt) {
    const w = opts.windowDays ?? 3;
    const a = new Date(opts.transferAt);
    a.setUTCDate(a.getUTCDate() - w);
    const b = new Date(opts.transferAt);
    b.setUTCDate(b.getUTCDate() + w);
    where.date = { gte: a, lte: b };
  }

  const rows = await prisma.bankTransaction.findMany({
    where,
    include: { account: { select: { name: true } } },
    orderBy: { date: "asc" },
    take: 30,
  });

  const linked = await prisma.slip.findMany({
    where: {
      businessId,
      status: "CONFIRMED",
      matchedTxId: { in: rows.map((r) => r.id) },
    },
    select: { matchedTxId: true },
  });
  const linkedSet = new Set(linked.map((l) => l.matchedTxId));

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    deposit: r.deposit,
    withdraw: r.withdraw,
    description: r.description,
    accountId: r.accountId,
    accountName: r.account.name,
    alreadyLinked: linkedSet.has(r.id),
  }));
}

/** Pick the single best free candidate. ambiguous=true when >1 free match. */
export function pickBest(
  cands: SlipCandidate[],
  transferAt?: Date | null
): { matchedTxId: number | null; ambiguous: boolean } {
  const free = cands.filter((c) => !c.alreadyLinked);
  if (free.length === 0) return { matchedTxId: null, ambiguous: false };
  if (free.length === 1) return { matchedTxId: free[0].id, ambiguous: false };
  if (transferAt) {
    const t = transferAt.getTime();
    const sorted = [...free].sort(
      (a, b) => Math.abs(a.date.getTime() - t) - Math.abs(b.date.getTime() - t)
    );
    return { matchedTxId: sorted[0].id, ambiguous: true };
  }
  return { matchedTxId: null, ambiguous: true };
}
