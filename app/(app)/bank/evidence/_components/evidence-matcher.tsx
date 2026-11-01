"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readEvidence, confirmEvidenceMatch, unlinkEvidence } from "../actions";
import {
  suggestEvidenceMatches,
  type EvidenceFields,
  type MatchTransaction,
} from "@/lib/evidence-match";
import { fmtTHB } from "@/lib/fiscal";

export type EvidenceRow = {
  id: number;
  name: string;
  url: string;
  kind: string;
  refType: string | null;
  refId: string | null;
  ocr: EvidenceFields | null;
};
export function EvidenceMatcher({
  businessId,
  monthId,
  files,
  transactions,
  linkedTransactionIds,
}: {
  businessId: number;
  monthId: number;
  files: EvidenceRow[];
  transactions: MatchTransaction[];
  linkedTransactionIds: number[];
}) {
  const [reading, setReading] = useState<number | "all" | null>(null);
  const [results, setResults] = useState<Record<number, EvidenceFields>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState("all");
  const matched = (file: EvidenceRow) =>
    file.refType === "BANK_TX" && file.refId !== null;
  async function read(file: EvidenceRow) {
    try {
      const result = await readEvidence({
        businessId,
        monthId,
        fileId: file.id,
      });
      if (result.ok) {
        setResults((previous) => ({ ...previous, [file.id]: result.fields }));
        setErrors((previous) => ({ ...previous, [file.id]: "" }));
      } else
        setErrors((previous) => ({ ...previous, [file.id]: result.message }));
    } catch {
      setErrors((previous) => ({
        ...previous,
        [file.id]: "การเชื่อมต่อขัดข้อง กรอกยอดและวันที่เองได้",
      }));
    }
  }
  async function readOne(file: EvidenceRow) {
    if (reading !== null) return;
    setReading(file.id);
    try {
      await read(file);
    } finally {
      setReading(null);
    }
  }
  async function readAll() {
    if (reading !== null) return;
    setReading("all");
    setProgress(0);
    try {
      let done = 0;
      for (const file of files) {
        if (!matched(file) && !file.ocr && !results[file.id]) await read(file);
        setProgress(++done);
      }
    } finally {
      setReading(null);
    }
  }
  const missing = transactions.filter(
    (tx) => !linkedTransactionIds.includes(tx.id)
  );
  const visible = files.filter(
    (file) =>
      filter === "all" ||
      (filter === "matched" ? matched(file) : !matched(file))
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          disabled={reading !== null || files.length === 0}
          onClick={() => void readAll()}
          className="rounded-pill bg-ink text-canvas px-4 py-2 disabled:opacity-50"
        >
          {reading === "all"
            ? `กำลังอ่าน ${progress} / ${files.length}`
            : "อ่านข้อความไฟล์ที่ยังไม่จับคู่ในหน้านี้"}
        </button>
        <label>
          แสดง{" "}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded border border-hairline bg-canvas p-2"
          >
            <option value="all">ทั้งหมด</option>
            <option value="unmatched">ยังไม่จับคู่</option>
            <option value="matched">ยืนยันคู่แล้ว</option>
          </select>
        </label>
        <span className="text-muted">
          เปิดหน้านี้ไว้ขณะอ่านรูป • อ่าน JPG / PNG / PDF ผ่าน Google Drive •
          ไม่มีการยืนยันคู่อัตโนมัติ
        </span>
      </div>
      {visible.length === 0 && (
        <p className="rounded-card border border-hairline p-8 text-center text-sm text-muted">
          ไม่มีหลักฐานในรายการนี้ หากยังไม่พบไฟล์ให้ตรวจเดือนและธุรกิจที่เลือก
        </p>
      )}
      {visible.map((file) => (
        <EvidenceCard
          key={file.id}
          businessId={businessId}
          monthId={monthId}
          file={{ ...file, ocr: results[file.id] ?? file.ocr }}
          transactions={transactions}
          disabled={reading !== null}
          reading={reading === file.id || reading === "all"}
          onRead={() => void readOne(file)}
          error={errors[file.id]}
        />
      ))}
      <details className="rounded-card border border-hairline p-4">
        <summary className="cursor-pointer text-sm">
          รายการ Statement ที่ยังไม่มีหลักฐานแนบ ({missing.length})
        </summary>
        <p className="mt-2 text-xs text-muted">
          เป็นรายการในบัญชีที่เลือก ไม่ใช่ข้อสรุปว่าทุกรายการต้องมีสลิป
        </p>
        <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-hairline text-xs">
          {missing.map((tx) => (
            <li key={tx.id} className="py-2">
              {tx.date.slice(0, 10)} {tx.date.slice(11, 16)} • {tx.accountName}{" "}
              • {tx.description} • {tx.withdraw > 0 ? "เงินออก" : "เงินเข้า"}{" "}
              {fmtTHB(tx.withdraw || tx.deposit)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
function EvidenceCard({
  businessId,
  monthId,
  file,
  transactions,
  disabled,
  reading,
  onRead,
  error,
}: {
  businessId: number;
  monthId: number;
  file: EvidenceRow;
  transactions: MatchTransaction[];
  disabled: boolean;
  reading: boolean;
  onRead: () => void;
  error?: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(file.ocr?.amount?.toString() ?? "");
  const [date, setDate] = useState(file.ocr?.date ?? "");
  const [time, setTime] = useState(file.ocr?.time ?? "");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (file.ocr) {
      setAmount(file.ocr.amount?.toString() ?? "");
      setDate(file.ocr.date ?? "");
      setTime(file.ocr.time ?? "");
    }
  }, [file.ocr]);
  const fields = {
    amount: amount ? Number(amount) : null,
    date: date || null,
    time: time || null,
  };
  const candidates = suggestEvidenceMatches(fields, transactions);
  const linkedId = file.refType === "BANK_TX" ? Number(file.refId) : null;
  const linked = transactions.find((tx) => tx.id === linkedId);
  const locked = disabled || pending;
  function mutate(unlink = false) {
    if (!unlink && !selected) return;
    setMessage(null);
    start(async () => {
      try {
        const input = {
          businessId,
          monthId,
          fileId: file.id,
          transactionId: unlink ? linkedId! : Number(selected),
        };
        const result = await (unlink
          ? unlinkEvidence(input)
          : confirmEvidenceMatch(input));
        if (result.ok) {
          setSelected("");
          router.refresh();
        } else setMessage(result.message);
      } catch {
        setMessage("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }
  const txLabel = (tx: MatchTransaction) =>
    `${tx.date.slice(0, 10)} ${tx.date.slice(11, 16)} • ${tx.accountName} • ${tx.withdraw > 0 ? "ออก" : "เข้า"} ${fmtTHB(tx.withdraw || tx.deposit)} • ${tx.description}`;
  const chosen = transactions.find((tx) => tx.id === Number(selected));
  const mismatch =
    chosen &&
    ((fields.date && chosen.date.slice(0, 10) !== fields.date) ||
      (fields.amount != null &&
        Math.round(fields.amount * 100) !== Math.round(chosen.withdraw * 100) &&
        Math.round(fields.amount * 100) !== Math.round(chosen.deposit * 100)));
  const choices = transactions.filter(
    (tx) => !query || txLabel(tx).toLowerCase().includes(query.toLowerCase())
  );
  return (
    <section className="rounded-card border border-hairline bg-canvas p-4 space-y-3 text-xs">
      <div className="flex flex-wrap gap-3 justify-between">
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="underline font-medium break-all"
        >
          {file.name} ↗ ดูรูปหลักฐาน
        </a>
        <span className={linkedId ? "text-emerald-700" : "text-amber-700"}>
          {linkedId ? "ยืนยันคู่แล้ว" : "รอตรวจ / ยังไม่จับคู่"} •{" "}
          {file.kind === "SLIP" ? "สลิป" : "ใบเสร็จ"}
        </span>
      </div>
      {linkedId ? (
        <div className="space-y-2">
          <p>
            {linked
              ? txLabel(linked)
              : "รายการคู่เดิมอยู่นอกบัญชีที่เลือกหรือถูกลบแล้ว เลือกทุกบัญชีเพื่อตรวจสอบ"}
          </p>
          <button
            type="button"
            onClick={() => mutate(true)}
            disabled={locked}
            className="underline disabled:opacity-50"
          >
            ยกเลิกคู่
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <button
              type="button"
              onClick={onRead}
              disabled={locked}
              className="rounded-pill border border-hairline px-3 py-2 disabled:opacity-50"
            >
              {reading
                ? "กำลังอ่าน..."
                : file.ocr
                  ? "ใช้ข้อมูลที่อ่านไว้"
                  : "อ่านข้อความจากรูป"}
            </button>
            <label>
              ยอดเงิน
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                disabled={locked}
                onChange={(event) => setAmount(event.target.value)}
                className="block mt-1 w-32 rounded border border-hairline bg-canvas p-2"
              />
            </label>
            <label>
              วันที่ในหลักฐาน
              <input
                type="date"
                value={date}
                disabled={locked}
                onChange={(event) => setDate(event.target.value)}
                className="block mt-1 rounded border border-hairline bg-canvas p-2"
              />
            </label>
            <label>
              เวลา (ถ้ามี)
              <input
                type="time"
                value={time}
                disabled={locked}
                onChange={(event) => setTime(event.target.value)}
                className="block mt-1 rounded border border-hairline bg-canvas p-2"
              />
            </label>
          </div>
          {error && (
            <p role="status" className="text-amber-700">
              {error}
            </p>
          )}
          {!amount || !date ? (
            <p className="text-muted">
              กรอกหรืออ่านยอดเงินและวันที่ เพื่อแนะนำคู่ใน Statement
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-amber-700">
              ยังไม่พบคู่ที่ยอดและวันที่ตรงกัน ตรวจข้อมูล บัญชี และเดือน
              หรือเลือกจากรายการทั้งหมดด้านล่าง
            </p>
          ) : (
            <div className="rounded-input bg-surface p-3 space-y-2">
              <p className="font-medium">
                พบ {candidates.length} รายการที่ยอดและวันที่ตรงกัน
                {candidates.length > 1
                  ? " — มีหลายคู่ ต้องตรวจรูปและเลือกเอง"
                  : " — กรุณาตรวจบัญชีและผู้รับก่อนยืนยัน"}
              </p>
              {candidates.slice(0, 5).map((candidate) => {
                const tx = transactions.find(
                  (tx) => tx.id === candidate.transactionId
                )!;
                return (
                  <label key={tx.id} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`candidate-${file.id}`}
                      checked={selected === String(tx.id)}
                      disabled={locked}
                      onChange={() => setSelected(String(tx.id))}
                    />
                    <span>
                      {txLabel(tx)}
                      <span className="block text-muted">
                        {candidate.reasons.join(" • ")}
                      </span>
                    </span>
                  </label>
                );
              })}
              {candidates.length > 5 && (
                <p>แสดง 5 คู่แรก เลือกรายการอื่นจากช่องด้านล่างได้</p>
              )}
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-muted">
              ค้นหาและเลือกคู่เองจาก Statement เดือนนี้
            </summary>
            <input
              type="search"
              placeholder="ค้นหายอดเงิน / ผู้รับ / วันที่"
              value={query}
              disabled={locked}
              onChange={(event) => setQuery(event.target.value)}
              className="block mt-2 w-full rounded border border-hairline bg-canvas p-2"
            />
            <select
              aria-label={`เลือกรายการธนาคารสำหรับ ${file.name}`}
              value={selected}
              disabled={locked}
              onChange={(event) => setSelected(event.target.value)}
              className="mt-2 w-full rounded border border-hairline bg-canvas p-2"
            >
              <option value="">— เลือกรายการ —</option>
              {choices.map((tx) => (
                <option key={tx.id} value={tx.id}>
                  {txLabel(tx)}
                </option>
              ))}
            </select>
          </details>
          {selected && (
            <p className="font-medium">
              คู่ที่จะยืนยัน:{" "}
              {transactions.find((tx) => tx.id === Number(selected))
                ? txLabel(
                    transactions.find((tx) => tx.id === Number(selected))!
                  )
                : "กรุณาเลือกใหม่"}
            </p>
          )}
          {mismatch && (
            <p className="text-amber-700">
              ยอดเงินหรือวันที่ของคู่ที่เลือกต่างจากข้อมูลหลักฐาน
              กรุณาตรวจรูปก่อนยืนยัน
            </p>
          )}
          <button
            type="button"
            disabled={locked || !selected}
            onClick={() => mutate()}
            className="rounded-pill bg-ink text-canvas px-4 py-2 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก..." : "ตรวจรูปแล้ว — ยืนยันคู่"}
          </button>
        </>
      )}
      {message && (
        <p role="alert" className="text-red-600">
          {message}
        </p>
      )}
    </section>
  );
}
