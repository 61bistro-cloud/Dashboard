"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FolderOpen, Check, X } from "lucide-react";
import { importPosBills, type ImportResult } from "../actions";

export function UploadForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setResult(null);
      const r = await importPosBills(fd);
      setResult(r);
      if (r.ok && fileRef.current) {
        fileRef.current.value = "";
        setFileName("");
      }
    });
  };

  return (
    <section className="rounded-card border border-hairline bg-canvas p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold mb-1">
        <Upload className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
        Upload Foodstory export
      </h2>
      <p className="text-xs text-muted mb-4">
        ไฟล์: รายงาน &ldquo;สรุปยอดขายแยกตามบิล&rdquo; (.xlsx) — ระบบ dedupe
        ตามเลขบิลอัตโนมัติ การอัปโหลดซ้ำจะแทนค่าเก่า
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 rounded-input border border-dashed border-hairline bg-surface px-4 py-2 cursor-pointer hover:bg-surface">
            <FolderOpen className="h-4 w-4 text-muted" strokeWidth={1.75} />
            <span className="text-sm">เลือกไฟล์</span>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".xlsx,.xls"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="hidden"
            />
          </label>
          {fileName && (
            <span className="text-sm text-ink/75 truncate max-w-md">
              {fileName}
            </span>
          )}
          <button
            type="submit"
            disabled={pending || !fileName}
            className="rounded-input bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-2 disabled:opacity-50 transition-colors"
          >
            {pending ? "กำลังนำเข้า…" : "นำเข้า"}
          </button>
        </div>
      </form>

      {result && (
        <div
          className={
            "mt-4 rounded-input border p-4 " +
            (result.ok
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50")
          }
        >
          {result.ok ? (
            <>
              <div className="flex items-center gap-2 font-semibold text-emerald-900">
                <Check className="h-4 w-4" strokeWidth={2.5} />
                นำเข้าสำเร็จ
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Counter label="ทั้งหมด" value={result.totalRows} />
                <Counter
                  label="เพิ่มใหม่"
                  value={result.inserted}
                  cls="text-emerald-700"
                />
                <Counter
                  label="อัปเดต"
                  value={result.updated}
                  cls="text-sky-700"
                />
                <Counter
                  label="Error"
                  value={result.errored}
                  cls={result.errored > 0 ? "text-red-700" : "text-muted"}
                />
              </div>
            </>
          ) : (
            <div className="text-red-900">
              <div className="flex items-center gap-2 font-semibold">
                <X className="h-4 w-4" strokeWidth={2.5} />
                นำเข้าไม่สำเร็จ
              </div>
              <div className="text-sm mt-1">{result.message}</div>
            </div>
          )}

          {result.errors.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-ink/75">
                แสดง error {result.errors.length} รายการแรก
              </summary>
              <ul className="mt-2 space-y-1 text-ink/90 font-mono">
                {result.errors.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function Counter({
  label,
  value,
  cls,
}: {
  label: string;
  value: number;
  cls?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={"text-lg font-semibold tabular-nums " + (cls ?? "")}>
        {value.toLocaleString("th-TH")}
      </div>
    </div>
  );
}
