"use client";

import { useUi } from "@/lib/i18n/use-ui";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { setUserBusinesses } from "../actions";

type Biz = { id: number; name: string };

export function UserBusinessAssign({
  userId,
  allBusinesses,
  assigned,
  isOwner,
}: {
  userId: string;
  allBusinesses: Biz[];
  assigned: number[];
  isOwner: boolean;
}) {
  const { ui } = useUi();
  const [pending, startTransition] = useTransition();
  const [sel, setSel] = useState<number[]>(assigned);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  if (isOwner) {
    return (
      <span className="text-xs text-muted">
        {ui("ผู้ดูแลระบบ — เข้าถึงทุกธุรกิจ")}
      </span>
    );
  }

  function toggle(id: number) {
    setSaved(false);
    setSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function save() {
    startTransition(async () => {
      setError("");
      try {
        await setUserBusinesses({ userId, businessIds: sel });
        setSaved(true);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const dirty =
    sel.length !== assigned.length || sel.some((x) => !assigned.includes(x));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allBusinesses.map((b) => {
        const on = sel.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => toggle(b.id)}
            className={
              "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs border transition-colors " +
              (on
                ? "bg-ink text-canvas border-ink"
                : "bg-canvas text-muted border-hairline hover:border-ink/40")
            }
          >
            {on && <Check className="h-3 w-3" strokeWidth={2.5} />}
            {b.name}
          </button>
        );
      })}
      {dirty && (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-pill bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" strokeWidth={2.5} />
          )}{" "}
          {ui("บันทึก")}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {ui(error)}
        </p>
      )}
      {saved && !dirty && <span className="text-xs text-emerald-600">✓</span>}
    </div>
  );
}
