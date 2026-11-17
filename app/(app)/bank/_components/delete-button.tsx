"use client";

import { useUi } from "@/lib/i18n/use-ui";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTransaction } from "../actions";

export function DeleteButton({ id }: { id: number }) {
  const { ui } = useUi();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(ui("ลบรายการนี้?"))) return;
        start(async () => {
          await deleteTransaction(id);
        });
      }}
      className="text-muted-soft hover:text-red-600 disabled:opacity-50 transition-colors"
      aria-label={ui("ลบรายการ")}
    >
      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}
