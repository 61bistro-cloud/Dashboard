"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Save } from "lucide-react";
import { saveReconEntries } from "../actions";

export type DayRow = {
  date: string;
  weekday: string;
  pos: number;
  actual: number | null;
};

const fmt = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function ReconEntryTable({
  itemId,
  itemName,
  days,
}: {
  itemId: number;
  itemName: string;
  days: DayRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      days.map((d) => [d.date, d.actual == null ? "" : String(d.actual)])
    )
  );

  const parse = (s: string): number | null => {
    const t = s.trim().replace(/,/g, "");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  let totalPos = 0;
  let totalActual = 0;
  let totalDiff = 0;
  for (const d of days) {
    totalPos += d.pos;
    const a = parse(vals[d.date] ?? "");
    if (a != null) {
      totalActual += a;
      totalDiff += d.pos - a;
    }
  }

  function save() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const r = await saveReconEntries({
        itemId,
        entries: days.map((d) => ({
          date: d.date,
          actual: vals[d.date] ?? "",
        })),
      });
      if (r.ok) {
        setMsg(`บันทึกแล้ว (${r.saved} วัน)`);
        router.refresh();
      } else setErr(r.message ?? "บันทึกไม่สำเร็จ");
    });
  }

  return (
    <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
      <header className="border-b border-hairline-soft px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">{itemName}</h2>
          <p className="text-xs text-muted mt-0.5">
            ยอดหลัก = ดึงจาก POS อัตโนมัติ · ยอดเข้าจริง = กรอกเอง · ต่าง =
            ยอดหลัก − เข้าจริง
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-canvas disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          บันทึกยอดเข้าจริง
        </button>
      </header>

      {(msg || err) && (
        <div className="px-5 pt-3">
          {msg && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <Check className="h-3.5 w-3.5" /> {msg}
            </p>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-3 py-2 font-medium">วันที่</th>
              <th className="px-3 py-2 font-medium text-right">
                ยอดหลัก (POS)
              </th>
              <th className="px-3 py-2 font-medium text-right">ยอดเข้าจริง</th>
              <th className="px-3 py-2 font-medium text-right">ต่าง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {days.map((d) => {
              const a = parse(vals[d.date] ?? "");
              const diff = a == null ? null : d.pos - a;
              const idle = d.pos === 0 && a == null;
              return (
                <tr key={d.date} className={idle ? "text-muted-soft" : ""}>
                  <td className="px-3 py-1 whitespace-nowrap">
                    {d.date.slice(8)}{" "}
                    <span className="text-muted-soft">{d.weekday}</span>
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {d.pos > 0 ? fmt(d.pos) : "-"}
                  </td>
                  <td className="px-3 py-1 text-right">
                    <input
                      inputMode="decimal"
                      value={vals[d.date] ?? ""}
                      onChange={(e) =>
                        setVals((p) => ({ ...p, [d.date]: e.target.value }))
                      }
                      placeholder={d.pos > 0 ? "กรอกยอดที่เข้าจริง" : "-"}
                      className="w-32 rounded border border-hairline-soft bg-canvas px-2 py-0.5 text-right tabular-nums focus:border-ink focus:outline-none"
                    />
                  </td>
                  <td
                    className={
                      "px-3 py-1 text-right tabular-nums " +
                      (diff == null
                        ? "text-muted-soft"
                        : diff > 0.01
                          ? "text-amber-700"
                          : diff < -0.01
                            ? "text-red-700"
                            : "text-emerald-700")
                    }
                  >
                    {diff == null ? "-" : fmt(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-surface font-medium">
            <tr>
              <td className="px-3 py-2">รวม</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(totalPos)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                {fmt(totalActual)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                {fmt(totalDiff)}
                {totalActual > 0 && totalPos > 0 && (
                  <span className="ml-1 text-[10px] text-muted-soft">
                    ({((totalDiff / totalPos) * 100).toFixed(2)}%)
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
