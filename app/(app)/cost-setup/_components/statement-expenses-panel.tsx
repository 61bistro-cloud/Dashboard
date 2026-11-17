"use client";

import { Fragment, useId, useMemo, useState } from "react";
import type { StatementCostDetail } from "@/lib/statement-cost-details";
import { useUi } from "@/lib/i18n/use-ui";
import Link from "next/link";
import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import { fmtTHB } from "@/lib/fiscal";
import {
  COST_BUCKET_LABELS,
  type StatementCostSummary,
} from "@/lib/statement-costs";

export function StatementExpensesPanel({
  summary,
  details,
  manualTotal,
  monthId,
}: {
  summary: StatementCostSummary;
  details: StatementCostDetail[];
  manualTotal: number;
  monthId: number;
}) {
  const { ui } = useUi();
  const panelId = useId();
  const [expanded, setExpanded] = useState<Set<number | null>>(new Set());
  const grouped = useMemo(() => {
    const groups = new Map<number | null, StatementCostDetail[]>();
    for (const detail of details) {
      const items = groups.get(detail.categoryId) ?? [];
      items.push(detail);
      groups.set(detail.categoryId, items);
    }
    return groups;
  }, [details]);
  const toggle = (id: number | null) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-soft" />
          {ui("สรุปรายจ่ายจาก Bank & Reconcile")}
        </h2>
        <p className="text-xs text-muted mt-1">
          {ui(
            "รวมทุกบัญชีและบัตรเครดิตตามเดือนที่บันทึก • จัดหมวดหรือแก้ไขรายการที่"
          )}{" "}
          <Link href={`/bank?month=${monthId}`} className="underline">
            {ui("Bank & Reconcile")}
          </Link>{" "}
          {ui("แล้วสรุปจะอัปเดตอัตโนมัติ")}
        </p>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
        {(
          [
            [ui("เงินออกทั้งหมด"), summary.withdrawalTotal],
            [ui("ค่าใช้จ่ายเข้า P&L"), summary.grandTotal],
            [ui("รอจัดหมวด / ตรวจสอบ"), summary.pendingTotal],
            [
              ui("โอน / ชำระบัตร / เบิกเงิน (ไม่นับ P&L)"),
              summary.excludedTotal,
            ],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className="rounded-input border border-hairline p-3">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {fmtTHB(amount)}
            </div>
          </div>
        ))}
      </div>
      {summary.pendingTotal > 0 && (
        <p
          role="status"
          className="mx-4 mb-4 rounded-input bg-amber-50 text-amber-800 p-3 text-xs"
        >
          {ui("ยังมีเงินออก")} {fmtTHB(summary.pendingTotal)}{" "}
          {ui(
            "บาทที่ไม่ได้จัดหมวดรายจ่าย หรือถูกจัดเป็นรายรับ โปรดตรวจใน Bank & Reconcile ยอดนี้ยังไม่รวมในต้นทุนและกำไรที่แสดงจึงยังไม่ครบ"
          )}
        </p>
      )}
      {summary.rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">
          {ui("ยังไม่มีรายการเงินออกในเดือนนี้")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-3 py-2">{ui("หมวดต้นทุน")}</th>
                <th className="px-3 py-2">{ui("หมวดใน P&L")}</th>
                <th className="px-3 py-2 text-right">
                  {ui("ธนาคาร / เงินสด")}
                </th>
                <th className="px-3 py-2 text-right">{ui("บัตรเครดิต")}</th>
                <th className="px-3 py-2 text-right">{ui("รวม")}</th>
                <th className="px-3 py-2 text-right">{ui("รายการ")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {summary.rows.map((row) => {
                const open = expanded.has(row.categoryId);
                const contentId = `${panelId}-${row.categoryId ?? "pending"}`;
                const items = grouped.get(row.categoryId) ?? [];
                return (
                  <Fragment key={row.categoryId ?? "pending"}>
                    <tr
                      className={open ? "bg-surface/70" : "hover:bg-surface/40"}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggle(row.categoryId)}
                          aria-expanded={open}
                          aria-controls={contentId}
                          className="flex min-h-9 items-center gap-2 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                          {row.categoryId === null
                            ? ui("ยังไม่จัดหมวด")
                            : row.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {row.status === "pending"
                          ? ui("รอตรวจสอบ — ยังไม่นับ P&L")
                          : row.status === "excluded"
                            ? ui("ไม่นับ P&L")
                            : ui(COST_BUCKET_LABELS[row.status])}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtTHB(row.bankAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtTHB(row.cardAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtTHB(row.total)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => toggle(row.categoryId)}
                          aria-expanded={open}
                          aria-controls={contentId}
                          aria-label={ui("ดู {v0} รายการใน {v1}", {
                            v0: row.count,
                            v1:
                              row.categoryId === null
                                ? ui("ยังไม่จัดหมวด")
                                : row.name,
                          })}
                          className="inline-flex min-h-9 items-center gap-1 rounded px-2 font-medium text-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {row.count}
                          <ChevronDown
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                      </td>
                    </tr>
                    <tr hidden={!open}>
                      <td colSpan={6} className="bg-surface/40 p-3 sm:p-4">
                        <div
                          id={contentId}
                          role="region"
                          aria-label={ui("รายละเอียดหมวด {v0}", {
                            v0:
                              row.categoryId === null
                                ? ui("ยังไม่จัดหมวด")
                                : row.name,
                          })}
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">
                              {ui("รายละเอียด {v0} รายการ • รวม {v1} บาท", {
                                v0: items.length,
                                v1: fmtTHB(row.total),
                              })}
                            </p>
                            <Link
                              href={`/bank?month=${monthId}`}
                              className="inline-flex items-center gap-1 text-muted underline"
                            >
                              {ui("เปิดบัญชีและกระทบยอด")}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                          <div className="overflow-x-auto rounded-input border border-hairline bg-canvas">
                            <table className="w-full min-w-[720px] text-xs">
                              <thead className="bg-surface text-left">
                                <tr>
                                  {[
                                    "วันที่ / เวลา",
                                    "รายละเอียด / หมายเหตุ",
                                    "บัญชีที่จ่าย",
                                    "ช่องทาง",
                                    "จำนวนเงิน",
                                    "หลักฐาน",
                                  ].map((label) => (
                                    <th
                                      key={label}
                                      scope="col"
                                      className="px-3 py-2 whitespace-nowrap"
                                    >
                                      {ui(label)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-hairline-soft">
                                {items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-3 align-top whitespace-nowrap tabular-nums">
                                      {item.date.slice(0, 10)}
                                      <span className="mt-1 block text-muted">
                                        {item.date.slice(11, 16)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 align-top min-w-[220px] max-w-sm">
                                      <p className="break-words">
                                        {item.description ||
                                          ui("(ไม่มีรายละเอียด)")}
                                      </p>
                                      {item.note && (
                                        <details className="mt-2 text-muted">
                                          <summary className="cursor-pointer">
                                            {ui("หมายเหตุ")}
                                          </summary>
                                          <p className="mt-1 whitespace-pre-wrap break-words">
                                            {item.note}
                                          </p>
                                        </details>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 align-top">
                                      <p>{item.accountName}</p>
                                      <span className="mt-1 block text-muted">
                                        {ui(
                                          item.accountType === "CREDIT_CARD"
                                            ? "บัตรเครดิต"
                                            : "ธนาคาร / เงินสด"
                                        )}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 align-top">
                                      {item.channel || "—"}
                                    </td>
                                    <td className="px-3 py-3 align-top text-right whitespace-nowrap font-medium tabular-nums">
                                      {fmtTHB(item.amount)}
                                    </td>
                                    <td className="px-3 py-3 align-top min-w-[150px]">
                                      {item.evidence.length ? (
                                        item.evidence
                                          .filter((file) =>
                                            /^https?:\/\//i.test(file.url)
                                          )
                                          .map((file) => (
                                            <a
                                              key={file.id}
                                              href={file.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="mb-1 flex items-center gap-1 text-accent underline"
                                            >
                                              <span
                                                className="max-w-[180px] truncate"
                                                title={file.name}
                                              >
                                                {file.name}
                                              </span>
                                              <ExternalLink className="h-3 w-3 shrink-0" />
                                            </a>
                                          ))
                                      ) : (
                                        <span className="text-muted">
                                          {ui("ยังไม่แนบหลักฐาน")}
                                        </span>
                                      )}
                                      <Link
                                        href={`/bank?month=${monthId}&account=${encodeURIComponent(item.accountCode)}#transaction-${item.id}`}
                                        className="mt-2 block w-fit text-muted underline"
                                      >
                                        {ui("ดูรายการต้นทาง")}
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="border-t border-hairline bg-surface font-medium">
                                <tr>
                                  <td colSpan={4} className="px-3 py-2">
                                    {ui("รวม")}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {fmtTHB(row.total)}
                                  </td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <footer className="border-t border-hairline-soft px-5 py-3 text-xs text-muted space-y-2">
        <p>
          {ui("ค่าใช้จ่ายที่นับใน P&L: ธนาคาร / เงินสด")}{" "}
          {fmtTHB(summary.bankTotal)} {ui("+ บัตรเครดิต")}{" "}
          {fmtTHB(summary.cardTotal)} = {fmtTHB(summary.grandTotal)} {ui("บาท")}
        </p>
        <p>
          {ui(
            "เงินออกทั้งหมด = ค่าใช้จ่ายเข้า P&L + รอตรวจสอบ + รายการไม่นับ P&L • ชำระบัตรเครดิตไม่นับซ้ำกับยอดซื้อผ่านบัตร • ยอดยกมาและเงินรับเข้าไม่ใช่รายจ่าย"
          )}
        </p>
        <p>
          {ui("ยอดกรอกเองเดิม")} {fmtTHB(manualTotal)} {ui("บาท")}{" "}
          {summary.hasTransactions
            ? ui("เก็บไว้เทียบเท่านั้น ไม่บวกซ้ำกับ Statement")
            : ui("ใช้คำนวณชั่วคราวจนกว่าจะลง Bank & Reconcile")}{" "}
          {ui(
            "• กรุณานำเข้าให้ครบทุกบัญชี และบันทึกรายจ่ายเงินสดในบัญชีเงินสด"
          )}
        </p>
      </footer>
    </section>
  );
}
