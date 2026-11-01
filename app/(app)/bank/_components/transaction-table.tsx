"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { bulkDeleteTransactions } from "../actions";
import { fmtTHB } from "@/lib/fiscal";
import type { BankMonthData } from "@/lib/bank-calc";
import { TxCategorySelect } from "./tx-category-select";
import { DeleteButton } from "./delete-button";

type Props = {
  fiscalMonthId: number;
  accountId: number;
  accountName: string;
  monthLabel: string;
  accountType: string;
  rows: Array<
    Omit<BankMonthData["rows"][number], "date"> & {
      date: string;
      evidence?: Array<{ id: number; name: string; webViewLink: string }>;
    }
  >;
  categories: Array<{ id: number; name: string; kind: string }>;
};

export function TransactionTable({
  fiscalMonthId,
  accountId,
  accountName,
  monthLabel,
  accountType,
  rows,
  categories,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [resetOpening, setResetOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selectedIds = rows
    .filter((row) => selected.has(row.id))
    .map((row) => row.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  }
  function cancelConfirmation() {
    setConfirming(false);
    setPassword("");
    setResetOpening(false);
    setError(null);
  }
  function removeSelected(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    start(async () => {
      try {
        const result = await bulkDeleteTransactions({
          fiscalMonthId,
          accountId,
          ids: selectedIds,
          password,
          resetOpening: allSelected && resetOpening,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSelected(new Set());
        setEditing(false);
        cancelConfirmation();
        setMessage(
          `ลบ ${result.deleted} รายการแล้ว${result.resetOpening ? " และล้างยอดยกมาแล้ว" : ""}`
        );
      } catch {
        setError("ลบไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    });
  }

  return (
    <div>
      {message && (
        <p role="status" className="px-5 py-3 text-xs text-emerald-700">
          {message}
        </p>
      )}
      {rows.length > 0 && (
        <div className="px-5 py-3 border-b border-hairline-soft flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setEditing(!editing);
              setSelected(new Set());
              cancelConfirmation();
              setMessage(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1.5 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? "เสร็จสิ้น" : "แก้ไข / เลือกรายการ"}
          </button>
          {editing && (
            <>
              <button
                type="button"
                disabled={pending || confirming}
                onClick={toggleAll}
                className="underline disabled:opacity-50"
              >
                {allSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
              </button>
              <span className="text-muted">
                เลือก {selectedIds.length} / {rows.length} รายการ
              </span>
              <button
                type="button"
                disabled={pending || selectedIds.length === 0 || confirming}
                onClick={() => {
                  setConfirming(true);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-pill bg-red-600 text-white px-3 py-1.5 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                ลบที่เลือก ({selectedIds.length})
              </button>
              <span className="text-muted">
                เฉพาะ {accountName} — {monthLabel}
              </span>
            </>
          )}
        </div>
      )}
      {confirming && (
        <form
          onSubmit={removeSelected}
          className="m-4 rounded-card border border-red-200 bg-surface p-4 space-y-3 text-xs"
          aria-label="ยืนยันลบรายการที่เลือก"
        >
          <p className="font-medium">
            ยืนยันลบ {selectedIds.length} รายการจาก {accountName} — {monthLabel}
            ?
          </p>
          <p className="text-muted">
            เมื่อลบแล้วจะกู้คืนไม่ได้ หากลงผิดเดือน สามารถนำเข้า Statement
            อีกครั้งในเดือนที่ถูกต้องได้
          </p>
          {allSelected && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={resetOpening}
                onChange={(e) => setResetOpening(e.target.checked)}
                disabled={pending}
                className="accent-ink"
              />
              ล้างยอดยกมาของบัญชีในเดือนนี้ด้วย (กรณีนำเข้าผิดเดือน)
            </label>
          )}
          <label className="block">
            รหัสอนุมัติเจ้าของร้าน
            <input
              type="password"
              autoComplete="off"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              className="block mt-1 rounded border border-hairline bg-canvas px-3 py-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending || selectedIds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-pill bg-red-600 text-white px-4 py-2 disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              ยืนยันลบ {selectedIds.length} รายการ
            </button>
            <button
              type="button"
              onClick={cancelConfirmation}
              disabled={pending}
              className="rounded-pill border border-hairline px-4 py-2 disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
          ยังไม่มีรายการในเดือนนี้ — เพิ่มรายการด้านบน
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left">
              <tr>
                {editing && (
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="เลือกทุกรายการในบัญชีและเดือนนี้"
                      checked={allSelected}
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            selectedIds.length > 0 && !allSelected;
                      }}
                      disabled={pending || confirming}
                      onChange={toggleAll}
                      className="accent-ink"
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">รายการ</th>
                <th className="px-3 py-2 font-medium text-right">
                  {accountType === "CREDIT_CARD" ? "ชำระคืน" : "ฝาก"}
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  {accountType === "CREDIT_CARD" ? "ใช้จ่าย" : "ถอน"}
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  {accountType === "CREDIT_CARD" ? "ค้างชำระสะสม" : "คงเหลือ"}
                </th>
                <th className="px-3 py-2 font-medium">ช่องทาง</th>
                <th className="px-3 py-2 font-medium">หมวด</th>
                <th className="px-3 py-2 font-medium">หลักฐาน</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    selected.has(r.id) ? "bg-surface" : "hover:bg-surface"
                  }
                >
                  {editing && (
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`เลือกรายการ ${r.description}`}
                        checked={selected.has(r.id)}
                        disabled={pending || confirming}
                        onChange={() => toggle(r.id)}
                        className="accent-ink"
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {r.date.slice(0, 10)}
                    {r.date.slice(11, 16) !== "00:00" && (
                      <span className="ml-1.5 text-muted-soft">
                        {r.date.slice(11, 16)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.description}
                    {r.note && (
                      <details className="mt-1 text-muted">
                        <summary className="cursor-pointer text-[10px]">
                          Remark / บันทึก
                        </summary>
                        <p className="whitespace-pre-line mt-1">{r.note}</p>
                      </details>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                    {r.deposit > 0 ? fmtTHB(r.deposit) : ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                    {r.withdraw > 0 ? fmtTHB(r.withdraw) : ""}
                  </td>
                  <td
                    className={
                      "px-3 py-1.5 text-right tabular-nums " +
                      (r.runningBalance < 0 ? "text-red-700" : "")
                    }
                  >
                    {fmtTHB(r.runningBalance)}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{r.channel ?? "-"}</td>
                  <td className="px-3 py-1.5">
                    <TxCategorySelect
                      txId={r.id}
                      categoryId={r.categoryId}
                      categories={categories}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {r.evidence?.length ? (
                      r.evidence.map((file, index) => (
                        <a
                          key={file.id}
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          title={file.name}
                          className="block underline whitespace-nowrap"
                        >
                          หลักฐาน {index + 1} ↗
                        </a>
                      ))
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {!editing && <DeleteButton id={r.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
