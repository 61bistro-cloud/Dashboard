"use client";

export function MoneyInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={value === 0 ? "" : String(value)}
      placeholder="0.00"
      onChange={(e) => {
        const raw = e.target.value.replace(/[,\s]/g, "");
        if (raw === "" || raw === "-") return onChange(0);
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      onFocus={(e) => e.target.select()}
      className="w-full rounded-input border border-hairline bg-canvas px-2.5 py-1.5 text-right text-sm tabular-nums focus:border-ink focus:outline-none  "
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
