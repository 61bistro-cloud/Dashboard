"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setOpeningBalance } from "../actions";

export function OpeningBalanceForm({
  fiscalMonthId,
  accountId,
  initial,
}: {
  fiscalMonthId: number;
  accountId: number;
  initial: number;
}) {
  const [pending, start] = useTransition();
  const [val, setVal] = useState(String(initial || ""));
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setSaved(false);
          await setOpeningBalance({
            fiscalMonthId,
            accountId,
            amount: val || 0,
          });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        });
      }}
      className="flex items-center gap-2 text-xs"
    >
      <label className="text-muted">ยอดยกมา:</label>
      <input
        type="text"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="0"
        className="w-32 rounded-input border border-hairline px-2 py-1 text-right tabular-nums"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-input bg-hairline px-2 py-1 text-ink/90 hover:bg-slate-300 disabled:opacity-50"
      >
        {pending ? (
          "..."
        ) : saved ? (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          "Set"
        )}
      </button>
    </form>
  );
}
