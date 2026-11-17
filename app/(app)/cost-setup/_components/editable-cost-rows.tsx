"use client";
import { Plus, Trash2 } from "lucide-react";
import { useUi } from "@/lib/i18n/use-ui";
import { PAYROLL_EXTRA_LABELS } from "@/lib/payroll-labels";
import type { FlexibleCostRow } from "@/lib/flexible-costs";
import { MoneyInput } from "./money-input";

export function EditableCostRows({
  rows,
  onChange,
  kind,
}: {
  rows: FlexibleCostRow[];
  onChange: (rows: FlexibleCostRow[]) => void;
  kind: "extra" | "other";
}) {
  const { ui } = useUi();
  const label = (row: FlexibleCostRow) =>
    row.legacyType && row.name === PAYROLL_EXTRA_LABELS[row.legacyType]
      ? ui(row.name)
      : row.name;
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div
          key={row.id ?? row.legacyType ?? `new-${index}`}
          className="grid grid-cols-[minmax(0,1fr)_110px_28px] sm:grid-cols-[minmax(0,1fr)_160px_28px] items-center gap-2 px-2 py-1 rounded hover:bg-surface"
        >
          <input
            type="text"
            value={label(row)}
            maxLength={120}
            aria-label={ui("ชื่อรายการ {v0}", { v0: index + 1 })}
            placeholder={ui("ชื่อรายการ")}
            onChange={(event) =>
              onChange(
                rows.map((r, i) =>
                  i === index ? { ...r, name: event.target.value } : r
                )
              )
            }
            className="w-full min-w-0 rounded-input border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-hairline focus:border-ink focus:bg-canvas focus:outline-none"
          />
          <MoneyInput
            value={row.amount}
            ariaLabel={ui("จำนวนเงิน {v0}", { v0: label(row) || index + 1 })}
            onChange={(amount) =>
              onChange(rows.map((r, i) => (i === index ? { ...r, amount } : r)))
            }
          />
          <button
            type="button"
            aria-label={ui("ลบรายการ {v0}", { v0: label(row) || index + 1 })}
            onClick={() => {
              if (confirm(ui("ลบรายการนี้? การเปลี่ยนแปลงจะมีผลเมื่อกดบันทึก")))
                onChange(rows.filter((_, i) => i !== index));
            }}
            className="p-1 text-muted-soft hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {!rows.length && (
        <p className="px-2 py-3 text-xs text-muted">
          {ui("ยังไม่มีรายการ เพิ่มรายการด้านล่างได้เลย")}
        </p>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { name: "", amount: 0 }])}
        className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <Plus className="h-4 w-4" />
        {ui(kind === "extra" ? "เพิ่มค่าจ้างพิเศษ" : "เพิ่มต้นทุนอื่นๆ")}
      </button>
      <p className="px-2 text-xs text-muted">
        {ui(
          "แก้ชื่อ จำนวนเงิน เพิ่มหรือลบรายการ แล้วกดบันทึก • ยอดเงินใช้เฉพาะเดือนที่เลือก ชื่อรายการใช้ร่วมกันทุกเดือน"
        )}
      </p>
    </div>
  );
}
