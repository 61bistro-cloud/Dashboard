import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fmtTHB } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import { getClosingView } from "@/lib/closing";
import { PLStatement } from "@/components/pl-statement";
import { PrintButton } from "./print-button";

export const metadata = { title: "งบกำไรขาดทุน — Export" };

type SearchParams = Promise<{ month?: string }>;

// A print-optimized P&L report. Forced light colours so it prints cleanly
// regardless of the app theme. Lives outside the (app) layout (no sidebar).
export default async function ClosingPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    redirect("/");
  }
  const business = await getCurrentBusiness();
  if (!business) redirect("/");

  const sp = await searchParams;
  const monthId = Number(sp.month);
  if (!monthId) redirect("/closing");

  const view = await getClosingView(business.id, monthId);
  if (!view) redirect("/closing");

  const base = view.closing ?? view.live;
  const isClosed = view.closing?.status === "CLOSED";
  const now = new Date();
  const ratio = (n: number) =>
    base.netRevenue > 0 ? n / base.netRevenue : null;
  const ratios: [string, number | null][] = [
    ["Food %", ratio(base.cogs)],
    ["Labor %", ratio(base.labor)],
    ["Prime %", ratio(base.cogs + base.labor)],
    ["Fixed %", ratio(base.fixed)],
  ];

  const money = (n: number) => fmtTHB(n);

  return (
    <div
      style={{ colorScheme: "light" }}
      className="min-h-screen bg-neutral-100 text-black"
    >
      {/* toolbar (hidden when printing) */}
      <div className="no-print sticky top-0 flex items-center justify-between gap-3 border-b border-neutral-300 bg-white px-6 py-3">
        <a
          href={`/closing?month=${monthId}`}
          className="text-sm text-neutral-500 hover:text-black"
        >
          ← กลับ
        </a>
        <PrintButton />
      </div>

      {/* A4 sheet */}
      <div className="mx-auto my-6 w-full max-w-[820px] bg-white px-10 py-10 shadow print:my-0 print:shadow-none print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <div className="text-2xl font-bold tracking-tight">
              {business.name}
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              งบกำไรขาดทุน (Profit &amp; Loss Statement)
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{view.month.fullLabel}</div>
            <div className="text-neutral-500">
              ออกเมื่อ {now.toLocaleDateString("th-TH")}
            </div>
            <div
              className={
                "mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium " +
                (isClosed
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-neutral-200 text-neutral-700")
              }
            >
              {isClosed ? "ปิดงบแล้ว (FINALIZED)" : "ฉบับร่าง (DRAFT)"}
            </div>
          </div>
        </div>

        {isClosed && view.closing && (
          <div className="mt-2 text-xs text-neutral-500">
            ปิดงบโดย {view.closing.closedByName ?? "—"} เมื่อ{" "}
            {view.closing.closedAt.toLocaleString("th-TH")}
          </div>
        )}

        {/* P&L table (professional hierarchical statement with breakdowns) */}
        <div className="mt-6">
          <PLStatement view={view} print />
        </div>

        {/* Cost ratios */}
        <div className="mt-5 grid grid-cols-4 gap-3 text-center text-xs">
          {ratios.map(([label, v]) => (
            <div key={label} className="rounded border border-neutral-300 py-2">
              <div className="text-neutral-500">{label}</div>
              <div className="mt-0.5 font-semibold">
                {v == null ? "-" : `${(v * 100).toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>

        {/* Adjustments */}
        {view.adjustments.length > 0 && (
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase text-neutral-500">
              รายการปรับปรุง
            </div>
            <table className="mt-1 w-full text-sm">
              <tbody>
                {view.adjustments.map((a) => (
                  <tr key={a.id} className="border-b border-neutral-200">
                    <td className="py-1">
                      [{a.kind === "REVENUE" ? "รายได้" : "ต้นทุน"}] {a.label}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {money(a.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Validation summary */}
        <div className="mt-6">
          <div className="text-xs font-semibold uppercase text-neutral-500">
            ผลการตรวจสอบ
          </div>
          <ul className="mt-1 text-xs text-neutral-700">
            {view.checks.map((c) => (
              <li
                key={c.key}
                className="flex justify-between border-b border-neutral-100 py-1"
              >
                <span>
                  {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✗"}{" "}
                  {c.label}
                </span>
                <span className="text-neutral-500">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {view.closing?.note && (
          <div className="mt-5 text-sm">
            <span className="text-neutral-500">หมายเหตุ: </span>
            {view.closing.note}
          </div>
        )}

        {/* Sign-off */}
        <div className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-neutral-600">
          <div>
            <div className="border-t border-neutral-400 pt-1">
              ผู้จัดทำ (Accountant)
            </div>
          </div>
          <div>
            <div className="border-t border-neutral-400 pt-1">
              ผู้อนุมัติ / เจ้าของร้าน (Owner)
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-[10px] text-neutral-400">
          เอกสารนี้สร้างจากระบบบัญชี 61 Bistro — {now.toLocaleString("th-TH")}
        </div>
      </div>
    </div>
  );
}
