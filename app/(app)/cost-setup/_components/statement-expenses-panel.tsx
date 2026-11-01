import Link from "next/link";
import { FileText } from "lucide-react";
import { fmtTHB } from "@/lib/fiscal";
import {
  COST_BUCKET_LABELS,
  type StatementCostSummary,
} from "@/lib/statement-costs";

export function StatementExpensesPanel({
  summary,
  manualTotal,
  monthId,
}: {
  summary: StatementCostSummary;
  manualTotal: number;
  monthId: number;
}) {
  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-soft" />
          สรุปรายจ่ายจาก Bank & Reconcile
        </h2>
        <p className="text-xs text-muted mt-1">
          รวมทุกบัญชีและบัตรเครดิตตามเดือนที่บันทึก • จัดหมวดหรือแก้ไขรายการที่{" "}
          <Link href={`/bank?month=${monthId}`} className="underline">
            Bank & Reconcile
          </Link>{" "}
          แล้วสรุปจะอัปเดตอัตโนมัติ
        </p>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
        {(
          [
            ["เงินออกทั้งหมด", summary.withdrawalTotal],
            ["ค่าใช้จ่ายเข้า P&L", summary.grandTotal],
            ["รอจัดหมวด / ตรวจสอบ", summary.pendingTotal],
            ["โอน / ชำระบัตร / เบิกเงิน (ไม่นับ P&L)", summary.excludedTotal],
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
          ยังมีเงินออก {fmtTHB(summary.pendingTotal)} บาทที่ไม่ได้จัดหมวดรายจ่าย
          หรือถูกจัดเป็นรายรับ โปรดตรวจใน Bank & Reconcile
          ยอดนี้ยังไม่รวมในต้นทุนและกำไรที่แสดงจึงยังไม่ครบ
        </p>
      )}
      {summary.rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">
          ยังไม่มีรายการเงินออกในเดือนนี้
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-3 py-2">หมวดธนาคาร</th>
                <th className="px-3 py-2">หมวดใน P&L</th>
                <th className="px-3 py-2 text-right">ธนาคาร / เงินสด</th>
                <th className="px-3 py-2 text-right">บัตรเครดิต</th>
                <th className="px-3 py-2 text-right">รวม</th>
                <th className="px-3 py-2 text-right">รายการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {summary.rows.map((row) => (
                <tr key={row.categoryId ?? "pending"}>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-muted">
                    {row.status === "pending"
                      ? "รอตรวจสอบ — ยังไม่นับ P&L"
                      : row.status === "excluded"
                        ? "ไม่นับ P&L"
                        : COST_BUCKET_LABELS[row.status]}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtTHB(row.bankAmount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtTHB(row.cardAmount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtTHB(row.total)}
                  </td>
                  <td className="px-3 py-2 text-right">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="border-t border-hairline-soft px-5 py-3 text-xs text-muted space-y-2">
        <p>
          ค่าใช้จ่ายที่นับใน P&L: ธนาคาร / เงินสด {fmtTHB(summary.bankTotal)} +
          บัตรเครดิต {fmtTHB(summary.cardTotal)} = {fmtTHB(summary.grandTotal)}{" "}
          บาท
        </p>
        <p>
          เงินออกทั้งหมด = ค่าใช้จ่ายเข้า P&L + รอตรวจสอบ + รายการไม่นับ P&L •
          ชำระบัตรเครดิตไม่นับซ้ำกับยอดซื้อผ่านบัตร •
          ยอดยกมาและเงินรับเข้าไม่ใช่รายจ่าย
        </p>
        <p>
          ยอดกรอกเองเดิม {fmtTHB(manualTotal)} บาท
          {summary.hasTransactions
            ? " เก็บไว้เทียบเท่านั้น ไม่บวกซ้ำกับ Statement"
            : " ใช้คำนวณชั่วคราวจนกว่าจะลง Bank & Reconcile"}{" "}
          • กรุณานำเข้าให้ครบทุกบัญชี และบันทึกรายจ่ายเงินสดในบัญชีเงินสด
        </p>
      </footer>
    </section>
  );
}
