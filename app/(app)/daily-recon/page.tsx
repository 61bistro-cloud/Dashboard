import { redirect } from "next/navigation";
import Link from "next/link";
import { Scale, AlertTriangle, Settings2, LayoutList } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fmtTHB, getCurrentFiscalMonth } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import { getReconMonth } from "@/lib/recon";
import { MonthPicker } from "../cost-setup/_components/month-picker";
import { PageHeader } from "@/components/page-header";
import { ReconEntryTable } from "./_components/recon-entry-table";
import { ReconItemManager } from "./_components/recon-item-manager";

export const maxDuration = 30;

type SearchParams = Promise<{ month?: string; item?: string; tab?: string }>;

export default async function DailyReconPage({
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
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={Scale} title="กระทบยอดรายวัน" />
        <p className="mt-4 text-red-600">ยังไม่มีสิทธิ์เข้าถึงธุรกิจ</p>
      </div>
    );
  }

  const sp = await searchParams;

  const allMonths = await prisma.fiscalMonth.findMany({
    orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    include: { year: true },
  });
  let sel =
    (sp.month ? allMonths.find((m) => m.id === Number(sp.month)) : null) ??
    null;
  if (!sel && allMonths.length > 0) {
    const latest = await prisma.posBill.findFirst({
      where: { businessId: business.id },
      orderBy: { businessDate: "desc" },
      select: { businessDate: true },
    });
    if (latest) {
      const [ly, lm] = latest.businessDate.split("-").map(Number);
      sel =
        allMonths.find(
          (m) => m.calendarYear === ly && m.calendarMonth === lm
        ) ?? null;
    }
    if (!sel) {
      const cur = await getCurrentFiscalMonth();
      sel =
        (cur ? allMonths.find((m) => m.id === cur.id) : null) ??
        allMonths[0] ??
        null;
    }
  }
  if (!sel) {
    return (
      <div className="p-8">
        <PageHeader icon={Scale} title="กระทบยอดรายวัน" />
        <p className="mt-4 text-muted">ยังไม่มีข้อมูลเดือน</p>
      </div>
    );
  }

  const data = await getReconMonth(business.id, sel.id);
  if (!data) {
    return (
      <div className="p-8">
        <PageHeader icon={Scale} title="กระทบยอดรายวัน" />
        <p className="mt-4 text-red-600">คำนวณไม่ได้</p>
      </div>
    );
  }

  const settings = sp.tab === "settings";
  const activeItem = sp.item
    ? data.items.find((i) => i.id === Number(sp.item))
    : null;
  const mkHref = (q: Record<string, string | number>) => {
    const p = new URLSearchParams({ month: String(sel!.id) });
    for (const [k, v] of Object.entries(q)) p.set(k, String(v));
    return `/daily-recon?${p.toString()}`;
  };

  const grandPos = data.items.reduce((s, i) => s + i.totalPos, 0);
  const grandActual = data.items.reduce((s, i) => s + i.totalActual, 0);
  const grandDiff = data.items.reduce((s, i) => s + i.totalDiff, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <PageHeader
        icon={Scale}
        title="กระทบยอดรายวัน"
        description={`${business.name} — ยอดหลักดึงจาก POS · ยอดเข้าจริงกรอกเอง · ส่วนต่าง = ค่าธรรมเนียม/GP`}
        action={
          <MonthPicker
            months={allMonths.map((m) => ({
              id: m.id,
              label: `${m.label} ${m.year.yearBE}`,
            }))}
            currentId={sel.id}
          />
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        <Tab
          href={mkHref({})}
          active={!activeItem && !settings}
          icon={LayoutList}
        >
          ภาพรวม
        </Tab>
        {data.items.map((it) => (
          <Tab
            key={it.id}
            href={mkHref({ item: it.id })}
            active={activeItem?.id === it.id}
          >
            {it.name}
          </Tab>
        ))}
        <Tab
          href={mkHref({ tab: "settings" })}
          active={settings}
          icon={Settings2}
        >
          ตั้งค่ารายการ
        </Tab>
      </div>

      {settings ? (
        <ReconItemManager
          items={data.items.map((i) => ({
            id: i.id,
            name: i.name,
            matchField: i.matchField,
            matchKeywords: i.matchKeywords,
          }))}
        />
      ) : activeItem ? (
        <ReconEntryTable
          itemId={activeItem.id}
          itemName={activeItem.name}
          days={activeItem.days.map((d) => ({
            date: d.date,
            weekday: d.weekday,
            pos: d.pos,
            actual: d.actual,
          }))}
        />
      ) : (
        <>
          {data.unmatchedPos > 0 && (
            <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                มียอด POS <strong>{fmtTHB(data.unmatchedPos)}</strong>{" "}
                ที่ไม่เข้ารายการไหนเลย — เพิ่ม/แก้กฎในแท็บ “ตั้งค่ารายการ”
                ให้ครอบคลุม
              </span>
            </div>
          )}

          <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
            <header className="border-b border-hairline-soft px-5 py-3">
              <h2 className="text-sm font-semibold">
                ภาพรวม — {data.month.fullLabel}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                กดชื่อรายการเพื่อไปกรอกยอดเข้าจริงรายวัน
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">รายการ</th>
                    <th className="px-3 py-2 font-medium text-right">
                      ยอดหลัก (POS)
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      เข้าจริง (กรอก)
                    </th>
                    <th className="px-3 py-2 font-medium text-right">ต่าง</th>
                    <th className="px-3 py-2 font-medium text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {data.items.map((it) => (
                    <tr key={it.id} className="hover:bg-surface">
                      <td className="px-3 py-1.5">
                        <Link
                          href={mkHref({ item: it.id })}
                          className="text-ink underline"
                        >
                          {it.name}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {it.totalPos > 0 ? fmtTHB(it.totalPos) : "-"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                        {it.totalActual > 0 ? fmtTHB(it.totalActual) : "-"}
                      </td>
                      <td
                        className={
                          "px-3 py-1.5 text-right tabular-nums " +
                          (it.totalActual === 0
                            ? "text-muted-soft"
                            : it.totalDiff > 0.01
                              ? "text-amber-700"
                              : it.totalDiff < -0.01
                                ? "text-red-700"
                                : "text-emerald-700")
                        }
                      >
                        {it.totalActual > 0 ? fmtTHB(it.totalDiff) : "-"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                        {it.totalActual > 0 && it.totalPos > 0
                          ? `${((it.totalDiff / it.totalPos) * 100).toFixed(2)}%`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-surface font-medium">
                  <tr>
                    <td className="px-3 py-2">รวม</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtTHB(grandPos)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {fmtTHB(grandActual)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                      {fmtTHB(grandDiff)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {grandActual > 0 && grandPos > 0
                        ? `${((grandDiff / grandPos) * 100).toFixed(2)}%`
                        : "-"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Daily expenses from the bank statement */}
          <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
            <header className="border-b border-hairline-soft px-5 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                ค่าใช้จ่ายรายวัน (จากธนาคาร)
              </h2>
              <span className="text-xs text-muted">
                รวม{" "}
                <strong className="text-red-700">
                  {fmtTHB(data.expenseTotal)}
                </strong>
              </span>
            </header>
            {data.expenseTotal === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-muted">
                ยังไม่มีรายการเงินออกของเดือนนี้ — นำเข้า statement ในหน้า Bank
                ก่อน
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">วันที่</th>
                      <th className="px-3 py-2 font-medium text-right">
                        จ่ายออก
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline-soft">
                    {data.expenseByDay
                      .filter((d) => d.amount > 0)
                      .map((d) => (
                        <tr key={d.date}>
                          <td className="px-3 py-1">{d.date}</td>
                          <td className="px-3 py-1 text-right tabular-nums text-red-700">
                            {fmtTHB(d.amount)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Tab({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon?: typeof Scale;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium border transition-colors " +
        (active
          ? "bg-ink text-canvas border-ink"
          : "border-hairline bg-canvas hover:bg-surface")
      }
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </Link>
  );
}
