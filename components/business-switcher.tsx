"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { switchBusiness } from "@/app/(app)/business-actions";

type BizOpt = { id: number; name: string; slug: string };

export function BusinessSwitcher({
  businesses,
  currentId,
}: {
  businesses: BizOpt[];
  currentId: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  const current = businesses.find((b) => b.id === currentId) ?? businesses[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Single business → no dropdown, just a label
  if (businesses.length <= 1) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-card bg-ink text-canvas">
          <Building2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight tracking-tight">
            {current?.name ?? "ธุรกิจ"}
          </div>
          <div className="text-xs text-muted">ระบบบัญชี 2569</div>
        </div>
      </div>
    );
  }

  function onPick(id: number) {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await switchBusiness(id);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex w-full items-center gap-3 rounded-card px-1 py-1 hover:bg-surface transition-colors disabled:opacity-60"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-card bg-ink text-canvas shrink-0">
          <Building2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[15px] font-semibold leading-tight tracking-tight truncate">
            {current?.name ?? "เลือกธุรกิจ"}
          </div>
          <div className="text-xs text-muted">แตะเพื่อสลับธุรกิจ</div>
        </div>
        <ChevronDown
          className={
            "h-4 w-4 text-muted-soft shrink-0 transition-transform " +
            (open ? "rotate-180" : "")
          }
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-card border border-hairline bg-canvas shadow-lg overflow-hidden">
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onPick(b.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface transition-colors"
            >
              <span className="flex-1 truncate">{b.name}</span>
              {b.id === currentId && (
                <Check
                  className="h-4 w-4 text-ink shrink-0"
                  strokeWidth={2.5}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
