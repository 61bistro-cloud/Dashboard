import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Landmark,
  CreditCard,
  Banknote,
  Bike,
  ArrowLeftRight,
  Check,
  Circle,
  AlertCircle,
  X,
  ArrowUpRight,
  ArrowDownRight,
  ChartBar,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalMonth, fmtTHB } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
import {
  getBankMonth,
  getCategorySummary,
  getReconciliation,
  RECON_STATUS_STYLE,
} from "@/lib/bank-calc";
import { MonthPicker } from "../cost-setup/_components/month-picker";
import { AccountTabs } from "./_components/account-tabs";
import { AccountManager } from "./_components/account-manager";
import { CategoryManager } from "./_components/category-manager";
import { TxCategorySelect } from "./_components/tx-category-select";
import { AddTransactionForm } from "./_components/add-transaction-form";
import { OpeningBalanceForm } from "./_components/opening-balance-form";
import { DeleteButton } from "./_components/delete-button";
import { StatementUpload } from "./_components/statement-upload";
import { PageHeader } from "@/components/page-header";
import { BankLogo } from "@/components/bank-logo";
import { StatusDot } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";

const RECON_ICONS: Record<string, LucideIcon> = {
  check: Check,
  dot: Circle,
  alert: AlertCircle,
  x: X,
  circle: Circle,
};

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  EDC_PROMPTPAY: CreditCard,
  CASH: Banknote,
  GRAB: Bike,
  LINEMAN: Bike,
};

function KindBadge({
  kind,
}: {
  kind: "INCOME" | "EXPENSE" | "TRANSFER" | "UNCATEGORIZED";
}) {
  const map = {
    INCOME: { label: "รายรับ", cls: "bg-emerald-50 text-emerald-700" },
    EXPENSE: { label: "รายจ่าย", cls: "bg-red-50 text-red-700" },
    TRANSFER: { label: "โอน", cls: "bg-surface text-ink/75" },
    UNCATEGORIZED: { label: "ไม่ระบุ", cls: "bg-surface text-muted" },
  } as const;
  const m = map[kind];
  return (
    <span className={`inline-flex rounded-pill px-2 py-0.5 text-xs ${m.cls}`}>
      {m.label}
    </span>
  );
}

type SearchParams = Promise<{ month?: string; account?: string }>;

