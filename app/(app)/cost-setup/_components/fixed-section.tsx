"use client";

import { useState } from "react";
import { Home, FolderDot } from "lucide-react";
import { saveFixed } from "../actions";
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
  const total = rows.reduce((s, r) => s + r.amount, 0);

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
        <div className="grid grid-cols-[1fr_180px] gap-3 px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted">
          <div>หมวด</div>
          <div className="text-right">จำนวน (บาท)</div>
        </div>
        {rows.map((r, i) => {
          const RowIcon = FIXED_CAT_ICONS[r.name] ?? FolderDot;
          return (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_180px] gap-3 items-center px-2 py-1 rounded hover:bg-surface"
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
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
