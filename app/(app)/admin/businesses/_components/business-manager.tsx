"use client";

import { useState, useTransition } from "react";
import { Building2, Plus, Loader2, Check, Pencil, Power } from "lucide-react";
import {
  createBusiness,
  renameBusiness,
  setBusinessActive,
} from "../../../business-actions";

type Biz = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  counts: { employees: number; bills: number; bankTx: number };
};

export function BusinessManager({ businesses }: { businesses: Biz[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      try {
        await createBusiness({ name });
        setNewName("");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function onRename(id: number) {
    const name = editName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      try {
        await renameBusiness({ id, name });
        setEditingId(null);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function onToggle(id: number, active: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await setBusinessActive(id, active);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Add business */}
      <form
        onSubmit={onCreate}
        className="rounded-card border border-hairline bg-canvas p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Plus className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold">เพิ่มธุรกิจใหม่</h3>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-muted mb-1">ชื่อธุรกิจ</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น 61 Café สาขา 2"
              maxLength={80}
              className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            สร้างธุรกิจ
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          ระบบจะสร้างบัญชีธนาคาร + หมวดหมู่รายรับรายจ่ายเริ่มต้นให้อัตโนมัติ
          ส่วนพนักงาน/Supplier/ต้นทุนต้องกรอกเองในแต่ละธุรกิจ
        </p>
      </form>

      {error && (
        <div className="rounded-input bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-card border border-hairline bg-canvas">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-4 py-3 font-medium">ธุรกิจ</th>
              <th className="px-4 py-3 font-medium text-right">พนักงาน</th>
              <th className="px-4 py-3 font-medium text-right">บิล POS</th>
              <th className="px-4 py-3 font-medium text-right">รายการธนาคาร</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3 font-medium text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {businesses.map((b) => (
              <tr key={b.id} className={b.active ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  {editingId === b.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        className="rounded-input border border-hairline bg-canvas px-2 py-1 text-sm w-48"
                      />
                      <button
                        type="button"
                        onClick={() => onRename(b.id)}
                        disabled={pending}
                        className="text-emerald-700 hover:text-emerald-800"
                        aria-label="บันทึก"
                      >
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs text-muted hover:text-ink"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Building2
                        className="h-4 w-4 text-muted-soft"
                        strokeWidth={1.75}
                      />
                      {b.name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {b.counts.employees}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {b.counts.bills}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {b.counts.bankTx}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "inline-flex rounded-pill px-2 py-0.5 text-xs font-medium " +
                      (b.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-surface text-muted")
                    }
                  >
                    {b.active ? "ใช้งาน" : "ปิด"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(b.id);
                        setEditName(b.name);
                      }}
                      className="text-muted-soft hover:text-ink"
                      title="แก้ชื่อ"
                      aria-label="แก้ชื่อ"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(b.id, !b.active)}
                      disabled={pending}
                      className={
                        "hover:text-ink " +
                        (b.active ? "text-amber-600" : "text-emerald-600")
                      }
                      title={b.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      aria-label={b.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    >
                      <Power className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
