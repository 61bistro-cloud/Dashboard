import type { ClosingView } from "@/lib/closing";

// Accounting-style number: no currency symbol, negatives in parentheses.
function acct(n: number): string {
  const s = Math.abs(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${s})` : s;
}

type Row =
  | { t: "section"; label: string }
  | { t: "sub"; label: string }
  | { t: "item"; label: string; amount: number }
  | { t: "subtotal"; label: string; amount: number }
  | { t: "total"; label: string; amount: number }
  | { t: "grand"; label: string; amount: number }
  | { t: "memo"; label: string; value: string };

/** Turn a closing view into a hierarchical income-statement row list. */
export function buildStatementRows(view: ClosingView): Row[] {
  const b = view.breakdown;
  const base = view.closing ?? view.live;
  const rows: Row[] = [];

  // ───── Revenue ─────
  rows.push({ t: "section", label: "รายได้" });
  rows.push({ t: "sub", label: "รายได้จากการขาย (POS)" });
  if (b.revenue.length === 0) {
    rows.push({ t: "item", label: "— ยังไม่มีข้อมูลยอดขาย —", amount: 0 });
  } else {
    for (const l of b.revenue)
      rows.push({ t: "item", label: l.label, amount: l.amount });
  }
  rows.push({
    t: "subtotal",
    label: "รวมรายได้จากการขาย",
    amount: base.netRevenue,
  });
  if (view.adjustRevenue !== 0)
    rows.push({
      t: "item",
      label: "ปรับปรุงรายได้",
      amount: view.adjustRevenue,
    });
  rows.push({ t: "total", label: "รวมรายได้", amount: view.final.netRevenue });

  // ───── Expenses ─────
  rows.push({ t: "section", label: "ค่าใช้จ่าย" });

  rows.push({ t: "sub", label: "ต้นทุนวัตถุดิบ (COGS)" });
  const cogs = [...b.cogsFood, ...b.cogsBev, ...b.cogsPack];
  if (cogs.length === 0)
    rows.push({ t: "item", label: "— ไม่มี —", amount: 0 });
  else
    for (const l of cogs)
      rows.push({ t: "item", label: l.label, amount: l.amount });
  rows.push({ t: "subtotal", label: "รวมต้นทุนวัตถุดิบ", amount: base.cogs });

  rows.push({ t: "sub", label: "ค่าแรงพนักงาน (Labor)" });
  const labor = [...b.laborSalary, ...b.laborExtra];
  if (labor.length === 0)
    rows.push({ t: "item", label: "— ไม่มี —", amount: 0 });
  else
    for (const l of labor)
      rows.push({ t: "item", label: l.label, amount: l.amount });
  rows.push({ t: "subtotal", label: "รวมค่าแรงพนักงาน", amount: base.labor });

  rows.push({ t: "sub", label: "ค่าใช้จ่ายประจำ (Fixed Cost)" });
  if (b.fixed.length === 0)
    rows.push({ t: "item", label: "— ไม่มี —", amount: 0 });
  else
    for (const l of b.fixed)
      rows.push({ t: "item", label: l.label, amount: l.amount });
  rows.push({ t: "subtotal", label: "รวมค่าใช้จ่ายประจำ", amount: base.fixed });

  if (view.adjustCost !== 0)
    rows.push({ t: "item", label: "ปรับปรุงต้นทุน", amount: view.adjustCost });
  rows.push({
    t: "total",
    label: "รวมค่าใช้จ่าย",
    amount: view.final.totalCost,
  });

  // ───── Net ─────
  rows.push({
    t: "grand",
    label: "กำไร(ขาดทุน) สุทธิ",
    amount: view.final.netProfit,
  });
  rows.push({
    t: "memo",
    label: "Net Margin",
    value:
      view.final.marginPct == null
        ? "-"
        : `${(view.final.marginPct * 100).toFixed(1)}%`,
  });

  return rows;
}

/** Render the income statement. `print` switches to fixed light colours. */
export function PLStatement({
  view,
  print = false,
}: {
  view: ClosingView;
  print?: boolean;
}) {
  const rows = buildStatementRows(view);

  const c = print
    ? {
        ink: "text-black",
        muted: "text-neutral-600",
        faint: "text-neutral-500",
        rule: "border-neutral-300",
        ruleStrong: "border-neutral-400",
        bar: "bg-neutral-100",
        grand: "border-black",
        pos: "text-emerald-700",
        neg: "text-red-700",
      }
    : {
        ink: "text-ink",
        muted: "text-muted",
        faint: "text-muted-soft",
        rule: "border-hairline-soft",
        ruleStrong: "border-hairline",
        bar: "bg-surface",
        grand: "border-ink",
        pos: "text-emerald-700",
        neg: "text-red-700",
      };

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => {
          if (r.t === "section") {
            return (
              <tr key={i}>
                <td
                  colSpan={2}
                  className={`${c.bar} ${c.ink} px-2 py-1.5 text-[13px] font-semibold`}
                >
                  {r.label}
                </td>
              </tr>
            );
          }
          if (r.t === "sub") {
            return (
              <tr key={i}>
                <td
                  colSpan={2}
                  className={`${c.ink} pl-3 pt-2 pb-0.5 font-medium`}
                >
                  {r.label}
                </td>
              </tr>
            );
          }
          if (r.t === "item") {
            return (
              <tr key={i}>
                <td className={`${c.muted} py-0.5 pl-7`}>{r.label}</td>
                <td className={`${c.ink} py-0.5 text-right tabular-nums`}>
                  {acct(r.amount)}
                </td>
              </tr>
            );
          }
          if (r.t === "subtotal") {
            return (
              <tr key={i} className={`border-t ${c.rule}`}>
                <td className={`${c.ink} py-1 pl-3 font-medium`}>{r.label}</td>
                <td
                  className={`${c.ink} py-1 text-right font-medium tabular-nums`}
                >
                  {acct(r.amount)}
                </td>
              </tr>
            );
          }
          if (r.t === "total") {
            return (
              <tr key={i} className={`border-t ${c.ruleStrong}`}>
                <td className={`${c.ink} py-1.5 font-semibold`}>{r.label}</td>
                <td
                  className={`${c.ink} py-1.5 text-right font-semibold tabular-nums`}
                >
                  {acct(r.amount)}
                </td>
              </tr>
            );
          }
          if (r.t === "grand") {
            return (
              <tr key={i} className={`border-t-2 ${c.grand}`}>
                <td className={`${c.ink} pt-3 pb-1 text-base font-bold`}>
                  {r.label}
                </td>
                <td
                  className={`pt-3 pb-1 text-right text-base font-bold tabular-nums ${
                    r.amount >= 0 ? c.pos : c.neg
                  }`}
                >
                  {acct(r.amount)}
                </td>
              </tr>
            );
          }
          // memo
          return (
            <tr key={i}>
              <td className={`${c.faint} py-0.5 text-xs`}>{r.label}</td>
              <td
                className={`${c.faint} py-0.5 text-right text-xs tabular-nums`}
              >
                {r.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
