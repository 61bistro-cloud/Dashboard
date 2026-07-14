"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Loader2, X, ExternalLink } from "lucide-react";
import { attachFile, removeAttachment } from "@/app/(app)/attachments/actions";

export type AttachedFile = { id: number; name: string; webViewLink: string };

/** Compact attach-file control for table rows. Shows existing file links +
 *  a paperclip to add one. Uploads to Google Drive and links it to the record. */
export function AttachButton({
  refType,
  refId,
  fiscalMonthId,
  kind = "SLIP",
  files,
}: {
  refType: "BANK_TX" | "PURCHASE" | "CLOSING" | "POS";
  refId: string;
  fiscalMonthId?: number | null;
  kind?: "SLIP" | "BILL";
  files: AttachedFile[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("refType", refType);
      fd.append("refId", refId);
      fd.append("kind", kind);
      if (fiscalMonthId) fd.append("fiscalMonthId", String(fiscalMonthId));
      fd.append("file", file);
      const r = await attachFile(fd);
      if (inputRef.current) inputRef.current.value = "";
      if (!r.ok) setErr(r.message ?? "ผิดพลาด");
      else router.refresh();
    });
  }

  function onRemove(id: number) {
    setErr(null);
    startTransition(async () => {
      await removeAttachment(id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {files.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1 text-[11px] text-sky-800"
        >
          <a
            href={f.webViewLink}
            target="_blank"
            rel="noreferrer"
            title={f.name}
            className="inline-flex items-center gap-0.5 underline"
          >
            <ExternalLink className="h-3 w-3" /> ไฟล์
          </a>
          <button
            type="button"
            onClick={() => onRemove(f.id)}
            disabled={pending}
            className="text-sky-500 hover:text-red-600"
            aria-label="ลบไฟล์แนบ"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center rounded p-0.5 text-muted-soft hover:text-ink hover:bg-surface disabled:opacity-50"
        aria-label="แนบไฟล์"
        title="แนบไฟล์ (เก็บเข้า Google Drive)"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={onPick}
        className="hidden"
      />
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
