"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2, Check, Copy, Unlink } from "lucide-react";
import { saveLineConfig, disconnectLine } from "../actions";

export function LineConfig({
  configured,
  webhookUrl,
}: {
  configured: boolean;
  webhookUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function save() {
    setMsg(null);
    setErr(null);
    if (!secret && !token) {
      setErr("กรอก Channel secret และ/หรือ Access token");
      return;
    }
    startTransition(async () => {
      const r = await saveLineConfig({
        channelSecret: secret,
        channelToken: token,
      });
      if (r.ok) {
        setMsg("บันทึกการตั้งค่า LINE แล้ว");
        setSecret("");
        setToken("");
        router.refresh();
      } else setErr(r.message ?? "บันทึกไม่สำเร็จ");
    });
  }

  return (
    <section className="rounded-card border border-hairline bg-canvas p-5 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle
          className="h-4 w-4 text-emerald-600"
          strokeWidth={1.75}
        />
        รับสลิป/บิลผ่าน LINE
        <span
          className={
            "ml-1 rounded-pill px-2 py-0.5 text-xs " +
            (configured
              ? "bg-emerald-100 text-emerald-800"
              : "bg-neutral-100 text-neutral-600")
          }
        >
          {configured ? "ตั้งค่าแล้ว" : "ยังไม่ตั้งค่า"}
        </span>
      </h2>

      <div className="text-xs">
        <span className="block text-muted mb-1">
          Webhook URL (เอาไปวางใน LINE Developers → Messaging API)
        </span>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded border border-hairline-soft bg-surface px-2 py-1 break-all">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(webhookUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-1 rounded-pill border border-hairline px-2 py-1 text-xs hover:bg-surface"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs">
          <span className="block text-muted mb-0.5">Channel secret</span>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={
              configured
                ? "•••••• (ตั้งไว้แล้ว — เว้นว่างถ้าไม่เปลี่ยน)"
                : "วาง Channel secret"
            }
            autoComplete="off"
            className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1"
          />
        </label>
        <label className="text-xs">
          <span className="block text-muted mb-0.5">
            Channel access token (long-lived)
          </span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              configured
                ? "•••••• (ตั้งไว้แล้ว — เว้นว่างถ้าไม่เปลี่ยน)"
                : "วาง Access token"
            }
            autoComplete="off"
            className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          บันทึก
        </button>
        {configured && (
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await disconnectLine();
                router.refresh();
              })
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" /> ลบการตั้งค่า
          </button>
        )}
      </div>

      <p className="text-xs text-muted">
        รูปที่ส่งเข้า LINE จะถูกเก็บเป็น “หลักฐานการโอน” ในเดือนปัจจุบัน
        (ต้องเชื่อม Google Drive + สร้างโครงสร้างก่อน)
      </p>

      {msg && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" /> {msg}
        </p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </section>
  );
}
