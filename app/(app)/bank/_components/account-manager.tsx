"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Settings2,
  AlertCircle,
  CreditCard,
  Landmark,
} from "lucide-react";
import { addBankAccount, deleteBankAccount } from "../actions";

type AccountRow = {
  id: number;
  code: string;
  name: string;
  accountType: string;
};

export function AccountManager({ accounts }: { accounts: AccountRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"BANK" | "CREDIT_CARD">("BANK");

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        await addBankAccount({ name: trimmed, accountType: type });
        setName("");
        setType("BANK");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function onDelete(a: AccountRow) {
    if (
      !confirm(
        `ลบ "${a.name}" ?\nถ้ามีรายการ/ยอดยกมาบันทึกไว้ ระบบจะซ่อนแทนการลบ (เก็บประวัติไว้)`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteBankAccount(a.id);
      } catch (err) {
        setError((err as Error).message);
        alert((err as Error).message);
      }
    });
  }

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <details className="group">
        <summary className="cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-surface">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
            จัดการบัญชี & ช่องทาง ({accounts.length})
          </div>
          <span className="text-xs text-muted group-open:hidden">เปิด ▾</span>
          <span className="text-xs text-muted hidden group-open:inline">
            ปิด ▴
          </span>
        </summary>

        <div className="px-5 pb-5 pt-1 space-y-4">
          {/* Add form */}
          <form
            onSubmit={onAdd}
            className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-3"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-muted mb-1">
                ชื่อบัญชี / ช่องทาง
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ธนาคารกรุงเทพ, Grab, Lineman, Shopee"
                maxLength={60}
                className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs text-muted mb-1">ประเภท</label>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "BANK" | "CREDIT_CARD")
                }
                className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm"
              >
                <option value="BANK">บัญชี / ช่องทางเงิน</option>
                <option value="CREDIT_CARD">บัตรเครดิต</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={pending || !name.trim()}
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
            <div className="flex items-center gap-1.5 rounded-input bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Existing accounts */}
          <ul className="divide-y divide-hairline-soft rounded-card border border-hairline">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-input border border-hairline bg-surface text-muted-soft shrink-0">
                  {a.accountType === "CREDIT_CARD" ? (
                    <CreditCard className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Landmark className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </span>
                <span className="flex-1 text-sm">{a.name}</span>
                {a.accountType === "CREDIT_CARD" && (
                  <span className="rounded-pill bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                    บัตรเครดิต
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(a)}
                  disabled={pending}
                  className="text-muted-soft hover:text-red-600 disabled:opacity-30 p-1"
                  title={`ลบ ${a.name}`}
                  aria-label={`ลบ ${a.name}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted">
            💡 เพิ่มได้ทั้งธนาคาร (กรุงเทพ/กรุงศรี/กรุงไทย ฯลฯ) และช่องทางเงิน
            (Grab/Lineman/Shopee) — แต่ละธุรกิจมีบัญชีของตัวเองแยกกัน
          </p>
        </div>
      </details>
    </section>
  );
}
