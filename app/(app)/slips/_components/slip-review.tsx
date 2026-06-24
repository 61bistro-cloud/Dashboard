"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  Check,
  X,
  Trash2,
  RefreshCw,
  Link2,
  AlertTriangle,
  CircleHelp,
} from "lucide-react";
import {
  saveAndRematch,
  confirmSlip,
  rejectSlip,
  deleteSlip,
  reExtractSlip,
} from "../actions";

export type SlipDTO = {
  id: number;
  status: string;
  extractStatus: string;
  extractError: string | null;
  amount: number | null;
  date: string; // YYYY-MM-DD or ""
  time: string; // HH:MM or ""
  senderName: string | null;
  bankName: string | null;
  ref: string | null;
  confidence: number | null;
  accountId: number | null;
  matchedTxId: number | null;
  note: string | null;
  imageUrl: string;
};

type Candidate = { id: number; label: string; alreadyLinked: boolean };
type Account = { id: number; name: string };
type Category = { id: number; name: string; kind: string };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  REVIEW: { label: "จับคู่แล้ว · รอตรวจ", cls: "bg-sky-100 text-sky-800" },
  UNMATCHED: {
    label: "ยังไม่พบใน statement",
    cls: "bg-amber-100 text-amber-800",
  },
  FAILED: { label: "อ่านยอดไม่ได้", cls: "bg-red-100 text-red-800" },
  PENDING: { label: "กำลังประมวลผล", cls: "bg-neutral-100 text-neutral-700" },
};

export function SlipReview({
  slip,
  candidates,
  accounts,
  categories,
  aiOn,
}: {
  slip: SlipDTO;
  candidates: Candidate[];
  accounts: Account[];
  categories: Category[];
  aiOn: boolean;
}) {
  const [amount, setAmount] = useState(
    slip.amount != null ? String(slip.amount) : ""
  );
  const [date, setDate] = useState(slip.date);
  const [time, setTime] = useState(slip.time);
  const [accountId, setAccountId] = useState(
    slip.accountId != null ? String(slip.accountId) : ""
  );
  const [txId, setTxId] = useState(
    slip.matchedTxId != null ? String(slip.matchedTxId) : ""
  );
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState(slip.note ?? "");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const badge = STATUS_BADGE[slip.status] ?? STATUS_BADGE.PENDING;
  const ambiguous = candidates.filter((c) => !c.alreadyLinked).length > 1;

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    setOk(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr((e as Error).message ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <div className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Slip image */}
        <a
          href={slip.imageUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 bg-surface sm:w-44 flex items-center justify-center p-2 border-b sm:border-b-0 sm:border-r border-hairline-soft"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slip.imageUrl}
            alt="slip"
            className="max-h-44 w-auto rounded object-contain"
          />
        </a>

        {/* Details + actions */}
        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className={`inline-block rounded-pill px-2 py-0.5 text-xs font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted">
              {slip.bankName && <span>{slip.bankName}</span>}
              {slip.confidence != null && (
                <span>· ความมั่นใจ {(slip.confidence * 100).toFixed(0)}%</span>
              )}
              {aiOn && (
                <button
                  type="button"
                  onClick={() => run(() => reExtractSlip({ slipId: slip.id }))}
                  disabled={pending}
                  className="inline-flex items-center gap-1 text-ink/70 hover:text-ink underline disabled:opacity-50"
                >
                  <RefreshCw className="h-3 w-3" /> อ่านใหม่
                </button>
              )}
            </div>
          </div>

          {slip.extractError && (
            <p className="text-xs text-amber-700">{slip.extractError}</p>
          )}
          {slip.senderName && (
            <p className="text-xs text-muted">
              ผู้โอน: {slip.senderName}
              {slip.ref ? ` · อ้างอิง ${slip.ref}` : ""}
            </p>
          )}

          {/* Editable extracted fields */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-xs">
              <span className="block text-muted mb-0.5">ยอด (บาท)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1 tabular-nums"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted mb-0.5">วันที่</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted mb-0.5">เวลา</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted mb-0.5">บัญชี</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1"
              >
                <option value="">ทุกบัญชี</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() =>
              run(() =>
                saveAndRematch({
                  slipId: slip.id,
                  amount: amount || null,
                  date: date || null,
                  time: time || null,
                  accountId: accountId || null,
                  note: note || null,
                })
              )
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> บันทึก & จับคู่ใหม่
          </button>

          {/* Match + category */}
          <div className="rounded-input border border-hairline-soft bg-surface/60 p-3 space-y-2">
            {ambiguous && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> พบหลายรายการที่ยอดตรง
                — เลือกบรรทัดที่ถูกต้อง
              </p>
            )}
            {candidates.length === 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <CircleHelp className="h-3.5 w-3.5" /> ยังไม่พบรายการใน
                statement ที่ยอดตรง — นำเข้า statement ในหน้า Bank แล้วกด
                &ldquo;จับคู่ใหม่&rdquo;
              </p>
            )}
            <label className="block text-xs">
              <span className="flex items-center gap-1 text-muted mb-0.5">
                <Link2 className="h-3 w-3" /> บรรทัดใน statement
              </span>
              <select
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1 text-xs"
              >
                <option value="">— ยังไม่เลือก —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.alreadyLinked}>
                    {c.label}
                    {c.alreadyLinked ? " • ผูกแล้ว" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="block text-muted mb-0.5">
                หมวดบัญชี (ลงให้บรรทัดนี้)
              </span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded border border-hairline-soft bg-canvas px-2 py-1 text-xs"
              >
                <option value="">— ไม่ระบุ —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Approval row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสเจ้าของ"
              autoComplete="off"
              className="w-32 rounded-pill border border-hairline bg-canvas px-3 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (!txId) {
                  setErr("เลือกบรรทัด statement ที่ตรงกันก่อนยืนยัน");
                  return;
                }
                run(() =>
                  confirmSlip({
                    slipId: slip.id,
                    password,
                    matchedTxId: txId || null,
                    categoryId: categoryId || null,
                    amount: amount || null,
                    date: date || null,
                    time: time || null,
                    note: note || null,
                  })
                );
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-pill bg-emerald-600 px-4 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              ยืนยัน
            </button>
            <button
              type="button"
              onClick={() =>
                run(() =>
                  rejectSlip({ slipId: slip.id, password, note: note || null })
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> ปฏิเสธ
            </button>
            <button
              type="button"
              onClick={() =>
                run(() => deleteSlip({ slipId: slip.id, password }))
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> ลบ
            </button>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
          {ok && <p className="text-xs text-emerald-700">{ok}</p>}
        </div>
      </div>
    </div>
  );
}
