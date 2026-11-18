import { grabKey, grabPayouts, type GrabRow } from "./grab-report";
import { isGrabBill } from "./pos-channel";
export type GrabPosBill = {
  id: string;
  businessDate: string;
  netAmount: number;
  grandTotal: number;
  paymentType: string | null;
  channel: string | null;
  invoiceNo: string | null;
  note: string | null;
};
export type GrabBankCredit = {
  id: number;
  fiscalMonthId: number;
  date: string;
  deposit: number;
  description: string;
  accountCode: string;
  accountName: string;
  grabCategory: boolean;
};
const toCents = (amount: number) => Math.round(amount * 100);
const containsRef = (source: string, ref: string) =>
  !!ref && source.split(/[^A-Za-z0-9_-]+/).includes(ref);
export function reconcileGrabPos(rows: GrabRow[], allBills: GrabPosBill[]) {
  const bills = allBills.filter(isGrabBill);
  const matches = rows.map((row) => {
    const references = bills.filter((b) =>
      [b.id, b.invoiceNo, b.note].some(
        (v) =>
          v &&
          [row.orderId, row.transactionId, row.bookingId].some((ref) =>
            containsRef(v, ref)
          )
      )
    );
    const candidates = references.length
      ? references
      : bills.filter(
          (b) =>
            b.businessDate === row.saleDate &&
            toCents(b.grandTotal) === row.sales
        );
    return { row, candidates, reference: references.length > 0 };
  });
  const uses = new Map<string, number>();
  for (const match of matches)
    for (const b of match.candidates) uses.set(b.id, (uses.get(b.id) ?? 0) + 1);
  const orders = matches.map(({ row, candidates, reference }) => ({
    key: grabKey(row),
    row,
    candidateIds: candidates.map((b) => b.id),
    status:
      candidates.length !== 1 || uses.get(candidates[0]?.id) !== 1
        ? candidates.length
          ? "ambiguous"
          : "missing"
        : reference
          ? toCents(candidates[0].grandTotal) === row.sales
            ? "reference"
            : "amount_diff"
          : "suggested",
  }));
  const days = [
    ...new Set([
      ...rows.map((r) => r.saleDate),
      ...bills.map((b) => b.businessDate),
    ]),
  ]
    .sort()
    .map((date) => {
      const grab = rows.filter((r) => r.saleDate === date),
        pos = bills.filter((b) => b.businessDate === date);
      const sales = grab.reduce((s, r) => s + r.sales, 0),
        posSales = pos.reduce((s, b) => s + toCents(b.grandTotal), 0);
      return {
        date,
        sales,
        posSales,
        difference: posSales - sales,
        grabCount: grab.length,
        posCount: pos.length,
      };
    });
  return {
    orders,
    days,
    posCount: bills.length,
    posSales: bills.reduce((s, b) => s + toCents(b.grandTotal), 0),
    posRevenue: bills.reduce((s, b) => s + toCents(b.netAmount), 0),
  };
}
export function reconcileGrabBank(rows: GrabRow[], credits: GrabBankCredit[]) {
  const batches = grabPayouts(rows);
  const matches = batches.map((batch) => {
    const candidates = credits.filter(
      (c) =>
        c.date === batch.date &&
        toCents(c.deposit) === batch.net &&
        (c.grabCategory ||
          /grab/i.test(c.description) ||
          containsRef(c.description, batch.settlementId))
    );
    return { batch, candidates };
  });
  const uses = new Map<number, number>();
  for (const m of matches)
    for (const c of m.candidates) uses.set(c.id, (uses.get(c.id) ?? 0) + 1);
  return matches.map(({ batch, candidates }) => ({
    ...batch,
    candidates,
    status:
      candidates.length === 1 && uses.get(candidates[0].id) === 1
        ? "suggested"
        : candidates.length
          ? "ambiguous"
          : "missing",
  }));
}
