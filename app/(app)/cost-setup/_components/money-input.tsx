"use client";

import { useEffect, useState } from "react";

export function MoneyInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}) {
  // Keep the raw text the user is typing so trailing "." / leading "0" /
  // mid-typed decimals like "7893." don't get eaten by Number() and then
  // re-rendered back into the field without the dot.
  const [local, setLocal] = useState<string>(value === 0 ? "" : String(value));

  // Sync from parent only when parent's value disagrees with what the user
  // currently sees (e.g. form reset, navigating to a new row). This avoids
  // clobbering mid-typed text like "7893.".
  useEffect(() => {
    const parsed = local === "" ? 0 : Number(local);
    if (!Number.isFinite(parsed) || parsed !== value) {
      setLocal(value === 0 ? "" : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={local}
      placeholder="0.00"
      onChange={(e) => {
        const raw = e.target.value.replace(/[,\s]/g, "");
        setLocal(raw);
        // Mid-typing states that aren't valid numbers yet — keep them in
        // the field but tell the parent the value is 0 for now.
        if (raw === "" || raw === "-" || raw === ".") {
          onChange(0);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      onBlur={() => {
        // On blur, normalize stray mid-typed bits like "." or "-"
        if (local === "" || local === "-" || local === ".") {
          setLocal("");
        }
      }}
      onFocus={(e) => e.target.select()}
      className="w-full rounded-input border border-hairline bg-canvas px-2.5 py-1.5 text-right text-sm tabular-nums focus:border-ink focus:outline-none"
    />
  );
}

export function fmt(n: number): string {
  if (n === 0) return "-";
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
