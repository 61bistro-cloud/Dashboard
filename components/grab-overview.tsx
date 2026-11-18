import Link from "next/link";
import { Bike } from "lucide-react";
import { getGrabReports, rowsFromGrabReports } from "@/lib/grab-data";
import { summarizeGrab } from "@/lib/grab-report";
import { isGrabBill } from "@/lib/pos-channel";
import { prisma } from "@/lib/prisma";
import { fmtTHB } from "@/lib/fiscal";
import { getUi } from "@/lib/i18n/server";
import { displayMonth } from "@/lib/i18n/core";
export async function GrabOverview({
  businessId,
  yearBE,
}: {
  businessId: number;
  yearBE: number;
}) {
  const { ui, uiLocale } = await getUi();
  const months = await prisma.fiscalMonth.findMany({
    where: { year: { yearBE } },
    orderBy: { monthIndex: "asc" },
  });
  if (!months.length) return null;
  let rows: ReturnType<typeof rowsFromGrabReports>;
  try {
    rows = rowsFromGrabReports(await getGrabReports(businessId));
  } catch {
    return (
      <p className="rounded-card border border-hairline p-4 text-sm">
        {ui("grab.stored")}
      </p>
    );
  }
  const prefix = (m: (typeof months)[number]) =>
    `${m.calendarYear}-${String(m.calendarMonth).padStart(2, "0")}`;
  const yearRows = rows.filter((r) =>
    months.some((m) => r.saleDate.startsWith(prefix(m)))
  );
  const total = summarizeGrab(yearRows);
  const bills = await prisma.posBill.findMany({
    where: {
      businessId,
      businessDate: {
        gte: prefix(months[0]) + "-01",
        lte: prefix(months.at(-1)!) + "-31",
      },
    },
    select: {
      businessDate: true,
      netAmount: true,
      grandTotal: true,
      channel: true,
      paymentType: true,
    },
  });
  const grabBills = bills.filter(isGrabBill);
  const hasReport = yearRows.length > 0;
  return (
    <section className="rounded-card border border-hairline overflow-hidden">
      <header className="p-4 sm:p-5 border-b border-hairline flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex gap-2 items-center">
            <Bike className="h-4 w-4" />
            {ui("grab.dashboardTitle")}
          </h2>
          <p className="mt-1 text-xs text-muted leading-6">
            {ui("grab.dashboardHelp")}
          </p>
        </div>
        <Link
          className="rounded-pill border border-hairline px-4 py-2 text-xs"
          href="/bank/grab"
        >
          {ui("grab.open")}
        </Link>
      </header>
      <div className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          [
            "grab.posRevenue",
            grabBills.reduce((s, b) => s + Math.round(b.netAmount * 100), 0),
          ],
          ["grab.sales", hasReport ? total.sales : null],
          ["grab.gp", hasReport ? total.gp : null],
          ["grab.net", hasReport ? total.net : null],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-muted leading-5">{ui(String(k))}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {v === null ? "—" : fmtTHB(Number(v) / 100)}
            </p>
          </div>
        ))}
      </div>
      {hasReport ? (
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-xs">
            <thead className="bg-surface">
              <tr>
                {[
                  "grab.monthLabel",
                  "grab.posAmount",
                  "grab.sales",
                  "grab.gp",
                  "grab.net",
                  "grab.diff",
                ].map((k) => (
                  <th key={k} className="text-left p-3">
                    {ui(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {months
                .filter((m) =>
                  yearRows.some((r) => r.saleDate.startsWith(prefix(m)))
                )
                .map((m) => {
                  const summary = summarizeGrab(
                      yearRows.filter((r) => r.saleDate.startsWith(prefix(m)))
                    ),
                    pos = grabBills
                      .filter((b) => b.businessDate.startsWith(prefix(m)))
                      .reduce((s, b) => s + Math.round(b.grandTotal * 100), 0);
                  return (
                    <tr key={m.id}>
                      <td className="p-3">
                        <Link
                          className="underline"
                          href={`/bank/grab?month=${m.id}`}
                        >
                          {displayMonth(m.fullLabel, uiLocale)}
                        </Link>
                      </td>
                      {[
                        pos,
                        summary.sales,
                        summary.gp,
                        summary.net,
                        pos - summary.sales,
                      ].map((n, i) => (
                        <td key={i} className="p-3 tabular-nums">
                          {fmtTHB(n / 100)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 pb-4 text-xs text-muted">
          {ui("grab.emptyDashboard")}
        </p>
      )}
      <p className="px-5 py-3 border-t border-hairline bg-surface text-xs text-muted leading-6">
        {ui("grab.policy")}
      </p>
    </section>
  );
}
