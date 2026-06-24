"use client";

import { useState, useTransition } from "react";
import { FileUp, Loader2, Check, AlertCircle } from "lucide-react";
import { parseStatementPdf, importStatementRows } from "../actions";
import type { PreviewTx } from "../actions";
import { fmtTHB } from "@/lib/fiscal";

type Cat = { id: number; name: string; kind: string };

type EditableRow = PreviewTx & {
  selected: boolean;
  categoryId: number | null;
};

export function StatementUpload({
  fiscalMonthId,
  accountId,
  accountName,
  categories,
}: {
  fiscalMonthId: number;
  accountId: number;
  accountName: string;
  categories: Cat[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [imported, setImported] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [openingBalance, setOpeningBalance] = useState<number | null>(null);
  const [setOpening, setSetOpening] = useState(true);
  const [hideDuplicates, setHideDuplicates] = useState(true);

  function onParse(formData: FormData) {
    setError(null);
    setNeedPassword(false);
    setWrongPassword(false);
    setImported(null);
    setSkipped(0);
    setHideDuplicates(true);
    startTransition(async () => {
      try {
        const result = await parseStatementPdf(formData);
        if (!result.ok) {
          setError(result.message ?? "อ่าน PDF ไม่ได้");
          if (result.needPassword) setNeedPassword(true);
          if (result.wrongPassword) setWrongPassword(true);
          setRows([]);
          return;
        }
        setRows(
          result.preview.map((r) => ({
            ...r,
            selected: (r.deposit > 0 || r.withdraw > 0) && !r.duplicate,
            categoryId: r.suggestedCategoryId,
          }))
        );
        setOpeningBalance(result.openingBalance ?? null);
        setSetOpening(result.openingBalance != null);
        if (result.preview.length === 0) {
          setError("ไม่พบรายการใน PDF นี้ — รูปแบบไฟล์อาจไม่รองรับ");
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function onImport() {
    setError(null);
    setImported(null);
    setSkipped(0);
    const selectedRows = rows.filter((r) => r.selected);
    if (selectedRows.length === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 รายการ");
      return;
    }
    startTransition(async () => {
      try {
        const result = await importStatementRows({
          fiscalMonthId,
          accountId,
          setOpening: setOpening && openingBalance != null,
          openingBalance,
          rows: selectedRows.map((r) => ({
            date: r.date,
            time: r.time,
            description: r.description.slice(0, 1000) || "(ไม่มีรายละเอียด)",
            deposit: r.deposit,
            withdraw: r.withdraw,
            balance: r.balance,
            channel: (r.channel ?? "").slice(0, 500),
            note: "",
            categoryId: r.categoryId,
          })),
        });
        if (result.ok) {
          setImported(result.inserted);
          setSkipped(result.skipped ?? 0);
          setRows([]);
        } else {
          setError(result.message ?? "บันทึกไม่สำเร็จ");
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) =>
      prev.map((r) => (r.idx === idx ? { ...r, ...patch } : r))
    );
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const dupCount = rows.filter((r) => r.duplicate).length;
  const visibleRows = hideDuplicates ? rows.filter((r) => !r.duplicate) : rows;

  return (
    <div className="border-t border-hairline-soft">
      <details className="group">
        <summary className="cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-surface">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileUp className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
            นำเข้า PDF Statement (KBANK / SCB) — {accountName}
          </div>
          <span className="text-xs text-muted group-open:hidden">เปิด ▾</span>
          <span className="text-xs text-muted hidden group-open:inline">
            ปิด ▴
          </span>
        </summary>

        <div className="px-5 pb-5 pt-2 space-y-4">
          {/* Step 1: Upload */}
          <form
            action={onParse}
            className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-3"
          >
            <input type="hidden" name="accountId" value={accountId} />
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs text-muted mb-1">
                ไฟล์ Statement (PDF)
              </label>
              <input
                type="file"
                name="file"
                accept="application/pdf,.pdf"
                required
                className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-pill file:border-0 file:bg-ink file:text-canvas file:cursor-pointer"
              />
            </div>
            <div className="w-48">
              <label className="block text-xs text-muted mb-1">
                รหัสผ่าน PDF
              </label>
              <input
                type="password"
                name="password"
                placeholder="ddmmyyyy"
                autoComplete="off"
                className="block w-full rounded-pill border border-hairline bg-canvas px-3 py-1.5 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileUp className="h-3.5 w-3.5" />
              )}
              อ่าน PDF
            </button>
          </form>

          {error && (
            <div className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                {error}
                {needPassword && (
                  <div className="mt-1 text-red-700/80">
                    ลองใส่วันเกิด 8 หลัก (วันเดือนปีค.ศ.) เช่น 20051994
                  </div>
                )}
                {wrongPassword && (
                  <div className="mt-1 text-red-700/80">
                    รหัสผ่านผิด — โปรดตรวจสอบและลองอีกครั้ง
                  </div>
                )}
              </div>
            </div>
          )}

          {imported != null && (
            <div className="flex items-center gap-2 rounded-card border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <Check className="h-4 w-4 shrink-0" />
              <span>
                บันทึก {imported} รายการเรียบร้อย
                {skipped > 0 && (
                  <span className="text-emerald-700/80">
                    {" "}
                    — ข้ามรายการซ้ำ {skipped} รายการ (กันยอดเบิ้ล)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Step 2: Preview table */}
          {rows.length > 0 && (
            <div className="space-y-2">
              {/* Opening balance from the statement */}
              {openingBalance != null && (
                <label className="flex items-start gap-2 rounded-card border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setOpening}
                    onChange={(e) => setSetOpening(e.target.checked)}
                    className="mt-0.5 accent-sky-600"
                  />
                  <span>
                    ตั้ง <strong>ยอดยกมา</strong> ของเดือนนี้ ={" "}
                    <strong className="tabular-nums">
                      {fmtTHB(openingBalance)}
                    </strong>{" "}
                    (จากบรรทัด &ldquo;ยอดยกมา&rdquo; ใน statement) —
                    แนะนำให้ติ๊ก เพื่อให้ยอดคงเหลือตรงกับ statement
                  </span>
                </label>
              )}
              {dupCount > 0 && (
                <div className="flex items-start justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <span>
                    ตัดรายการซ้ำออก <strong>{dupCount}</strong> รายการ
                    (เคยนำเข้าแล้ว หรือซ้ำกันในไฟล์) — ระบบไม่ติ๊กเลือกให้นำเข้า
                  </span>
                  <button
                    type="button"
                    onClick={() => setHideDuplicates((v) => !v)}
                    className="shrink-0 underline hover:text-amber-950"
                  >
                    {hideDuplicates ? "แสดงรายการซ้ำ" : "ซ่อนรายการซ้ำ"}
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted">
                  พบ {rows.length} รายการ
                  {dupCount > 0 && ` (ซ้ำ ${dupCount})`} — เลือก {selectedCount}{" "}
                  รายการ ✓ ตรวจสอบและแก้หมวดก่อนยืนยัน
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) =>
                        prev.map((r) => ({ ...r, selected: !r.duplicate }))
                      )
                    }
                    className="text-xs text-ink/75 underline hover:text-ink"
                  >
                    เลือกทั้งหมด
                  </button>
                  <span className="text-muted-soft">·</span>
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) =>
                        prev.map((r) => ({ ...r, selected: false }))
                      )
                    }
                    className="text-xs text-ink/75 underline hover:text-ink"
                  >
                    ล้างการเลือก
                  </button>
                  <span className="text-muted-soft">·</span>
                  <button
                    type="button"
                    onClick={() => setRows([])}
                    className="text-xs text-red-600 underline hover:text-red-700"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>

              {visibleRows.length > 0 ? (
                <div className="overflow-x-auto rounded-card border border-hairline">
                  <table className="w-full text-xs">
                    <thead className="bg-surface text-left">
                      <tr>
                        <th className="px-2 py-2 font-medium w-10">เลือก</th>
                        <th className="px-2 py-2 font-medium">วันที่</th>
                        <th className="px-2 py-2 font-medium">รายการ</th>
                        <th className="px-2 py-2 font-medium text-right">
                          ฝาก
                        </th>
                        <th className="px-2 py-2 font-medium text-right">
                          ถอน
                        </th>
                        <th className="px-2 py-2 font-medium">ช่องทาง</th>
                        <th className="px-2 py-2 font-medium">หมวด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline-soft">
                      {visibleRows.map((r) => (
                        <tr
                          key={r.idx}
                          className={
                            r.duplicate
                              ? "bg-amber-50/50 text-muted-soft"
                              : r.selected
                                ? ""
                                : "bg-surface/50 text-muted-soft opacity-60"
                          }
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={r.selected}
                              onChange={(e) =>
                                updateRow(r.idx, { selected: e.target.checked })
                              }
                              className="accent-ink"
                            />
                            {r.duplicate && (
                              <div className="mt-0.5 text-[10px] font-medium text-amber-700">
                                ซ้ำ
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="date"
                              value={r.date}
                              onChange={(e) =>
                                updateRow(r.idx, { date: e.target.value })
                              }
                              disabled={!r.selected}
                              className="rounded border border-hairline-soft bg-canvas px-1 py-0.5 text-xs w-32"
                            />
                          </td>
                          <td className="px-2 py-1.5 min-w-[200px]">
                            <input
                              type="text"
                              value={r.description}
                              onChange={(e) =>
                                updateRow(r.idx, {
                                  description: e.target.value,
                                })
                              }
                              disabled={!r.selected}
                              className="w-full rounded border border-hairline-soft bg-canvas px-1 py-0.5 text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                            {r.deposit > 0 ? fmtTHB(r.deposit) : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-red-700">
                            {r.withdraw > 0 ? fmtTHB(r.withdraw) : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-muted text-xs">
                            {r.channel ?? "-"}
                          </td>
                          <td className="px-2 py-1.5 min-w-[180px]">
                            <select
                              value={r.categoryId ?? ""}
                              onChange={(e) =>
                                updateRow(r.idx, {
                                  categoryId: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              disabled={!r.selected}
                              className="w-full rounded border border-hairline-soft bg-canvas px-1 py-0.5 text-xs"
                            >
                              <option value="">— ไม่ระบุ —</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-card border border-hairline bg-surface/40 px-4 py-6 text-center text-xs text-muted">
                  ทุกรายการในไฟล์นี้เคยนำเข้าแล้ว — ไม่มีรายการใหม่ให้บันทึก
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onImport}
                  disabled={pending || selectedCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  ยืนยันนำเข้า {selectedCount} รายการ
                </button>
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
