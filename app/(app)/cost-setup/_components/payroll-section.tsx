"use client";

import { useEffect, useState, useTransition } from "react";
import { Users, Trash2, Plus, AlertCircle } from "lucide-react";
import { addEmployee, deleteEmployee, savePayroll } from "../actions";
import { MoneyInput } from "./money-input";
import { SectionCard } from "./section-card";
import { PAYROLL_EXTRA_LABELS } from "@/lib/fiscal";

type EmpRow = {
  id: number;
  name: string;
  shortName: string | null;
  amount: number;
  /** Per-month name override (null = use global name) */
  nameOverride: string | null;
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

  useEffect(() => setEmps(employees), [employees]);
  useEffect(() => setExts(extras), [extras]);

  const total =
    emps.reduce((s, e) => s + e.amount, 0) +
    exts.reduce((s, e) => s + e.amount, 0);

  const [pendingDelete, startDelete] = useTransition();
  const [pendingAdd, startAdd] = useTransition();
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const name = newName.trim();
    if (!name) return;
    startAdd(async () => {
      try {
        await addEmployee({ name });
        setNewName("");
        setAddMode(false);
      } catch (err) {
        setAddError((err as Error).message);
      }
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (
      !confirm(
        `ลบพนักงาน "${name}"?\nถ้ามีประวัติเงินเดือนบันทึกไว้ ระบบจะซ่อนแทนการลบ (รักษาประวัติ)`
      )
    )
      return;
    startDelete(async () => {
      await deleteEmployee(id);
    });
  };

  return (
    <SectionCard
      icon={Users}
      title="ค่าแรงพนักงาน (Payroll)"
      total={total}
      onSave={() =>
        savePayroll({
          fiscalMonthId,
          payroll: emps.map((e) => ({
            employeeId: e.id,
            amount: e.amount,
            nameOverride: e.nameOverride,
          })),
          extras: exts.map((e) => ({ type: e.type, amount: e.amount })),
        })
      }
    >
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_180px_28px] gap-3 px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted">
          <div>พนักงาน</div>
          <div className="text-right">เงินเดือน (บาท)</div>
          <div></div>
        </div>

        {emps.map((e, i) => {
          const displayName = e.nameOverride ?? e.name;
          const hasOverride = e.nameOverride != null;
          return (
            <div
              key={e.id}
              className="group grid grid-cols-[1fr_180px_28px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-soft tabular-nums">{i + 1}.</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(ev) => {
                    const next = ev.target.value;
                    setEmps((prev) =>
                      prev.map((p) =>
                        p.id === e.id
                          ? {
                              ...p,
                              // Empty input → revert to global name on next save
                              nameOverride: next === e.name ? null : next,
                            }
                          : p
                      )
                    );
                  }}
                  aria-label={`ชื่อพนักงาน ${e.shortName ?? e.name}`}
                  className="flex-1 rounded-input border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-hairline focus:border-ink focus:bg-canvas focus:outline-none transition-colors"
                />
                {hasOverride && (
                  <span
                    className="text-xs text-amber-600 cursor-help"
                    title="แก้ชื่อสำหรับเดือนนี้เท่านั้น — เดือนอื่นไม่ได้รับผลกระทบ"
                  >
                    เฉพาะเดือนนี้
                  </span>
                )}
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
              <button
                type="button"
                onClick={() => handleDelete(e.id, displayName)}
                disabled={pendingDelete}
                className="text-muted-soft hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30 transition-opacity"
                aria-label={`ลบพนักงาน ${displayName}`}
                title={`ลบพนักงาน ${displayName}`}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}

        {/* Add new employee */}
        {addMode ? (
          <form
            onSubmit={handleAdd}
            className="mt-2 px-2 py-2 rounded bg-surface space-y-2"
          >
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <div className="flex items-center gap-2">
                <Plus
                  className="h-4 w-4 text-muted-soft shrink-0"
                  strokeWidth={1.75}
                />
                <input
                  type="text"
                  value={newName}
                  onChange={(ev) => setNewName(ev.target.value)}
                  autoFocus
                  required
                  placeholder="ชื่อพนักงาน — เช่น Boom (Service) 17:00-02:00"
                  className="flex-1 rounded-input border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink focus:outline-none"
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAddMode(false);
                    setNewName("");
                    setAddError(null);
                  }}
                  className="text-xs text-muted hover:text-ink px-2 py-1 rounded"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={pendingAdd || !newName.trim()}
                  className="rounded-pill bg-ink text-canvas px-3 py-1 text-xs font-medium hover:bg-ink-2 disabled:opacity-50"
                >
                  {pendingAdd ? "..." : "เพิ่ม"}
                </button>
              </div>
            </div>
            {addError && (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
                {addError}
              </div>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddMode(true)}
            className="mt-2 flex items-center gap-2 w-full px-2 py-2 text-sm text-muted hover:text-ink hover:bg-surface rounded transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            เพิ่มพนักงาน
          </button>
        )}

        <div className="mt-4 mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted">
          OT / โบนัส / ค่าจ้างพิเศษ
        </div>
        {exts.map((x) => (
          <div
            key={x.type}
            className="grid grid-cols-[1fr_180px_28px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
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
            <div></div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
