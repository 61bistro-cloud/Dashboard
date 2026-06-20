"use client";

import { useTransition } from "react";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";

/** Up/down arrows that call a move action; disabled at the list edges. */
export function ReorderButtons({
  onMove,
  isFirst,
  isLast,
}: {
  onMove: (dir: "up" | "down") => Promise<void>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, start] = useTransition();

  function go(d: "up" | "down") {
    start(async () => {
      try {
        await onMove(d);
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={() => go("up")}
        disabled={pending || isFirst}
        className="text-muted-soft hover:text-ink disabled:opacity-20 p-0.5"
        aria-label="เลื่อนขึ้น"
        title="เลื่อนขึ้น"
      >
        <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => go("down")}
        disabled={pending || isLast}
        className="text-muted-soft hover:text-ink disabled:opacity-20 p-0.5"
        aria-label="เลื่อนลง"
        title="เลื่อนลง"
      >
        <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {pending && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-soft ml-0.5" />
      )}
    </span>
  );
}
