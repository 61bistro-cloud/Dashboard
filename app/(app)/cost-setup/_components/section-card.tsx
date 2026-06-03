"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { fmt } from "./money-input";
import type { LucideIcon } from "lucide-react";

export function SectionCard({
  icon: Icon,
  title,
  total,
  onSave,
  children,
}: {
  icon: LucideIcon;
  title: string;
  total: number;
  onSave: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <section className="rounded-card border border-hairline bg-canvas">
      <header className="flex items-center justify-between border-b border-hairline-soft px-6 py-5">
        <h2 className="flex items-center gap-3 text-[17px] font-semibold tracking-tight">
          <Icon className="h-5 w-5 text-muted" strokeWidth={1.6} />
          {title}
        </h2>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted">
              รวม
            </div>
            <div className="text-[18px] font-semibold tabular-nums">
              {fmt(total)}
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setSaved(false);
                await onSave();
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
              })
            }
            className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-5 py-2.5 text-[14px] font-medium text-canvas hover:bg-ink-2 disabled:opacity-50 transition-colors"
          >
            {saved && <Check className="h-4 w-4" strokeWidth={2.5} />}
            {pending ? "กำลังบันทึก…" : saved ? "บันทึกแล้ว" : "บันทึก"}
          </button>
        </div>
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}
