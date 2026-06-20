"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PrintButton({ auto }: { auto?: boolean }) {
  useEffect(() => {
    if (auto) {
      // Give the browser a beat to lay out before opening the print dialog
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [auto]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
    >
      <Printer className="h-4 w-4" />
      พิมพ์ / บันทึกเป็น PDF
    </button>
  );
}
