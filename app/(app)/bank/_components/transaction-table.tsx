"use client";
import { transactionRemark } from "@/lib/transaction-remark";
import { TransactionRemark } from "./transaction-remark";
import { displayMonth } from "@/lib/i18n/core";

import { useUi } from "@/lib/i18n/use-ui";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { bulkDeleteTransactions } from "../actions";
import { fmtTHB } from "@/lib/fiscal";
import type { BankMonthData } from "@/lib/bank-calc";
import { TxCategorySelect } from "./tx-category-select";
import { DeleteButton } from "./delete-button";

type Props = {
  businessId: number;
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
  businessId,
  fiscalMonthId,
  accountId,
  accountName,
  monthLabel,
  accountType,
  rows,
  categories,
}: Props) {
  const { ui, uiLocale } = useUi();
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
          ui("ลบ {v0} รายการแล้ว{v1}", {
            v0: result.deleted,
            v1: result.resetOpening ? " และล้างยอดยกมาแล้ว" : "",
          })
        );
      } catch {
        setError(ui("ลบไม่สำเร็จ กรุณาลองอีกครั้ง"));
      }
    });
  }

  return (
    <div>
      {message && (
        <p role="status" className="px-5 py-3 text-xs text-emerald-700">
          {ui(message)}
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
            {editing ? ui("เสร็จสิ้น") : ui("แก้ไข / เลือกรายการ")}
          </button>
          {editing && (
            <>
              <button
                type="button"
                disabled={pending || confirming}
                onClick={toggleAll}
                className="underline disabled:opacity-50"
              >
                {allSelected ? ui("ยกเลิกเลือกทั้งหมด") : ui("เลือกทั้งหมด")}
              </button>
              <span className="text-muted">
                {ui("เลือก")} {selectedIds.length} / {rows.length}{" "}
                {ui("รายการ")}
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
                <Trash2 className="h-3.5 w-3.5" /> {ui("ลบที่เลือก (")}
                {selectedIds.length})
              </button>
              <span className="text-muted">
                {ui("เฉพาะ")} {accountName} —{" "}
                {displayMonth(monthLabel, uiLocale)}
              </span>
            </>
          )}
        </div>
      )}
      {confirming && (
        <form
          onSubmit={removeSelected}
          className="m-4 rounded-card border border-red-200 bg-surface p-4 space-y-3 text-xs"
          aria-label={ui("ยืนยันลบรายการที่เลือก")}
        >
          <p className="font-medium">
            {ui("ยืนยันลบ")} {selectedIds.length} {ui("รายการจาก")}{" "}
            {accountName} — {displayMonth(monthLabel, uiLocale)}?
          </p>
          <p className="text-muted">
            {ui(
              "เมื่อลบแล้วจะกู้คืนไม่ได้ หากลงผิดเดือน สามารถนำเข้า Statement อีกครั้งในเดือนที่ถูกต้องได้"
            )}
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
              {ui("ล้างยอดยกมาของบัญชีในเดือนนี้ด้วย (กรณีนำเข้าผิดเดือน)")}
            </label>
          )}
          <label className="block">
            {ui("รหัสอนุมัติเจ้าของร้าน")}
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
              {ui(error)}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending || selectedIds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-pill bg-red-600 text-white px-4 py-2 disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{" "}
              {ui("ยืนยันลบ")} {selectedIds.length} {ui("รายการ")}
            </button>
            <button
              type="button"
              onClick={cancelConfirmation}
              disabled={pending}
              className="rounded-pill border border-hairline px-4 py-2 disabled:opacity-50"
            >
              {ui("ยกเลิก")}
            </button>
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
          {ui("ยังไม่มีรายการในเดือนนี้ — เพิ่มรายการด้านบน")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-xs">
            <thead className="bg-surface text-left">
              <tr>
                {editing && (
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={ui("เลือกทุกรายการในบัญชีและเดือนนี้")}
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
                <th className="px-3 py-2 font-medium">{ui("วันที่")}</th>
                <th className="px-3 py-2 font-medium">{ui("รายการ")}</th>
                <th className="px-3 py-2 font-medium text-right">
                  {accountType === "CREDIT_CARD" ? ui("ชำระคืน") : ui("ฝาก")}
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  {accountType === "CREDIT_CARD" ? ui("ใช้จ่าย") : ui("ถอน")}
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  {accountType === "CREDIT_CARD"
                    ? ui("ค้างชำระสะสม")
                    : ui("คงเหลือ")}
                </th>
                <th className="px-3 py-2 font-medium">{ui("ช่องทาง")}</th>
                <th className="px-3 py-2 font-medium">{ui("หมวด")}</th>
                <th className="px-3 py-2 font-medium">
                  {ui("Remark / หมายเหตุ")}
                </th>
                <th className="px-3 py-2 font-medium">{ui("หลักฐาน")}</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map((r) => (
                <tr
                  id={`transaction-${r.id}`}
                  key={r.id}
                  className={
                    selected.has(r.id) ? "bg-surface" : "hover:bg-surface"
                  }
                >
                  {editing && (
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={ui("เลือกรายการ {v0}", {
                          v0: r.description,
                        })}
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
                  <td className="px-3 py-1.5">{r.description}</td>
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
                  <td className="px-3 py-1.5 align-top">
                    <TransactionRemark
                      businessId={businessId}
                      accountId={accountId}
                      fiscalMonthId={fiscalMonthId}
                      transactionId={r.id}
                      description={r.description}
                      remark={r.remark ?? transactionRemark(r.note)}
                      version={r.remarkVersion}
                      disabled={pending || confirming}
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
                          {ui("หลักฐาน")} {index + 1} ↗
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
