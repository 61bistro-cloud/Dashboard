"use client";

import { useState } from "react";
import { Boxes } from "lucide-react";
import { saveSuppliers } from "../actions";
import { MoneyInput, fmt } from "./money-input";
import { SectionCard } from "./section-card";
import { SUPPLIER_CATEGORY_LABELS } from "@/lib/fiscal";
import { SUPPLIER_CAT_ICONS } from "@/lib/icons";

type SupRow = {
  id: number;
  name: string;
  category: "FOOD" | "BEVERAGE" | "PACKAGING";
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
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const grouped: Record<SupRow["category"], SupRow[]> = {
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
      <div className="space-y-5">
        {(["FOOD", "BEVERAGE", "PACKAGING"] as const).map((cat) => {
          const list = grouped[cat];
          if (list.length === 0) return null;
          const subtotal = list.reduce((s, r) => s + r.amount, 0);
          const meta = SUPPLIER_CATEGORY_LABELS[cat];
          const CatIcon = SUPPLIER_CAT_ICONS[cat];
          return (
            <div key={cat}>
              <div className="mb-2 flex items-center justify-between px-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CatIcon
                    className="h-4 w-4 text-muted-soft"
                    strokeWidth={1.75}
                  />
                  {meta.label}
                </div>
                <div className="text-xs text-muted tabular-nums">
                  รวม {fmt(subtotal)}
                </div>
              </div>
              <div className="space-y-1">
                {list.map((r, i) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_180px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
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
                      onChange={(n) =>
                        setRows((prev) =>
                          prev.map((p) =>
                            p.id === r.id ? { ...p, amount: n } : p
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
