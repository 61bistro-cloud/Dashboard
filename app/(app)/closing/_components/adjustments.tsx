"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { addAdjustment, removeAdjustment } from "../actions";
import { fmtTHB } from "@/lib/fiscal";

type Adj = {
  id: number;
  kind: "REVENUE" | "COST";
  label: string;
  amount: number;
};

export function Adjustments({
  fiscalMonthId,
  adjustments,
}: {
  fiscalMonthId: number;
  adjustments: Adj[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [kind, setKind] = useState<"REVENUE" | "COST">("COST");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("ใส่รหัสอนุมัติก่อน");
      return;
    }
    start(async () => {
      try {
        await addAdjustment({
          fiscalMonthId,
          password,
          kind,
          label: label.trim(),
          amount: Number(amount || 0),
        });
        setLabel("");
        setAmount("");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function onRemove(id: number) {
    setError(null);
    if (!password) {
      setError("ใส่รหัสอนุมัติก่อนจึงจะลบได้");
      return;
    }
    start(async () => {
      try {
        await removeAdjustment({ adjustmentId: id, password });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="text-sm font-semibold">รายการปรับปรุง (Adjustments)</h2>
        <p className="text-xs text-muted mt-0.5">
          แก้ไขเพิ่มเติม เช่น ปรับรายได้/ต้นทุนที่ตกหล่น — ทุกครั้งต้องใส่
          รหัสอนุมัติเจ้าของ
        </p>
      </header>

      <div className="p-4 space-y-3">
        {/* shared approval password */}
        <div className="flex items-center gap-2 rounded-card bg-surface px-3 py-2">
          <ShieldCheck
            className="h-4 w-4 text-amber-600 shrink-0"
            strokeWidth={1.75}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="รหัสอนุมัติเจ้าของ (ใส่ครั้งเดียวใช้ได้ทั้งเพิ่ม/ลบ)"
            autoComplete="off"
            className="flex-1 rounded-input border border-hairline bg-canvas px-3 py-1.5 text-sm focus:border-ink focus:outline-none"
          />
        </div>

        {/* list */}
        {adjustments.length > 0 && (
          <ul className="divide-y divide-hairline-soft rounded-card border border-hairline">
            {adjustments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span
                  className={
                    "rounded-pill px-2 py-0.5 text-[10px] font-medium " +
                    (a.kind === "REVENUE"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700")
                  }
                >
                  {a.kind === "REVENUE" ? "รายได้" : "ต้นทุน"}
                </span>
                <span className="flex-1 truncate">{a.label}</span>
                <span
                  className={
                    "tabular-nums " +
                    (a.kind === "REVENUE" ? "text-emerald-700" : "text-red-700")
                  }
                >
                  {a.amount >= 0 ? "+" : ""}
                  {fmtTHB(a.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  disabled={pending}
                  className="text-muted-soft hover:text-red-600 disabled:opacity-30 p-1"
                  aria-label="ลบ"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* add form */}
        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <label className="block text-xs text-muted mb-1">ประเภท</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "REVENUE" | "COST")}
              className="w-full rounded-input border border-hairline bg-canvas px-2 py-2 text-sm"
            >
              <option value="COST">ต้นทุน/ค่าใช้จ่าย</option>
              <option value="REVENUE">รายได้</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-muted mb-1">รายละเอียด</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น ค่าปรับ, ส่วนลดพิเศษ, รายได้อื่น"
              maxLength={120}
              className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
          </div>
          <div className="w-32">
            <label className="block text-xs text-muted mb-1">
              จำนวน (± ได้)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm text-right tabular-nums focus:border-ink focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !label.trim()}
            className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            เพิ่ม
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
