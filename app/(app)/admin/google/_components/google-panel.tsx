"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FolderTree,
  RefreshCw,
  Upload,
  Loader2,
  Check,
  Unlink,
  ExternalLink,
} from "lucide-react";
import {
  createStructure,
  syncNow,
  disconnectGoogle,
  uploadEvidenceFile,
} from "../actions";

type Month = { id: number; label: string };

export function GooglePanel({
  connected,
  structureReady,
  months,
}: {
  connected: boolean;
  structureReady: boolean;
  months: Month[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
            disabled={pending}
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
          disabled={pending}
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
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Unlink className="h-3.5 w-3.5" /> ตัดการเชื่อม
        </button>
      </div>

      {/* Evidence upload */}
      <UploadForm
        months={months}
        disabled={pending}
        onResult={(ok, m) => {
          if (ok) {
            setMsg(m ?? "อัปโหลดเข้า Drive แล้ว");
            router.refresh();
          } else setErr(m ?? "อัปโหลดไม่สำเร็จ");
        }}
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

function UploadForm({
  months,
  disabled,
  onResult,
}: {
  months: Month[];
  disabled: boolean;
  onResult: (ok: boolean, msg?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"SLIP" | "BILL">("SLIP");
  const [monthId, setMonthId] = useState<string>(
    months[0] ? String(months[0].id) : ""
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    if (!fileInput.files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      if (monthId) fd.append("fiscalMonthId", monthId);
      fd.append("file", fileInput.files[0]);
      const r = await uploadEvidenceFile(fd);
      onResult(!!r.ok, r.ok ? "อัปโหลดเข้า Drive แล้ว" : r.message);
      if (r.ok) form.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-card border border-hairline bg-surface/50 p-3"
    >
      <div className="text-xs font-medium w-full">
        <Upload className="inline h-3.5 w-3.5 mr-1" /> อัปโหลดหลักฐานเข้า Drive
      </div>
      <label className="text-xs">
        <span className="block text-muted mb-0.5">ประเภท</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "SLIP" | "BILL")}
          className="rounded border border-hairline-soft bg-canvas px-2 py-1"
        >
          <option value="SLIP">หลักฐานการโอน (สลิป)</option>
          <option value="BILL">บิลซื้อ</option>
        </select>
      </label>
      <label className="text-xs">
        <span className="block text-muted mb-0.5">เดือน</span>
        <select
          value={monthId}
          onChange={(e) => setMonthId(e.target.value)}
          className="rounded border border-hairline-soft bg-canvas px-2 py-1"
        >
          <option value="">— ไม่ระบุ —</option>
          {months.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs flex-1 min-w-[200px]">
        <span className="block text-muted mb-0.5">ไฟล์ (รูป/PDF)</span>
        <input
          type="file"
          name="file"
          accept="image/*,application/pdf"
          required
          className="block w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded-pill file:border-0 file:bg-ink file:text-canvas file:cursor-pointer"
        />
      </label>
      <button
        type="submit"
        disabled={busy || disabled}
        className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        อัปโหลด
      </button>
    </form>
  );
}
