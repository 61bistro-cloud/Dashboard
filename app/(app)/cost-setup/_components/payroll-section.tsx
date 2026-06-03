"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { savePayroll } from "../actions";
import { MoneyInput } from "./money-input";
import { SectionCard } from "./section-card";
import { PAYROLL_EXTRA_LABELS } from "@/lib/fiscal";

type EmpRow = {
  id: number;
  name: string;
  shortName: string | null;
  amount: number;
};
type ExtraRow = { type: keyof typeof PAYROLL_EXTRA_LABELS; amount: number };

export function PayrollSection({
  fiscalMonthId,
  employees,
  extras,
}: {
  fiscalMonthId: number;
  employees: EmpRow[];
  extras: ExtraRow[];
}) {
  const [emps, setEmps] = useState<EmpRow[]>(employees);
  const [exts, setExts] = useState<ExtraRow[]>(extras);

  const total =
    emps.reduce((s, e) => s + e.amount, 0) +
    exts.reduce((s, e) => s + e.amount, 0);

  return (
    <SectionCard
      icon={Users}
      title="ค่าแรงพนักงาน (Payroll)"
      total={total}
      onSave={() =>
        savePayroll({
          fiscalMonthId,
          payroll: emps.map((e) => ({ employeeId: e.id, amount: e.amount })),
          extras: exts.map((e) => ({ type: e.type, amount: e.amount })),
        })
      }
    >
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_180px] gap-3 px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted">
          <div>พนักงาน</div>
          <div className="text-right">เงินเดือน (บาท)</div>
        </div>

        {emps.map((e, i) => (
          <div
            key={e.id}
            className="grid grid-cols-[1fr_180px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
          >
            <div className="text-sm">
              <span className="text-muted-soft mr-2 tabular-nums">
                {i + 1}.
              </span>
              {e.name}
            </div>
            <MoneyInput
              ariaLabel={`เงินเดือน ${e.shortName ?? e.name}`}
              value={e.amount}
              onChange={(n) =>
                setEmps((prev) =>
                  prev.map((p) => (p.id === e.id ? { ...p, amount: n } : p))
                )
              }
            />
          </div>
        ))}

        <div className="mt-4 mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted">
          OT / โบนัส / ค่าจ้างพิเศษ
        </div>
        {exts.map((x) => (
          <div
            key={x.type}
            className="grid grid-cols-[1fr_180px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
          >
            <div className="text-sm text-ink/90">
              {PAYROLL_EXTRA_LABELS[x.type]}
            </div>
            <MoneyInput
              ariaLabel={PAYROLL_EXTRA_LABELS[x.type]}
              value={x.amount}
              onChange={(n) =>
                setExts((prev) =>
                  prev.map((p) => (p.type === x.type ? { ...p, amount: n } : p))
                )
              }
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
