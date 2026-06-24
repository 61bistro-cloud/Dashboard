"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Check, AlertCircle } from "lucide-react";
import { uploadSlip } from "../actions";

type Account = { id: number; name: string };

/** Downscale an image in the browser to keep uploads small + vision cheap. */
function resizeImage(file: File, max = 1400): Promise<Blob> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fall back to the original bytes
    };
    img.src = url;
  });
}

export function SlipUpload({
  accounts,
  aiOn,
}: {
  accounts: Account[];
  aiOn: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState<string>(
    accounts[0] ? String(accounts[0].id) : ""
  );
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState<{
    ok: number;
    dup: number;
    fail: number;
    review: number;
    unmatched: number;
  } | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const files = inputRef.current?.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, 30);
    setDone(null);

    startTransition(async () => {
      let ok = 0,
        dup = 0,
        fail = 0,
        review = 0,
        unmatched = 0;
      for (let i = 0; i < list.length; i++) {
        setProgress(`กำลังอ่านสลิป ${i + 1}/${list.length}…`);
        try {
          const blob = await resizeImage(list[i]);
          const fd = new FormData();
          if (accountId) fd.append("accountId", accountId);
          fd.append("file", blob, list[i].name.replace(/\.\w+$/, ".jpg"));
          const r = await uploadSlip(fd);
          if (!r.ok) fail++;
          else if (r.duplicate) dup++;
          else {
            ok++;
            if (r.status === "REVIEW") review++;
            else if (r.status === "UNMATCHED") unmatched++;
          }
        } catch {
          fail++;
        }
      }
      setProgress("");
      setDone({ ok, dup, fail, review, unmatched });
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
          อัปโหลดสลิปโอนเงิน
        </h2>
        <p className="text-xs text-muted mt-0.5">
          เลือกได้หลายรูปพร้อมกัน (สูงสุด 30) —{" "}
          {aiOn
            ? "ระบบจะอ่านยอด/วันเวลา/ผู้โอน แล้วจับคู่กับ statement ให้อัตโนมัติ"
            : "ระบบจะเก็บรูปไว้ให้กรอกยอดเอง (ยังไม่ได้เปิดการอ่านอัตโนมัติ)"}
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="px-5 py-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs text-muted mb-1">
            รูปสลิป (เลือกได้หลายรูป)
          </label>
          <input
            ref={inputRef}
            type="file"
            name="files"
            accept="image/*"
            multiple
            required
            className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-pill file:border-0 file:bg-ink file:text-canvas file:cursor-pointer"
          />
        </div>
        <div className="w-52">
          <label className="block text-xs text-muted mb-1">เข้าบัญชี</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="block w-full rounded-pill border border-hairline bg-canvas px-3 py-1.5 text-xs"
          >
            <option value="">ทุกบัญชี (จับคู่อัตโนมัติ)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          อัปโหลด
        </button>
      </form>

      {progress && (
        <div className="px-5 pb-4 -mt-1 text-xs text-muted flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progress}
        </div>
      )}

      {done && (
        <div className="px-5 pb-4 -mt-1">
          <div className="flex items-start gap-2 rounded-card border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <Check className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              อัปโหลด {done.ok} รายการ
              {done.review > 0 &&
                ` — จับคู่อัตโนมัติได้ ${done.review} (รอตรวจ)`}
              {done.unmatched > 0 &&
                ` — ยังไม่พบใน statement ${done.unmatched}`}
              {done.dup > 0 && (
                <span className="text-emerald-700/80">
                  {" "}
                  · ข้ามซ้ำ {done.dup}
                </span>
              )}
              {done.fail > 0 && (
                <span className="text-red-600"> · ผิดพลาด {done.fail}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {!aiOn && (
        <div className="px-5 pb-4">
          <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              ยังไม่ได้เปิดการอ่านสลิปอัตโนมัติ — ตั้งค่า{" "}
              <code className="font-mono">ANTHROPIC_API_KEY</code> ใน Vercel
              เพื่อให้ระบบอ่านยอดจากรูปให้เอง (ตอนนี้กรอกยอดเองในแต่ละสลิปได้)
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
