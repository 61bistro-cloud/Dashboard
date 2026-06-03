"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTransaction } from "../actions";

export function DeleteButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("ลบรายการนี้?")) return;
        start(async () => {
          await deleteTransaction(id);
        });
      }}
      className="text-muted-soft hover:text-red-600 disabled:opacity-50 transition-colors"
      aria-label="ลบรายการ"
    >
      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}
