"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Trash2, AlertCircle, Lock } from "lucide-react";
import { deletePosBatch } from "../actions";

export function DeleteBatchButton({
  batchId,
  fileName,
  rowCount,
}: {
  batchId: number;
  fileName: string;
  rowCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Focus after dialog opens
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const close = () => {
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await deletePosBatch({ id: batchId, password });
      if (r.ok) {
        close();
      } else {
        setError(r.message ?? "ลบไม่สำเร็จ");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-soft hover:text-red-600 transition-colors"
        aria-label={`ลบ ${fileName}`}
        title="ลบ batch นี้"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>

      <dialog
        ref={dialogRef}
        onClose={close}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        className="rounded-card border border-hairline bg-canvas text-ink p-0 max-w-md w-[90vw] backdrop:bg-black/50"
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-card bg-pink shrink-0">
              <Trash2 className="h-5 w-5 text-black" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold">
                ยืนยันการลบ Import Batch
              </h3>
              <p className="text-sm text-muted mt-1">
                จะลบไฟล์{" "}
                <span className="font-medium text-ink break-all">
                  {fileName}
                </span>{" "}
                และ
                <span className="font-medium text-ink">
                  {" "}
                  {rowCount} บิล
                </span>{" "}
                ที่เกี่ยวข้องออกจากระบบ
              </p>
              <p className="text-xs text-muted mt-1.5">
                ⚠️ การลบนี้ไม่สามารถย้อนกลับได้ — Dashboard / Daily P&L / Bank
                reconciliation จะอัปเดตทันที
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor={`pwd-${batchId}`}
              className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5 uppercase tracking-wide"
            >
              <Lock className="h-3 w-3" strokeWidth={2} />
              รหัสผ่านยืนยันการลบ
            </label>
            <input
              ref={inputRef}
              id={`pwd-${batchId}`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="off"
              placeholder="••••••••"
              className="w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-input bg-pink px-3 py-2 text-sm text-black">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="rounded-pill px-4 py-2 text-sm text-muted hover:text-ink hover:bg-surface disabled:opacity-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || !password}
              className="rounded-pill bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "กำลังลบ…" : "ลบ Batch + บิล"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
