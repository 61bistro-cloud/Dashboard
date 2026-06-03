"use client";

import { useEffect, useState, useTransition } from "react";
import { Home, FolderDot, Trash2, Plus, AlertCircle } from "lucide-react";
import { addFixedCategory, deleteFixedCategory, saveFixed } from "../actions";
import { MoneyInput } from "./money-input";
import { SectionCard } from "./section-card";
import { FIXED_CAT_ICONS } from "@/lib/icons";

type CatRow = {
  id: number;
  name: string;
  amount: number;
};

export function FixedCostSection({
  fiscalMonthId,
  categories,
}: {
  fiscalMonthId: number;
  categories: CatRow[];
}) {
  const [rows, setRows] = useState<CatRow[]>(categories);

  // Re-sync local state when the category list changes (after add/delete)
  useEffect(() => {
    setRows(categories);
  }, [categories]);

  const total = rows.reduce((s, r) => s + r.amount, 0);

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
        await addFixedCategory({ name });
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
        `ลบหมวด "${name}"?\nถ้าหมวดนี้มีค่าใช้จ่ายที่บันทึกไว้ ระบบจะซ่อนแทนการลบ (เพื่อรักษาประวัติ)`
      )
    ) {
      return;
    }
    startDelete(async () => {
      await deleteFixedCategory(id);
    });
  };

  return (
    <SectionCard
      icon={Home}
      title="ค่าใช้จ่ายประจำ (Fixed Cost)"
      total={total}
      onSave={() =>
        saveFixed({
          fiscalMonthId,
          costs: rows.map((r) => ({ categoryId: r.id, amount: r.amount })),
        })
      }
    >
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_180px_28px] gap-3 px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted">
          <div>หมวด</div>
          <div className="text-right">จำนวน (บาท)</div>
          <div></div>
        </div>

        {rows.map((r, i) => {
          const RowIcon = FIXED_CAT_ICONS[r.name] ?? FolderDot;
          return (
            <div
              key={r.id}
              className="group grid grid-cols-[1fr_180px_28px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-soft tabular-nums w-5">
                  {i + 1}.
                </span>
                <RowIcon
                  className="h-4 w-4 text-muted-soft"
                  strokeWidth={1.75}
                />
                {r.name}
              </div>
              <MoneyInput
                ariaLabel={r.name}
                value={r.amount}
                onChange={(n) =>
                  setRows((prev) =>
                    prev.map((p) => (p.id === r.id ? { ...p, amount: n } : p))
                  )
                }
              />
              <button
                type="button"
                onClick={() => handleDelete(r.id, r.name)}
                disabled={pendingDelete}
                className="text-muted-soft hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30 transition-opacity"
                aria-label={`ลบหมวด ${r.name}`}
                title={`ลบหมวด ${r.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}

        {/* Add new category */}
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
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  required
                  placeholder="ชื่อหมวดใหม่ — เช่น ค่าซ่อมแซม, ค่าน้ำมัน, ภาษีโรงเรือน"
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
            เพิ่มหมวด
          </button>
        )}
      </div>
    </SectionCard>
  );
}
