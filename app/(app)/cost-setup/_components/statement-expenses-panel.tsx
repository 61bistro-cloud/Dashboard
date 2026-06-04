import { CreditCard, Landmark, FileText } from "lucide-react";
import { fmtTHB } from "@/lib/fiscal";
import type { StatementExpenseSummary } from "@/lib/bank-calc";

/**
 * Side panel in Cost Setup that shows actual spending pulled from imported
 * bank + credit card statements. Read-only — the user still enters costs
 * manually in the sections above. This panel is for cross-checking.
 */
export function StatementExpensesPanel({
  summary,
  manualFixed,
}: {
  summary: StatementExpenseSummary;
  /** Sum of FixedCost entries the user has already typed in this month */
  manualFixed: number;
}) {
  if (summary.rows.length === 0) {
    return (
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
            รายจ่ายจาก Statement (ตรวจสอบกับ Cost Setup)
          </h2>
        </header>
        <div className="p-6 text-center text-sm text-muted">
          ยังไม่มีรายการที่ Import จาก Bank/Card ในเดือนนี้
          <br />
          <span className="text-xs">
            ไป Bank & Reconciliation เพื่อ Import PDF Statement
          </span>
        </div>
      </section>
    );
  }

  const diff = summary.grandTotal - manualFixed;

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
          รายจ่ายจริงจาก Statement (ใช้ตรวจสอบ Cost Setup)
        </h2>
        <p className="text-xs text-muted mt-0.5">
          ยอดนี้ดึงมาจาก Bank Transactions + Credit Card ที่ Import เข้ามาแล้ว —
          ใช้เปรียบเทียบกับยอดที่กรอกในส่วนด้านบน
        </p>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-surface/40">
        <div className="rounded-input border border-hairline bg-canvas p-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Landmark className="h-3.5 w-3.5" strokeWidth={1.75} />
            จากบัญชีธนาคาร
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {fmtTHB(summary.bankTotal)}
          </div>
        </div>
        <div className="rounded-input border border-hairline bg-canvas p-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} />
            จากบัตรเครดิต
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-amber-700">
            {fmtTHB(summary.cardTotal)}
          </div>
        </div>
        <div className="rounded-input border border-ink bg-ink p-3 text-canvas">
          <div className="text-xs opacity-75">รายจ่ายรวมจาก Statement</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {fmtTHB(summary.grandTotal)}
          </div>
        </div>
      </div>

      {/* Per-category breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-3 py-2 font-medium">หมวด</th>
              <th className="px-3 py-2 font-medium text-right">
                <span className="inline-flex items-center gap-1">
                  <Landmark className="h-3 w-3" strokeWidth={1.75} />
                  ธนาคาร
                </span>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <span className="inline-flex items-center gap-1">
                  <CreditCard className="h-3 w-3" strokeWidth={1.75} />
                  บัตรเครดิต
                </span>
              </th>
              <th className="px-3 py-2 font-medium text-right">รวม</th>
              <th className="px-3 py-2 font-medium text-right">รายการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {summary.rows.map((r) => (
              <tr key={r.categoryId ?? "_uncat"}>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink/75">
                  {r.bankAmount > 0 ? fmtTHB(r.bankAmount) : "-"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                  {r.cardAmount > 0 ? fmtTHB(r.cardAmount) : "-"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  {fmtTHB(r.total)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                  {r.count}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline bg-surface/50 font-medium">
              <td className="px-3 py-2">รวม</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtTHB(summary.bankTotal)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtTHB(summary.cardTotal)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtTHB(summary.grandTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Comparison footer */}
      <div className="border-t border-hairline-soft px-5 py-3 bg-surface/30">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-muted">📋 Cost Setup (Fixed Cost)</div>
            <div className="font-medium tabular-nums mt-0.5">
              {fmtTHB(manualFixed)}
            </div>
          </div>
          <div>
            <div className="text-muted">📊 Statement (รายจ่ายทั้งหมด)</div>
            <div className="font-medium tabular-nums mt-0.5">
              {fmtTHB(summary.grandTotal)}
            </div>
          </div>
          <div>
            <div className="text-muted">
              ⚖️ ส่วนต่าง (Statement − Cost Setup)
            </div>
            <div
              className={
                "font-medium tabular-nums mt-0.5 " +
                (Math.abs(diff) < 1
                  ? "text-emerald-700"
                  : diff > 0
                    ? "text-amber-700"
                    : "text-sky-700")
              }
            >
              {fmtTHB(diff)}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          💡 ส่วนต่างอาจเป็นเพราะ Cost Setup รวมเงินสด/ค่าใช้จ่ายที่ไม่ผ่านบัญชี
          ด้วย หรือ statement ยังไม่ Import ครบ —
          ใช้เป็นเครื่องมือตรวจสอบเท่านั้น ไม่กระทบ P&L
        </p>
      </div>
    </section>
  );
}
