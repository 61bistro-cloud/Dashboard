"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setTransactionCategory } from "../actions";

type Cat = { id: number; name: string; kind: string };

/** Inline dropdown to (re)assign the category of an existing bank transaction. */
export function TxCategorySelect({
  txId,
  categoryId,
  categories,
}: {
  txId: number;
  categoryId: number | null;
  categories: Cat[];
}) {
  const [val, setVal] = useState(categoryId ? String(categoryId) : "");
  const [pending, start] = useTransition();

  function onChange(next: string) {
    setVal(next);
    start(async () => {
      try {
        await setTransactionCategory({ txId, categoryId: next || null });
      } catch (e) {
        alert((e as Error).message);
        setVal(categoryId ? String(categoryId) : "");
      }
    });
  }

  const income = categories.filter((c) => c.kind === "INCOME");
  const expense = categories.filter((c) => c.kind === "EXPENSE");
  const transfer = categories.filter((c) => c.kind === "TRANSFER");

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={val}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="w-full max-w-[210px] rounded border border-hairline-soft bg-canvas px-1.5 py-1 text-xs focus:border-ink focus:outline-none disabled:opacity-60"
      >
        <option value="">— ไม่ระบุ —</option>
        {income.length > 0 && (
          <optgroup label="รายรับ">
            {income.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {expense.length > 0 && (
          <optgroup label="รายจ่าย">
            {expense.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {transfer.length > 0 && (
          <optgroup label="โอน/ไม่นับ P&L">
            {transfer.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {pending && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-soft shrink-0" />
      )}
    </span>
  );
}
