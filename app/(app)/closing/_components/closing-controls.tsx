"use client";

import { useState, useTransition } from "react";
import {
  Lock,
  Unlock,
  RefreshCw,
  FileDown,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { closeMonth, reopenMonth, resyncClosing } from "../actions";

type Mode = "close" | "reopen" | "resync" | null;

const TITLES: Record<Exclude<Mode, null>, string> = {
  close: "ปิดงบประจำเดือน",
  reopen: "เปิดงบเพื่อแก้ไข",
  resync: "ดึงตัวเลขล่าสุดมาปิดใหม่",
};

export function ClosingControls({
  fiscalMonthId,
  monthLabel,
  isClosed,
  hasDrift,
  exportHref,
}: {
  fiscalMonthId: number;
  monthLabel: string;
  isClosed: boolean;
  hasDrift: boolean;
  exportHref: string;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open(m: Mode) {
    setMode(m);
    setPassword("");
    setNote("");
    setError(null);
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        if (mode === "close")
          await closeMonth({ fiscalMonthId, password, note });
        else if (mode === "reopen")
          await reopenMonth({ fiscalMonthId, password });
        else if (mode === "resync")
          await resyncClosing({ fiscalMonthId, password });
        setMode(null);
        setPassword("");
        setNote("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isClosed && (
        <button
          type="button"
          onClick={() => open("close")}
          className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-sm font-medium text-canvas hover:bg-ink-2"
        >
          <Lock className="h-4 w-4" strokeWidth={2} />
          ปิดงบเดือนนี้
        </button>
      )}
      {isClosed && (
        <>
          {hasDrift && (
            <button
              type="button"
              onClick={() => open("resync")}
              className="inline-flex items-center gap-1.5 rounded-pill bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Re-sync ตัวเลข
            </button>
          )}
          <button
            type="button"
            onClick={() => open("reopen")}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-4 py-2 text-sm font-medium hover:bg-surface"
          >
            <Unlock className="h-4 w-4" strokeWidth={2} />
            เปิดแก้ไข
          </button>
        </>
      )}
      <a
        href={exportHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-4 py-2 text-sm font-medium hover:bg-surface"
      >
        <FileDown className="h-4 w-4" strokeWidth={2} />
        Export PDF
      </a>

      {/* Approval modal */}
      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !pending && setMode(null)}
          />
          <div className="relative w-full max-w-sm rounded-card border border-hairline bg-canvas p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck
                className="h-5 w-5 text-amber-600"
                strokeWidth={1.75}
              />
              {TITLES[mode]} — {monthLabel}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {mode === "close" &&
                "บันทึกตัวเลข P&L ของเดือนนี้เป็นทางการ (freeze)"}
              {mode === "reopen" &&
                "ปลดล็อกเพื่อแก้ไข — ตัวเลขอาจเปลี่ยนได้จนกว่าจะปิดใหม่"}
              {mode === "resync" &&
                "อัปเดต snapshot ให้ตรงกับข้อมูลรายวันล่าสุด"}
            </p>

            {mode === "close" && (
              <div className="mt-3">
                <label className="block text-xs text-muted mb-1">
                  หมายเหตุการปิดงบ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="เช่น ตรวจสอบครบแล้ว"
                  className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
                />
              </div>
            )}

            <div className="mt-3">
              <label className="block text-xs text-muted mb-1">
                รหัสอนุมัติเจ้าของ
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password) submit();
                }}
                placeholder="••••••••"
                className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
              />
            </div>

            {error && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
                {error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                disabled={pending}
                className="rounded-pill px-3 py-1.5 text-sm text-muted hover:text-ink"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !password}
                className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-sm font-medium text-canvas disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                อนุมัติ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
