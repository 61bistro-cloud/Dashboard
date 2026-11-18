"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  Landmark,
  Loader2,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useUi } from "@/lib/i18n/use-ui";
import {
  ACCOUNT_OPTIONS,
  supportsStatement,
  type AccountKind,
} from "@/lib/bank-account-options";
import {
  addBankAccount,
  deleteBankAccount,
  previewAccountDeletion,
} from "../account-actions";

type AccountRow = {
  id: number;
  code: string;
  name: string;
  accountType: string;
  active: boolean;
};
type Preview = Extract<
  Awaited<ReturnType<typeof previewAccountDeletion>>,
  { ok: true }
>;

export function AccountManager({
  accounts,
  businessId,
}: {
  accounts: AccountRow[];
  businessId: number;
}) {
  const { ui } = useUi();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<AccountKind | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<{
    account: AccountRow;
    preview: Preview;
  } | null>(null);
  const [password, setPassword] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    if (deletion) dialog.current?.showModal();
    else dialog.current?.close();
  }, [deletion]);
  const cancel = () => {
    if (pending) return;
    setDeletion(null);
    setPassword("");
    setError(null);
  };
  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-surface">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="h-4 w-4" />
            {ui("จัดการบัญชี & ช่องทาง (")}
            {accounts.length})
          </span>
          <span className="text-xs text-muted group-open:hidden">
            {ui("เปิด ▾")}
          </span>
          <span className="hidden text-xs text-muted group-open:inline">
            {ui("ปิด ▴")}
          </span>
        </summary>
        <div className="space-y-4 px-5 pb-5 pt-1">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!kind || pending) return;
              setError(null);
              setSuccess(null);
              start(async () => {
                try {
                  const result = await addBankAccount({ businessId, kind });
                  if (!result.ok) setError(result.message);
                  else setKind("");
                } catch {
                  setError("ดำเนินการไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่");
                }
              });
            }}
            className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-3"
          >
            <label className="min-w-0 flex-1 text-xs text-muted">
              {ui("บัญชี / ช่องทางที่รองรับ")}
              <select
                required
                disabled={pending}
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as AccountKind | "")
                }
                className="mt-1 w-full rounded-input border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
              >
                <option value="">{ui("— เลือกบัญชีหรือช่องทาง —")}</option>
                <optgroup label={ui("ธนาคารที่รองรับ Statement")}>
                  {ACCOUNT_OPTIONS.filter((o) => o.statement).map((o) => (
                    <option key={o.kind} value={o.kind}>
                      {ui(o.name)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={ui("เงินสด / แอปเดลิเวอรี (บันทึกเอง)")}>
                  {ACCOUNT_OPTIONS.filter((o) => !o.statement).map((o) => (
                    <option key={o.kind} value={o.kind}>
                      {ui(o.name)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <button
              type="submit"
              disabled={pending || !kind}
              className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-sm text-canvas disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {ui("เพิ่ม")}
            </button>
          </form>
          <p className="text-xs text-muted">
            {ui(
              "นำเข้า PDF ได้เฉพาะกสิกรไทย ไทยพาณิชย์ กรุงศรี และกรุงไทย • เงินสดและแอปเดลิเวอรีใช้บันทึกรายการเอง"
            )}
          </p>
          {error && !deletion && (
            <p
              role="alert"
              className="flex items-start gap-2 text-xs text-red-600"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {ui(error)}
            </p>
          )}
          {success && (
            <p role="status" className="text-xs text-emerald-600">
              {ui(success)}
            </p>
          )}
          <ul className="divide-y divide-hairline-soft rounded-card border border-hairline">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-3 px-3 py-3 hover:bg-surface"
              >
                <Landmark className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm">{account.name}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {!account.active
                      ? ui("บัญชีที่ซ่อน — ยังมีประวัติเดิม")
                      : supportsStatement(account)
                        ? ui("รองรับนำเข้า Statement")
                        : ui("บันทึกรายการเอง")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={ui("ลบ {v0}", { v0: account.name })}
                  onClick={() => {
                    setError(null);
                    setSuccess(null);
                    start(async () => {
                      try {
                        const result = await previewAccountDeletion({
                          businessId,
                          id: account.id,
                        });
                        if (!result.ok) setError(result.message);
                        else {
                          setPassword("");
                          setDeletion({ account, preview: result });
                        }
                      } catch {
                        setError(
                          "ดำเนินการไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่"
                        );
                      }
                    });
                  }}
                  className="rounded p-2 text-muted hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        onCancel={(event) => {
          event.preventDefault();
          cancel();
        }}
        className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-card border border-hairline bg-canvas p-5 text-ink backdrop:bg-black/50"
      >
        {deletion && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!password || pending || deletion.preview.closed) return;
              setError(null);
              start(async () => {
                try {
                  const result = await deleteBankAccount({
                    businessId,
                    id: deletion.account.id,
                    password,
                    token: deletion.preview.token,
                  });
                  setPassword("");
                  if (!result.ok) setError(result.message);
                  else {
                    setSuccess("ลบบัญชีและข้อมูลที่ผูกไว้แล้ว");
                    setDeletion(null);
                  }
                } catch {
                  setPassword("");
                  setError("ดำเนินการไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่");
                }
              });
            }}
            className="space-y-4"
          >
            <h2 id={headingId} className="text-base font-semibold">
              {ui("ยืนยันลบบัญชีและข้อมูลทุกเดือน")}
            </h2>
            <p className="break-words text-sm">{deletion.preview.name}</p>
            <p className="rounded-input border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {ui("ลบ {v0} รายการ และยอดยกมา {v1} รายการ จาก {v2} เดือน", {
                v0: deletion.preview.transactions,
                v1: deletion.preview.openings,
                v2: deletion.preview.months,
              })}
            </p>
            <p className="text-xs text-muted">
              {ui(
                "ลบบัญชี ธุรกรรม และยอดยกมาทุกเดือนอย่างถาวร ยอดในรายงานจะคำนวณใหม่ • ยกเลิกการจับคู่หลักฐาน แต่เก็บไฟล์ต้นฉบับใน Drive ไว้"
              )}
            </p>
            {deletion.preview.closed > 0 && (
              <p role="alert" className="text-sm text-red-600">
                {ui("บัญชีนี้มีรายการในเดือนที่ปิดงบ กรุณาเปิดงบก่อนลบบัญชี")}
              </p>
            )}
            <label className="block text-sm">
              {ui("รหัสลบของเจ้าของร้าน")}
              <input
                autoFocus
                required
                type="password"
                value={password}
                autoComplete="off"
                disabled={pending || deletion.preview.closed > 0}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 block w-full rounded-input border border-hairline bg-canvas px-3 py-2"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {ui(error)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="rounded-pill border border-hairline px-4 py-2 text-sm disabled:opacity-50"
              >
                {ui("ยกเลิก")}
              </button>
              <button
                type="submit"
                disabled={pending || !password || deletion.preview.closed > 0}
                className="rounded-pill bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {pending ? ui("กำลังลบ…") : ui("ยืนยันลบ")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
