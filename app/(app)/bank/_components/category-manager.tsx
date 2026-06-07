"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Tags,
  ArrowUp,
  ArrowDown,
  Check,
  Pencil,
  AlertCircle,
  X,
} from "lucide-react";
import {
  addTxCategory,
  updateTxCategory,
  deleteTxCategory,
  moveTxCategory,
} from "../actions";

type Kind = "INCOME" | "EXPENSE" | "TRANSFER";
type Cat = { id: number; name: string; kind: Kind };

const KINDS: { key: Kind; label: string }[] = [
  { key: "INCOME", label: "รายรับ" },
  { key: "EXPENSE", label: "รายจ่าย / ต้นทุน" },
  { key: "TRANSFER", label: "โอน / ไม่นับ P&L" },
];

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<Kind>("EXPENSE");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    run(async () => {
      await addTxCategory({ name, kind: newKind });
      setNewName("");
    });
  }

  function onRename(cat: Cat) {
    const name = editName.trim();
    if (!name) return;
    run(async () => {
      await updateTxCategory({ id: cat.id, name, kind: cat.kind });
      setEditingId(null);
    });
  }

  function onDelete(cat: Cat) {
    if (
      !confirm(
        `ลบหมวด "${cat.name}" ?\nถ้ามีรายการใช้หมวดนี้อยู่ ระบบจะซ่อนแทนการลบ (เก็บประวัติ)`
      )
    )
      return;
    run(() => deleteTxCategory(cat.id));
  }

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <details className="group">
        <summary className="cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-surface">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Tags className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
            จัดการหมวดหมู่ (ต้นทุน/รายรับ) ({categories.length})
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
              <label className="block text-xs text-muted mb-1">ชื่อหมวด</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น 🥩 ต้นทุน - เนื้อสัตว์"
                maxLength={80}
                className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
              />
            </div>
            <div className="w-44">
              <label className="block text-xs text-muted mb-1">ประเภท</label>
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as Kind)}
                className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm"
              >
                {KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
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
              เพิ่มหมวด
            </button>
          </form>

          {error && (
            <div className="flex items-center gap-1.5 rounded-input bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Grouped lists */}
          <div className="space-y-4">
            {KINDS.map((k) => {
              const list = categories.filter((c) => c.kind === k.key);
              if (list.length === 0) return null;
              return (
                <div key={k.key}>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1.5 px-1">
                    {k.label} ({list.length})
                  </div>
                  <ul className="divide-y divide-hairline-soft rounded-card border border-hairline">
                    {list.map((cat, i) => (
                      <li
                        key={cat.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-surface"
                      >
                        {editingId === cat.id ? (
                          <>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              autoFocus
                              className="flex-1 rounded-input border border-hairline bg-canvas px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => onRename(cat)}
                              disabled={pending}
                              className="text-emerald-700 hover:text-emerald-800 p-1"
                              aria-label="บันทึก"
                            >
                              <Check className="h-4 w-4" strokeWidth={2.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-muted hover:text-ink p-1"
                              aria-label="ยกเลิก"
                            >
                              <X className="h-4 w-4" strokeWidth={2} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm truncate">
                              {cat.name}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  run(() => moveTxCategory(cat.id, "up"))
                                }
                                disabled={pending || i === 0}
                                className="text-muted-soft hover:text-ink disabled:opacity-25 p-1"
                                aria-label="เลื่อนขึ้น"
                              >
                                <ArrowUp
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  run(() => moveTxCategory(cat.id, "down"))
                                }
                                disabled={pending || i === list.length - 1}
                                className="text-muted-soft hover:text-ink disabled:opacity-25 p-1"
                                aria-label="เลื่อนลง"
                              >
                                <ArrowDown
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(cat.id);
                                  setEditName(cat.name);
                                }}
                                className="text-muted-soft hover:text-ink p-1"
                                aria-label="แก้ชื่อ"
                              >
                                <Pencil
                                  className="h-3.5 w-3.5"
                                  strokeWidth={1.75}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDelete(cat)}
                                disabled={pending}
                                className="text-muted-soft hover:text-red-600 disabled:opacity-30 p-1"
                                aria-label="ลบ"
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  strokeWidth={1.75}
                                />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted">
            💡 ลำดับที่จัดเรียงนี้คือลำดับที่จะแสดงใน dropdown ตอนเลือกหมวด —
            จัดของที่ใช้บ่อยไว้บนสุดเพื่อหาง่าย
          </p>
        </div>
      </details>
    </section>
  );
}
