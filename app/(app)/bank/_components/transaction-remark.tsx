"use client";
import { useState, useEffect, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/i18n/use-ui";
import { saveTransactionRemark } from "../remark-actions";
type Snapshot = { remark: string; version: string };
export function TransactionRemark({
  businessId,
  accountId,
  fiscalMonthId,
  transactionId,
  description,
  remark,
  version,
  disabled = false,
}: {
  businessId: number;
  accountId: number;
  fiscalMonthId: number;
  transactionId: number;
  description: string;
  remark: string;
  version?: string;
  disabled?: boolean;
}) {
  const { ui } = useUi(),
    router = useRouter();
  const [base, setBase] = useState<Snapshot>({
      remark,
      version: version ?? "",
    }),
    [draft, setDraft] = useState(remark),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [latest, setLatest] = useState<Snapshot | null>(null),
    [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!editing) {
      setBase({ remark, version: version ?? "" });
      setDraft(remark);
    } else if (version && version !== base.version) {
      setLatest({ remark, version });
      setError("หมายเหตุเปลี่ยนไปแล้ว กรุณาตรวจข้อความล่าสุดก่อนบันทึก");
    }
  }, [remark, version]);
  function cancel() {
    setEditing(false);
    setDraft(remark);
    setBase({ remark, version: version ?? "" });
    setLatest(null);
    setError("");
    router.refresh();
  }
  function save() {
    setError("");
    start(async () => {
      try {
        const r = await saveTransactionRemark({
          businessId,
          accountId,
          fiscalMonthId,
          transactionId,
          remark: draft,
          version: base.version,
        });
        if (r.ok) {
          setBase({ remark: r.remark, version: r.version });
          setDraft(r.remark);
          setEditing(false);
          setSaved(true);
          setLatest(null);
          router.refresh();
        } else {
          setError(r.message);
          if ("current" in r && r.current) setLatest(r.current);
        }
      } catch {
        setError("บันทึกหมายเหตุไม่สำเร็จ ข้อความที่แก้ไขยังอยู่ กรุณาลองใหม่");
      }
    });
  }
  return (
    <div className="w-[240px] max-w-[320px] space-y-2">
      {editing ? (
        <>
          <textarea
            aria-label={ui("หมายเหตุของรายการ {v0}", { v0: description })}
            rows={3}
            maxLength={2000}
            value={draft}
            disabled={pending || disabled}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
            className="block w-full resize-y rounded-input border border-hairline bg-canvas p-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || disabled}
              className="inline-flex items-center gap-1 rounded-pill bg-ink px-3 py-1.5 text-canvas disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              {ui(pending ? "กำลังบันทึก..." : "บันทึกหมายเหตุ")}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-pill border border-hairline px-2 py-1.5"
            >
              <X className="h-3 w-3" />
              {ui("ยกเลิก")}
            </button>
            <span className="text-[10px] text-muted">{draft.length}/2,000</span>
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words leading-5">
            {base.remark || "—"}
          </p>
          <button
            type="button"
            aria-label={ui("แก้ไขหมายเหตุของรายการ {v0}", { v0: description })}
            disabled={disabled || !base.version}
            onClick={() => {
              setEditing(true);
              setSaved(false);
              setError("");
              setDraft(base.remark);
            }}
            className="inline-flex items-center gap-1 text-[11px] text-muted underline underline-offset-2 disabled:opacity-40"
          >
            <Pencil className="h-3 w-3" />
            {ui(base.remark ? "แก้ไขหมายเหตุ" : "เพิ่มหมายเหตุ")}
          </button>
          {saved && (
            <p role="status" className="text-[10px] text-emerald-700">
              {ui("บันทึกหมายเหตุแล้ว")}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs leading-5 text-red-600">
          {ui(error)}
        </p>
      )}
      {editing && latest && (
        <div className="space-y-2 rounded border border-hairline bg-surface p-2">
          <p className="text-[10px] text-muted">{ui("หมายเหตุล่าสุดในระบบ")}</p>
          <p className="whitespace-pre-wrap break-words leading-5">
            {latest.remark || "—"}
          </p>
          <button
            type="button"
            disabled={pending}
            className="underline"
            onClick={() => {
              setDraft(latest.remark);
              setBase(latest);
              setLatest(null);
              setError("");
            }}
          >
            {ui("ใช้ข้อความล่าสุดแทนข้อความที่กำลังแก้ไข")}
          </button>
        </div>
      )}
    </div>
  );
}
