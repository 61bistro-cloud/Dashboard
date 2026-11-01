"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Check, AlertCircle } from "lucide-react";
import { uploadEvidenceFile } from "../actions";
import {
  uploadEvidenceQueue,
  type EvidenceUploadItem,
  type EvidenceUploadContext,
} from "@/lib/evidence-upload";

type Month = { id: number; label: string };
export function EvidenceUpload({
  businessId,
  months,
  disabled,
  onBusy,
}: {
  businessId: number;
  months: Month[];
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [items, setItems] = useState<EvidenceUploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"SLIP" | "BILL">("SLIP");
  const [monthId, setMonthId] = useState("");
  const [context, setContext] = useState<EvidenceUploadContext | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const successCount = items.filter((item) => item.status === "success").length;
  const errorCount = items.filter((item) => item.status === "error").length;
  const completedCount = successCount + errorCount;
  const locked = busy || disabled || context !== null;

  async function start(retry = false) {
    if (running.current || disabled || !items.length) return;
    const selectedContext = context ?? {
      businessId,
      kind,
      fiscalMonthId: monthId,
    };
    if (!selectedContext.fiscalMonthId) {
      setError("กรุณาเลือกเดือนของหลักฐานชุดนี้");
      return;
    }
    const queue = retry
      ? items.filter((item) => item.status === "error")
      : items;
    if (!queue.length) return;
    const queuedIds = new Set(queue.map((item) => item.id));
    setItems((previous) =>
      previous.map((item) =>
        queuedIds.has(item.id)
          ? { ...item, status: "pending", message: undefined }
          : item
      )
    );
    running.current = true;
    setBusy(true);
    onBusy(true);
    setError(null);
    setMessage(null);
    setContext(selectedContext);
    try {
      const result = await uploadEvidenceQueue(
        queue,
        selectedContext,
        uploadEvidenceFile,
        (id, status, message) => {
          setItems((previous) =>
            previous.map((item) =>
              item.id === id ? { ...item, status, message } : item
            )
          );
        }
      );
      setMessage(
        `สำเร็จ ${result.succeeded} ไฟล์${result.failed ? ` • ไม่สำเร็จ ${result.failed} ไฟล์ ดูรายละเอียดด้านล่าง` : ""}`
      );
      if (result.succeeded > 0) router.refresh();
    } finally {
      running.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
      className="rounded-card border border-hairline bg-surface/50 p-3 space-y-3"
    >
      <h3 className="flex items-center gap-2 text-xs font-medium">
        <Upload className="h-3.5 w-3.5" />
        อัปโหลดหลักฐานหลายไฟล์เข้า Drive
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="block text-muted mb-1">ประเภทของทั้งชุด</span>
          <select
            value={kind}
            disabled={locked}
            onChange={(event) => setKind(event.target.value as "SLIP" | "BILL")}
            className="rounded border border-hairline-soft bg-canvas px-2 py-1"
          >
            <option value="SLIP">หลักฐานการโอน (สลิป)</option>
            <option value="BILL">บิลซื้อ</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-muted mb-1">เดือนของทั้งชุด</span>
          <select
            value={monthId}
            required
            disabled={locked}
            onChange={(event) => setMonthId(event.target.value)}
            className="rounded border border-hairline-soft bg-canvas px-2 py-1"
          >
            <option value="">— เลือกเดือน —</option>
            {months.map((month) => (
              <option key={month.id} value={month.id}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs flex-1 min-w-[200px]">
          <span className="block text-muted mb-1">
            ไฟล์รูปภาพ / PDF (เลือกหลายไฟล์ได้)
          </span>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*,application/pdf"
            disabled={locked}
            onChange={(event) => {
              setItems(
                Array.from(event.target.files ?? []).map((file) => ({
                  id: crypto.randomUUID(),
                  file,
                  status: "pending",
                }))
              );
              setMessage(null);
              setError(null);
            }}
            className="block w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded-pill file:border-0 file:bg-ink file:text-canvas file:cursor-pointer"
          />
        </label>
        {!context && (
          <button
            type="submit"
            disabled={busy || disabled || items.length === 0 || !monthId}
            className="inline-flex items-center gap-1.5 rounded-pill bg-ink text-canvas px-4 py-1.5 text-xs disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            อัปโหลด {items.length ? `ทั้งหมด ${items.length} ไฟล์` : "ทั้งหมด"}
          </button>
        )}
        {context && !busy && errorCount > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void start(true)}
            className="rounded-pill border border-hairline px-3 py-1.5 text-xs disabled:opacity-50"
          >
            ลองใหม่เฉพาะที่ไม่สำเร็จ ({errorCount})
          </button>
        )}
        {context && !busy && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setContext(null);
              setItems([]);
              setMessage(null);
              setError(null);
              if (input.current) input.current.value = "";
            }}
            className="rounded-pill border border-hairline px-3 py-1.5 text-xs disabled:opacity-50"
          >
            เลือกไฟล์ชุดใหม่
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        เลือกหลายรูปพร้อมกันได้ด้วย Ctrl / Cmd หรือ Shift • ไม่เกิน 4 MB ต่อไฟล์
        • ทุกไฟล์ใช้ประเภทและเดือนเดียวกัน ระบบยังไม่อ่านวันที่จากรูป
      </p>
      {items.length > 0 && (
        <p className="text-xs">
          เลือก {items.length} ไฟล์ • {kind === "SLIP" ? "สลิป" : "บิลซื้อ"} •{" "}
          {months.find((month) => String(month.id) === monthId)?.label ??
            "ยังไม่เลือกเดือน"}
        </p>
      )}
      {busy && (
        <div role="status" className="text-xs space-y-2">
          <p className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ดำเนินการ {completedCount} / {items.length} ไฟล์ —
            โปรดเปิดหน้านี้ไว้จนเสร็จ
          </p>
          <progress
            className="w-full"
            value={completedCount}
            max={items.length}
            aria-label="ความคืบหน้าอัปโหลดหลักฐาน"
          />
        </div>
      )}
      {message && (
        <p role="status" className="text-xs">
          {message} • รวมสำเร็จ {successCount} / {items.length} ไฟล์
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <ul
          className="max-h-64 overflow-y-auto divide-y divide-hairline-soft text-xs"
          aria-label="รายการไฟล์อัปโหลด"
        >
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 py-2">
              {item.status === "success" ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              ) : item.status === "error" ? (
                <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
              ) : item.status === "uploading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              ) : null}
              <span className="break-all flex-1">
                {item.file.name}
                {item.message && (
                  <span className="block text-red-600">{item.message}</span>
                )}
              </span>
              <span className="shrink-0 text-muted">
                {
                  {
                    pending: "รออัปโหลด",
                    uploading: "กำลังอัปโหลด",
                    success: "สำเร็จ",
                    error: "ไม่สำเร็จ",
                  }[item.status]
                }
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
