import { redirect } from "next/navigation";
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
  Unlock,
  Circle,
  History,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import { getClosingView, type CheckStatus } from "@/lib/closing";
import { MonthPicker } from "../cost-setup/_components/month-picker";
import { PageHeader } from "@/components/page-header";
import { PLStatement } from "@/components/pl-statement";
import { ClosingControls } from "./_components/closing-controls";
import { Adjustments } from "./_components/adjustments";

type SearchParams = Promise<{ month?: string }>;

const CHECK_ICON: Record<CheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};
const CHECK_CLS: Record<CheckStatus, string> = {
  pass: "text-emerald-600",
  warn: "text-amber-500",
  fail: "text-red-600",
};

export default async function ClosingPage({
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
        <PageHeader icon={ClipboardCheck} title="ปิดงบรายเดือน" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const allMonths = await prisma.fiscalMonth.findMany({
    orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
    include: { year: true },
  });
  if (allMonths.length === 0) {
    return (
      <div className="p-8">
        <PageHeader icon={ClipboardCheck} title="ปิดงบรายเดือน" />
        <p className="mt-4 text-red-600">ไม่พบข้อมูลปีงบ</p>
      </div>
    );
  }

  const requested = sp.month ? Number(sp.month) : null;
  const currentMonth =
    (requested ? allMonths.find((m) => m.id === requested) : null) ??
    (await getCurrentFiscalMonth()) ??
    allMonths[0];

  const view = await getClosingView(business.id, currentMonth.id);
  if (!view) {
    return (
      <div className="p-8">
        <PageHeader icon={ClipboardCheck} title="ปิดงบรายเดือน" />
        <p className="mt-4 text-red-600">คำนวณข้อมูลไม่ได้</p>
      </div>
    );
  }

  const recordExists = view.closing != null;
  const isClosed = view.closing?.status === "CLOSED";
  const base = view.closing ?? view.live; // figures source
  const ratio = (n: number) =>
    base.netRevenue > 0 ? n / base.netRevenue : null;
  const ratios = {
    food: ratio(base.cogs),
    labor: ratio(base.labor),
    prime: ratio(base.cogs + base.labor),
    fixed: ratio(base.fixed),
  };
  const fails = view.checks.filter((c) => c.status === "fail").length;
  const warns = view.checks.filter((c) => c.status === "warn").length;

  const exportHref = `/closing-print?month=${currentMonth.id}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <PageHeader
        icon={ClipboardCheck}
        title="ปิดงบรายเดือน"
        description={`${business.name} — งบกำไรขาดทุน ${currentMonth.fullLabel}`}
        action={
          <MonthPicker
            months={allMonths.map((m) => ({
              id: m.id,
              label: `${m.label} ${m.year.yearBE}`,
            }))}
            currentId={currentMonth.id}
          />
        }
      />

      {/* Status banner + controls */}
      <section
        className={
          "rounded-card border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between " +
          (isClosed
            ? "border-emerald-200 bg-emerald-50/60"
            : recordExists
              ? "border-amber-200 bg-amber-50/60"
              : "border-hairline bg-surface/50")
        }
      >
        <div className="flex items-start gap-3">
          {isClosed ? (
            <Lock className="h-5 w-5 text-emerald-700 mt-0.5" strokeWidth={2} />
          ) : recordExists ? (
            <Unlock className="h-5 w-5 text-amber-700 mt-0.5" strokeWidth={2} />
          ) : (
            <Circle
              className="h-5 w-5 text-muted-soft mt-0.5"
              strokeWidth={2}
            />
          )}
          <div>
            <div className="text-sm font-semibold">
              {isClosed
                ? "ปิดงบแล้ว (Finalized)"
                : recordExists
                  ? "เปิดแก้ไขอยู่ (ยังไม่ Finalize)"
                  : "ยังไม่ได้ปิดงบเดือนนี้"}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {isClosed && view.closing
                ? `โดย ${view.closing.closedByName ?? "—"} • ${view.closing.closedAt.toLocaleString("th-TH")}`
                : "กดปุ่มด้านขวาเพื่อปิดงบ เมื่อตรวจสอบความถูกต้องเรียบร้อย"}
            </div>
          </div>
        </div>
        <ClosingControls
          fiscalMonthId={currentMonth.id}
          monthLabel={currentMonth.fullLabel}
          isClosed={isClosed}
          hasDrift={view.drift.length > 0}
          exportHref={exportHref}
        />
      </section>

      {/* Validation checks */}
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2
              className="h-4 w-4 text-muted-soft"
              strokeWidth={1.75}
            />
            ตรวจสอบความถูกต้องก่อนปิดงบ
          </h2>
          <span className="text-xs text-muted">
            {fails > 0 ? (
              <span className="text-red-600">ต้องแก้ {fails} จุด</span>
            ) : warns > 0 ? (
              <span className="text-amber-600">เตือน {warns} จุด</span>
            ) : (
              <span className="text-emerald-600">ผ่านทั้งหมด ✓</span>
            )}
          </span>
        </header>
        <ul className="divide-y divide-hairline-soft">
          {view.checks.map((c) => {
            const Icon = CHECK_ICON[c.status];
            return (
              <li key={c.key} className="flex items-center gap-3 px-5 py-2.5">
                <Icon
                  className={"h-4 w-4 shrink-0 " + CHECK_CLS[c.status]}
                  strokeWidth={2}
                />
                <span className="flex-1 text-sm">{c.label}</span>
                <span className="text-xs text-muted text-right">
                  {c.detail}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* P&L statement */}
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3">
          <h2 className="text-sm font-semibold">
            งบกำไรขาดทุน — {currentMonth.fullLabel}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {isClosed
              ? "ตัวเลข ณ วันที่ปิดงบ (snapshot)"
              : "ตัวเลขปัจจุบันจากบัญชีรายวัน (ยังไม่ปิด)"}
          </p>
        </header>
        <div className="px-3 sm:px-5 py-4">
          <PLStatement view={view} />

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Kpi label="Food %" v={ratios.food} />
            <Kpi label="Labor %" v={ratios.labor} />
            <Kpi label="Prime %" v={ratios.prime} />
            <Kpi label="Fixed %" v={ratios.fixed} />
          </div>
        </div>
      </section>

      {/* Adjustments (only once a closing record exists) */}
      {recordExists && (
        <Adjustments
          fiscalMonthId={currentMonth.id}
          adjustments={view.adjustments}
        />
      )}

      {/* History */}
      {view.logs.length > 0 && (
        <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
          <header className="border-b border-hairline-soft px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
              ประวัติการปิดงบ / แก้ไข
            </h2>
          </header>
          <ul className="divide-y divide-hairline-soft text-xs">
            {view.logs.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-3 px-5 py-2 text-muted"
              >
                <span className="tabular-nums whitespace-nowrap">
                  {l.createdAt.toLocaleString("th-TH")}
                </span>
                <span className="flex-1 text-ink/80">
                  {l.detail ?? l.action}
                </span>
                <span>{l.byName ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="rounded-input border border-hairline bg-surface px-3 py-2">
      <div className="text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">
        {v == null ? "-" : `${(v * 100).toFixed(1)}%`}
      </div>
    </div>
  );
}
