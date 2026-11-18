"use client";
import { useState } from "react";
import Link from "next/link";
import { useUi } from "@/lib/i18n/use-ui";
import { fmtTHB } from "@/lib/fiscal";
import { summarizeGrab } from "@/lib/grab-report";
import type { getGrabMonth } from "@/lib/grab-data";
type Data = Awaited<ReturnType<typeof getGrabMonth>>;
const money = (n: number) => fmtTHB(n / 100);
const cell = "px-3 py-2.5 align-top";
export function GrabDetails({
  data,
  monthId,
}: {
  data: Data;
  monthId: number;
}) {
  const { ui } = useUi();
  const [orderLimit, setOrderLimit] = useState(50),
    [payoutLimit, setPayoutLimit] = useState(50);
  const total = summarizeGrab(data.rows);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["grab.sales", total.sales],
          ["grab.gp", total.gp],
          ["grab.net", total.net],
          ["grab.crossMonth", data.crossMonth],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-card border border-hairline bg-canvas p-4"
          >
            <p className="text-xs leading-5 text-muted">{ui(String(label))}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {money(Number(value))}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-card border border-hairline bg-surface p-4 text-xs leading-6 space-y-1">
        <p>{ui("grab.taxInfo {v0}", { v0: money(total.feeTax) })}</p>
        <p>{ui("grab.otherInfo {v0}", { v0: money(total.other) })}</p>
        <p>{ui("grab.policy")}</p>
        <Link className="underline" href={`/cost-setup?month=${monthId}`}>
          {ui("grab.checkCosts")}
        </Link>
      </div>
      <section className="rounded-card border border-hairline overflow-hidden">
        <header className="p-4 border-b border-hairline">
          <h2 className="text-sm font-semibold">{ui("grab.posTitle")}</h2>
          <p className="text-xs text-muted leading-6 mt-1">
            {ui("grab.posHelp")}
          </p>
          <p className="text-xs mt-1">
            {ui("grab.posTotals {v0} {v1} {v2}", {
              v0: money(data.pos.posSales),
              v1: money(data.pos.posRevenue),
              v2: money(data.pos.posSales - total.sales),
            })}
          </p>
          <Link
            className="text-xs underline"
            href={`/pos-sales?month=${monthId}`}
          >
            {ui("grab.openPos")}
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-xs">
            <thead className="bg-surface">
              <tr>
                {[
                  "grab.date",
                  "grab.grabOrders",
                  "grab.posOrders",
                  "grab.sales",
                  "grab.posAmount",
                  "grab.diff",
                ].map((k) => (
                  <th key={k} className={cell + " text-left"}>
                    {ui(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {data.pos.days.map((d) => (
                <tr key={d.date}>
                  <td className={cell}>{d.date}</td>
                  <td className={cell}>{d.grabCount}</td>
                  <td className={cell}>{d.posCount}</td>
                  <td className={cell}>{money(d.sales)}</td>
                  <td className={cell}>{money(d.posSales)}</td>
                  <td
                    className={
                      cell +
                      (d.difference ? " text-amber-600" : " text-emerald-600")
                    }
                  >
                    {money(d.difference)}
                    <span className="block text-[10px]">
                      {ui(
                        d.grabCount === 0
                          ? "grab.noReportDay"
                          : d.difference === 0 && d.grabCount === d.posCount
                            ? "grab.dailyEqual"
                            : "grab.check"
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface font-semibold">
              <tr>
                <td className={cell}>{ui("grab.total")}</td>
                <td className={cell}>{total.count}</td>
                <td className={cell}>{data.pos.posCount}</td>
                <td className={cell}>{money(total.sales)}</td>
                <td className={cell}>{money(data.pos.posSales)}</td>
                <td className={cell}>
                  {money(data.pos.posSales - total.sales)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <details className="rounded-card border border-hairline overflow-hidden">
        <summary className="cursor-pointer p-4 text-sm font-semibold">
          {ui("grab.orderTitle {v0}", { v0: total.count })}
        </summary>
        <p className="px-4 pb-3 text-xs text-muted leading-6">
          {ui("grab.orderHelp")}
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-[850px] w-full text-xs">
            <thead className="bg-surface">
              <tr>
                {[
                  "grab.date",
                  "grab.order",
                  "grab.sales",
                  "grab.gp",
                  "grab.net",
                  "grab.posStatus",
                  "grab.posBill",
                ].map((k) => (
                  <th key={k} className={cell + " text-left"}>
                    {ui(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {data.pos.orders.slice(0, orderLimit).map((m) => (
                <tr key={m.key}>
                  <td className={cell + " whitespace-nowrap"}>
                    {m.row.saleDate}
                  </td>
                  <td className={cell}>
                    <p>{m.row.shortOrderId}</p>
                    <p className="text-muted max-w-64 break-all text-[10px]">
                      {m.row.orderId}
                    </p>
                  </td>
                  <td className={cell}>{money(m.row.sales)}</td>
                  <td className={cell}>{money(-m.row.commission)}</td>
                  <td className={cell}>{money(m.row.net)}</td>
                  <td className={cell}>{ui("grab.status." + m.status)}</td>
                  <td className={cell + " max-w-64 break-all"}>
                    {m.candidateIds.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.pos.orders.length > orderLimit && (
          <button
            className="m-4 text-xs underline"
            onClick={() => setOrderLimit((n) => n + 50)}
          >
            {ui("grab.more")}
          </button>
        )}
      </details>
      <section className="rounded-card border border-hairline overflow-hidden">
        <header className="p-4 border-b border-hairline">
          <h2 className="text-sm font-semibold">{ui("grab.payoutTitle")}</h2>
          <p className="text-xs text-muted leading-6 mt-1">
            {ui("grab.payoutHelp")}
          </p>
          <p className="text-xs mt-1">
            {ui("grab.transfersInMonth {v0}", {
              v0: money(data.receivedInMonth),
            })}
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-[850px] w-full text-xs">
            <thead className="bg-surface">
              <tr>
                {[
                  "grab.transferDate",
                  "grab.settlement",
                  "grab.grabOrders",
                  "grab.net",
                  "grab.bankStatus",
                  "grab.bankCandidates",
                ].map((k) => (
                  <th key={k} className={cell + " text-left"}>
                    {ui(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {data.payouts.slice(0, payoutLimit).map((p) => (
                <tr key={p.key}>
                  <td className={cell}>{p.date}</td>
                  <td className={cell + " break-all"}>{p.settlementId}</td>
                  <td className={cell}>{p.count}</td>
                  <td className={cell}>{money(p.net)}</td>
                  <td className={cell}>{ui("grab.bank." + p.status)}</td>
                  <td className={cell}>
                    {p.candidates.map((c) => (
                      <Link
                        key={c.id}
                        className="block underline"
                        href={`/bank?month=${c.fiscalMonthId}&account=${encodeURIComponent(c.accountCode)}#transaction-${c.id}`}
                      >
                        {c.accountName} · #{c.id}
                      </Link>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.payouts.length > payoutLimit && (
          <button
            className="m-4 text-xs underline"
            onClick={() => setPayoutLimit((n) => n + 50)}
          >
            {ui("grab.more")}
          </button>
        )}
      </section>
      <details className="rounded-card border border-hairline">
        <summary className="cursor-pointer p-4 text-sm font-semibold">
          {ui("grab.originals {v0}", { v0: data.reports.length })}
        </summary>
        <ul className="px-4 pb-4 space-y-2 text-xs">
          {data.reports.map((r) => (
            <li key={r.id}>
              <a
                className="underline break-all"
                target="_blank"
                rel="noopener noreferrer"
                href={r.webViewLink}
              >
                {r.name}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