export default async function BankPage({
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
        <PageHeader icon={Landmark} title="Bank & Reconciliation" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน
        </p>
      </div>
    );
  }

  const sp = await searchParams;

  const [allMonths, accounts, categories] = await Promise.all([
    prisma.fiscalMonth.findMany({
      orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
      include: { year: true },
    }),
    prisma.bankAccount.findMany({
      where: { active: true, businessId: business.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.transactionCategory.findMany({
      where: { active: true, businessId: business.id },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  if (allMonths.length === 0) {
    return (
      <div className="p-8">
        <PageHeader icon={Landmark} title="Bank & Reconciliation" />
        <p className="mt-4 text-red-600">ไม่พบข้อมูลปีงบ กรุณา seed ก่อน</p>
      </div>
    );
  }

  // No accounts yet (e.g. all removed) — let the user add the first one.
  if (accounts.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <PageHeader
          icon={Landmark}
          title="Bank & Reconciliation"
          description={`${business.name} — ยังไม่มีบัญชี เพิ่มบัญชี/ช่องทางแรกได้เลยด้านล่าง`}
        />
        <AccountManager accounts={[]} />
      </div>
    );
  }

  const requestedMonth = sp.month ? Number(sp.month) : null;
  const currentMonth =
    (requestedMonth ? allMonths.find((m) => m.id === requestedMonth) : null) ??
    (await getCurrentFiscalMonth()) ??
    allMonths[0];

  const requestedAccount = sp.account ?? accounts[0].code;
  const currentAccount =
    accounts.find((a) => a.code === requestedAccount) ?? accounts[0];

  // Load data for ALL accounts in this month (for summary cards) + selected account detail
  const [allAccountData, selectedData, catSummary, recon] = await Promise.all([
    Promise.all(
      accounts.map((a) =>
        getBankMonth(currentMonth.id, a.id, business.id).then((d) => ({
          account: a,
          ...d,
        }))
      )
    ),
    getBankMonth(currentMonth.id, currentAccount.id, business.id),
    getCategorySummary(currentMonth.id, business.id),
    getReconciliation(currentMonth.id, business.id),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        icon={Landmark}
        title="Bank & Reconciliation"
        description="สมุดเดินบัญชี 3 บัญชี + จับคู่ POS ↔ Statement ต่อช่องทาง"
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

      {/* Account summary cards — click to switch active account */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {allAccountData.map((a) => {
          const isCard = a.account.accountType === "CREDIT_CARD";
          // For credit cards: outstanding = -closing (positive number = debt)
          const outstanding = isCard ? -a.closing : null;
          const isActive = a.account.code === currentAccount.code;
          return (
            <Link
              key={a.account.id}
              href={`/bank?month=${currentMonth.id}&account=${a.account.code}`}
              scroll={false}
              aria-label={`เลือกบัญชี ${a.account.name}`}
              aria-current={isActive ? "page" : undefined}
              className={
                "block rounded-card border p-4 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ink/30 " +
                (isActive
                  ? "border-ink bg-surface"
                  : "border-hairline bg-canvas hover:border-ink/40 hover:bg-surface/50")
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 font-semibold">
                  <BankLogo
                    code={a.account.code}
                    name={a.account.name}
                    size={32}
                  />
                  <span>
                    {a.account.name}
                    {isCard && (
                      <span className="ml-2 inline-flex items-center rounded-pill bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                        บัตรเครดิต
                      </span>
                    )}
                  </span>
                </div>
                <div className="text-xs text-muted">{a.txCount} รายการ</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted">
                    {isCard ? "ยกมาค้างชำระ" : "ยกมา"}
                  </div>
                  <div className="font-medium tabular-nums">
                    {fmtTHB(isCard ? -a.opening : a.opening)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-emerald-600">
                    <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />{" "}
                    {isCard ? "ชำระคืน" : "IN"}
                  </div>
                  <div className="font-medium tabular-nums text-emerald-700">
                    {fmtTHB(a.inflow)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-red-600">
                    <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />{" "}
                    {isCard ? "ใช้จ่าย" : "OUT"}
                  </div>
                  <div className="font-medium tabular-nums text-red-700">
                    {fmtTHB(a.outflow)}
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-hairline flex items-center justify-between">
                <div className="text-xs text-muted">
                  {isCard ? "ยอดค้างชำระ" : "คงเหลือ"}
                </div>
                <div
                  className={
                    "text-lg font-semibold tabular-nums " +
                    (isCard
                      ? (outstanding ?? 0) > 0
                        ? "text-amber-700"
                        : "text-emerald-700"
                      : a.closing < 0
                        ? "text-red-700"
                        : "")
                  }
                >
                  {fmtTHB(isCard ? (outstanding ?? 0) : a.closing)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Reconciliation panel */}
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeftRight
              className="h-4 w-4 text-muted-soft"
              strokeWidth={1.75}
            />
            กระทบยอด POS vs Statement — {currentMonth.fullLabel}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            เทียบยอด POS (จากบิล Foodstory) กับยอดเข้าบัญชี (จาก Bank
            Transaction ที่ categorized) — diff อาจเป็นค่าธรรมเนียม / ยังไม่ลง
            statement
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-3 py-2 font-medium">ช่องทาง</th>
                <th className="px-3 py-2 font-medium text-right">POS (Net)</th>
                <th className="px-3 py-2 font-medium text-right">
                  Statement (Credit)
                </th>
                <th className="px-3 py-2 font-medium text-right">ส่วนต่าง</th>
                <th className="px-3 py-2 font-medium text-right">%Diff</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {recon.map((r) => {
                const style = RECON_STATUS_STYLE[r.status];
                const StatusIcon = RECON_ICONS[style.icon];
                const ChannelIcon = CHANNEL_ICONS[r.posChannel] ?? Circle;
                return (
                  <tr key={r.posChannel}>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <ChannelIcon
                          className="h-4 w-4 text-muted-soft"
                          strokeWidth={1.75}
                        />
                        {r.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtTHB(r.posAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtTHB(r.bankAmount)}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right tabular-nums " +
                        (r.diff > 0
                          ? "text-amber-700"
                          : r.diff < 0
                            ? "text-sky-700"
                            : "")
                      }
                    >
                      {r.posAmount === 0 && r.bankAmount === 0
                        ? "-"
                        : fmtTHB(r.diff)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {r.diffPct == null
                        ? "-"
                        : `${(r.diffPct * 100).toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs rounded-pill px-2 py-0.5 ${style.bg}`}
                      >
                        <StatusIcon className="h-3 w-3" strokeWidth={2.5} />
                        {style.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add / manage accounts & channels + categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AccountManager
          accounts={accounts.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            accountType: a.accountType,
          }))}
        />
        <CategoryManager
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
          }))}
        />
      </div>

      {/* Account tabs */}
      <AccountTabs
        accounts={accounts.map((a) => ({
          code: a.code,
          name: a.name,
        }))}
        currentCode={currentAccount.code}
        monthId={currentMonth.id}
      />

      {/* Selected account detail */}
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              {currentAccount.name} — {currentMonth.fullLabel}
              {currentAccount.accountType === "CREDIT_CARD" && (
                <span className="inline-flex items-center rounded-pill bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                  บัตรเครดิต
                </span>
              )}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {currentAccount.accountType === "CREDIT_CARD" ? (
                <>
                  ยกมาค้างชำระ {fmtTHB(-selectedData.opening)} •{" "}
                  {selectedData.txCount} รายการ • ยอดค้างชำระ{" "}
                  <span
                    className={
                      "font-medium " +
                      (-selectedData.closing > 0 ? "text-amber-700" : "")
                    }
                  >
                    {fmtTHB(-selectedData.closing)}
                  </span>
                </>
              ) : (
                <>
                  ยกมา {fmtTHB(selectedData.opening)} • {selectedData.txCount}{" "}
                  รายการ • คงเหลือ{" "}
                  <span
                    className={
                      "font-medium " +
                      (selectedData.closing < 0 ? "text-red-700" : "")
                    }
                  >
                    {fmtTHB(selectedData.closing)}
                  </span>
                </>
              )}
            </p>
          </div>
          <OpeningBalanceForm
            fiscalMonthId={currentMonth.id}
            accountId={currentAccount.id}
            initial={selectedData.opening}
          />
        </header>

        <StatementUpload
          fiscalMonthId={currentMonth.id}
          accountId={currentAccount.id}
          accountName={currentAccount.name}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
          }))}
        />

        <AddTransactionForm
          fiscalMonthId={currentMonth.id}
          accountId={currentAccount.id}
          defaultDate={`${currentMonth.calendarYear}-${String(
            currentMonth.calendarMonth
          ).padStart(2, "0")}-01`}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
          }))}
        />

        {selectedData.rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            ยังไม่มีรายการในเดือนนี้ — เพิ่มรายการด้านบน
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">รายการ</th>
                  <th className="px-3 py-2 font-medium text-right">
                    {currentAccount.accountType === "CREDIT_CARD"
                      ? "ชำระคืน"
                      : "ฝาก"}
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    {currentAccount.accountType === "CREDIT_CARD"
                      ? "ใช้จ่าย"
                      : "ถอน"}
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    {currentAccount.accountType === "CREDIT_CARD"
                      ? "ค้างชำระสะสม"
                      : "คงเหลือ"}
                  </th>
                  <th className="px-3 py-2 font-medium">ช่องทาง</th>
                  <th className="px-3 py-2 font-medium">หมวด</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {selectedData.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {r.date.toISOString().slice(0, 10)}
                      {r.date.toISOString().slice(11, 16) !== "00:00" && (
                        <span className="ml-1.5 text-muted-soft">
                          {r.date.toISOString().slice(11, 16)}
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
                    <td className="px-3 py-1.5 text-muted">
                      {r.channel ?? "-"}
                    </td>
                    <td className="px-3 py-1.5">
                      <TxCategorySelect
                        txId={r.id}
                        categoryId={r.categoryId}
                        categories={categories.map((c) => ({
                          id: c.id,
                          name: c.name,
                          kind: c.kind,
                        }))}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DeleteButton id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Category summary */}
      <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
        <header className="border-b border-hairline-soft px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ChartBar className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
            สรุปตามหมวดหมู่ — ทั้งเดือน (ทุกบัญชี)
          </h2>
        </header>
        {catSummary.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            ยังไม่มีรายการในเดือนนี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">หมวด</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium text-right">รายรับ</th>
                  <th className="px-3 py-2 font-medium text-right">รายจ่าย</th>
                  <th className="px-3 py-2 font-medium text-right">รายการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {catSummary.map((c) => (
                  <tr key={c.categoryId ?? "_uncat"}>
                    <td className="px-3 py-1.5">{c.name}</td>
                    <td className="px-3 py-1.5 text-xs">
                      <KindBadge kind={c.kind} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                      {c.totalIn > 0 ? fmtTHB(c.totalIn) : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                      {c.totalOut > 0 ? fmtTHB(c.totalOut) : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {c.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
