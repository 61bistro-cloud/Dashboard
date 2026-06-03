"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function AccountTabs({
  accounts,
  currentCode,
  monthId,
}: {
  accounts: { code: string; name: string }[];
  currentCode: string;
  monthId: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <nav className="flex gap-1 border-b border-hairline">
      {accounts.map((a) => {
        const active = a.code === currentCode;
        return (
          <button
            key={a.code}
            type="button"
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set("month", String(monthId));
              p.set("account", a.code);
              router.push(`/bank?${p.toString()}`);
            }}
            className={
              "px-4 py-2 text-sm border-b-2 -mb-px transition-colors " +
              (active
                ? "border-ink text-ink font-medium"
                : "border-transparent text-ink/75 hover:text-ink")
            }
          >
            {a.name}
          </button>
        );
      })}
    </nav>
  );
}
