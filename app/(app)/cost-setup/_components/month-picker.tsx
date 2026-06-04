"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function MonthPicker({
  months,
  currentId,
}: {
  months: { id: number; label: string }[];
  currentId: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <select
      value={currentId}
      onChange={(e) => {
        const p = new URLSearchParams(params);
        p.set("month", e.target.value);
        router.push(`${pathname}?${p.toString()}`);
      }}
      className="w-full sm:w-auto rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
    >
      {months.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
