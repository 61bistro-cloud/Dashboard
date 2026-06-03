"use client";

import { useEffect, useState, useTransition } from "react";
import { Boxes, Trash2, Plus, AlertCircle } from "lucide-react";
import { addSupplier, deleteSupplier, saveSuppliers } from "../actions";
import { MoneyInput, fmt } from "./money-input";
import { SectionCard } from "./section-card";
import { SUPPLIER_CATEGORY_LABELS } from "@/lib/fiscal";
import { SUPPLIER_CAT_ICONS } from "@/lib/icons";

type Cat = "FOOD" | "BEVERAGE" | "PACKAGING";
type SupRow = {
  id: number;
  name: string;
  category: Cat;
  amount: number;
};

export function SupplierSection({
  fiscalMonthId,
  suppliers,
}: {
  fiscalMonthId: number;
  suppliers: SupRow[];
}) {
  const [rows, setRows] = useState<SupRow[]>(suppliers);
  useEffect(() => setRows(suppliers), [suppliers]);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  const grouped: Record<Cat, SupRow[]> = {
    FOOD: [],
    BEVERAGE: [],
    PACKAGING: [],
  };
  rows.forEach((r) => grouped[r.category].push(r));

  return (
    <SectionCard
      icon={Boxes}
      title="ต้นทุนวัตถุดิบ + เครื่องดื่ม + บรรจุภัณฑ์"
      total={total}
      onSave={() =>
        saveSuppliers({
          fiscalMonthId,
          purchases: rows.map((r) => ({ supplierId: r.id, amount: r.amount })),
        })
      }
    >
      <div className="space-y-6">
        {(["FOOD", "BEVERAGE", "PACKAGING"] as const).map((cat) => {
          const list = grouped[cat];
          const subtotal = list.reduce((s, r) => s + r.amount, 0);
          const meta = SUPPLIER_CATEGORY_LABELS[cat];
          const CatIcon = SUPPLIER_CAT_ICONS[cat];
          return (
            <CategoryGroup
              key={cat}
              category={cat}
              title={meta.label}
              icon={CatIcon}
              rows={list}
              subtotal={subtotal}
              onAmountChange={(id, n) =>
                setRows((prev) =>
                  prev.map((p) => (p.id === id ? { ...p, amount: n } : p))
                )
              }
            />
          );
        })}
      </div>
    </SectionCard>
  );
}

function CategoryGroup({
  category,
  title,
  icon: CatIcon,
  rows,
  subtotal,
  onAmountChange,
}: {
  category: Cat;
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  rows: SupRow[];
  subtotal: number;
  onAmountChange: (id: number, amount: number) => void;
}) {
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
        await addSupplier({ name, category });
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
        `ลบ supplier "${name}"?\nถ้ามีประวัติยอดซื้อ ระบบจะซ่อนแทนการลบ (รักษาประวัติ)`
      )
    )
      return;
    startDelete(async () => {
      await deleteSupplier(id);
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CatIcon className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
          {title}
        </div>
        <div className="text-xs text-muted tabular-nums">
          รวม {fmt(subtotal)}
        </div>
      </div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="group grid grid-cols-[1fr_180px_28px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
          >
            <div className="text-sm">
              <span className="text-muted-soft mr-2 tabular-nums">
                {i + 1}.
              </span>
              {r.name}
            </div>
            <MoneyInput
              ariaLabel={r.name}
              value={r.amount}
              onChange={(n) => onAmountChange(r.id, n)}
            />
            <button
              type="button"
              onClick={() => handleDelete(r.id, r.name)}
              disabled={pendingDelete}
              className="text-muted-soft hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30 transition-opacity"
              aria-label={`ลบ supplier ${r.name}`}
              title={`ลบ supplier ${r.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        ))}

        {addMode ? (
          <form
            onSubmit={handleAdd}
            className="mt-1 px-2 py-2 rounded bg-surface space-y-2"
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
                  placeholder={`ชื่อ supplier ใหม่ใน "${title}"`}
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
            className="mt-1 flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted hover:text-ink hover:bg-surface rounded transition-colors"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            เพิ่ม supplier ใน {title}
          </button>
        )}
      </div>
    </div>
  );
}
