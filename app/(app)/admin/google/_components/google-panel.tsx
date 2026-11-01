"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FolderTree,
  RefreshCw,
  Loader2,
  Check,
  Unlink,
  ExternalLink,
} from "lucide-react";
import { createStructure, syncNow, disconnectGoogle } from "../actions";

import { EvidenceUpload } from "./evidence-upload";

type Month = { id: number; label: string };

export function GooglePanel({
  businessId,
  connected,
  structureReady,
  months,
}: {
  businessId: number;
  connected: boolean;
  structureReady: boolean;
  months: Month[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run(
    fn: () => Promise<{ ok: boolean; message?: string } | void>,
    okMsg?: string
  ) {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (r && r.ok === false) {
          setErr(r.message ?? "เกิดข้อผิดพลาด");
          return;
        }
        if (okMsg) setMsg(okMsg);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  if (!connected) {
    return (
      <a
        href="/api/google/connect"
        className="inline-flex items-center gap-2 rounded-pill bg-ink px-4 py-2 text-sm font-medium text-canvas"
      >
        <ExternalLink className="h-4 w-4" /> เชื่อม Google Drive ของร้าน
      </a>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!structureReady && (
          <button
            type="button"
            onClick={() =>
              run(() => createStructure(), "สร้างโฟลเดอร์ + Master Sheet แล้ว")
            }
            disabled={pending || uploading}
            className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderTree className="h-3.5 w-3.5" />
            )}
            สร้างโครงสร้าง Drive + Master Sheet
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const r = await syncNow();
              if (!r.ok) return r;
              setMsg(`ซิงค์เข้า Master Sheet แล้ว (${r.tabs} แท็บ)`);
            })
          }
          disabled={pending || uploading}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-4 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          ซิงค์ข้อมูลเข้า Master Sheet ตอนนี้
        </button>
        <button
          type="button"
          onClick={() =>
            run(() => disconnectGoogle(), "ตัดการเชื่อม Google แล้ว")
          }
          disabled={pending || uploading}
          className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Unlink className="h-3.5 w-3.5" /> ตัดการเชื่อม
        </button>
      </div>

      {/* Evidence upload */}
      <EvidenceUpload
        key={businessId}
        businessId={businessId}
        months={months}
        disabled={pending || !structureReady}
        onBusy={setUploading}
      />

      {msg && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" /> {msg}
        </p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
