import Link from "next/link";
import { redirect } from "next/navigation";
import { Paperclip } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { getCurrentFiscalMonth } from "@/lib/fiscal";
import { readEvidenceOcr } from "@/lib/evidence-match";
import { PageHeader } from "@/components/page-header";
import { MonthPicker } from "../../cost-setup/_components/month-picker";
import { EvidenceMatcher } from "./_components/evidence-matcher";

export const maxDuration = 60;
export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; account?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!["OWNER", "ACCOUNTANT"].includes(session.user.role)) redirect("/");
  const business = await getCurrentBusiness();
  if (!business) return <p className="p-8">ไม่มีสิทธิ์เข้าถึงธุรกิจ</p>;
  const sp = await searchParams;
  const [months, accounts] = await Promise.all([
    prisma.fiscalMonth.findMany({
      orderBy: [{ year: { yearBE: "desc" } }, { monthIndex: "asc" }],
      include: { year: true },
    }),
    prisma.bankAccount.findMany({
      where: { businessId: business.id },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const month =
    months.find((m) => m.id === Number(sp.month)) ??
    (await getCurrentFiscalMonth()) ??
    months[0];
  if (!month) return <p className="p-8">ยังไม่มีเดือนในระบบ</p>;
  const account = accounts.find((a) => a.code === sp.account);
  const page = Math.max(
    1,
    Number.isSafeInteger(Number(sp.page)) ? Number(sp.page) : 1
  );
  const scope = {
    businessId: business.id,
    fiscalMonthId: month.id,
    kind: { in: ["SLIP", "BILL"] },
  };
  const [files, total, transactions, linked] = await Promise.all([
    prisma.driveFile.findMany({
      where: scope,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 50,
      take: 50,
    }),
    prisma.driveFile.count({ where: scope }),
    prisma.bankTransaction.findMany({
      where: {
        businessId: business.id,
        fiscalMonthId: month.id,
        ...(account ? { accountId: account.id } : {}),
      },
      include: { account: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.driveFile.findMany({
      where: { ...scope, refType: "BANK_TX" },
      select: { refId: true },
    }),
  ]);
  const base = `/bank/evidence?month=${month.id}${account ? `&account=${encodeURIComponent(account.code)}` : ""}`;
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <PageHeader
        icon={Paperclip}
        title="จับคู่หลักฐานกับ Statement"
        description={`${business.name} — ${month.fullLabel}`}
        action={
          <MonthPicker
            months={months.map((m) => ({
              id: m.id,
              label: `${m.label} ${m.year.yearBE}`,
            }))}
            currentId={month.id}
          />
        }
      />
      <div className="flex flex-wrap gap-3 text-xs">
        <Link
          className="underline"
          href={`/bank?month=${month.id}${account ? `&account=${encodeURIComponent(account.code)}` : ""}`}
        >
          กลับ Bank & Reconcile
        </Link>
        <Link className="underline" href="/admin/google">
          อัปโหลดหลักฐานเพิ่ม
        </Link>
      </div>
      <div className="rounded-card border border-hairline bg-surface p-4 text-xs space-y-2">
        <p>
          1. เลือกเดือนให้ตรงกับหลักฐานและ Statement → 2. กดอ่านข้อความ → 3.
          ตรวจรูปและเลือกคู่ → 4. กดยืนยันคู่
        </p>
        <p className="text-muted">
          ระบบแนะนำจากยอดเงิน วันที่ และเวลา ต้องตรวจผู้รับ /
          บัญชีในรูปก่อนยืนยันเสมอ ภาพอ่านไม่ชัดให้กรอกยอดและวันที่เองได้
          การจับคู่เป็นการแนบหลักฐาน ไม่เพิ่มรายรับหรือรายจ่าย
          และไม่ได้ตรวจว่าสลิปแท้
        </p>
      </div>
      <form className="flex flex-wrap gap-3 items-end text-xs">
        <input type="hidden" name="month" value={month.id} />
        <label>
          รายการธนาคารที่จะค้นหา
          <select
            name="account"
            defaultValue={account?.code ?? ""}
            className="block mt-1 rounded border border-hairline bg-canvas px-3 py-2"
          >
            <option value="">ทุกบัญชีของธุรกิจนี้</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-pill bg-ink text-canvas px-4 py-2">
          แสดงรายการ
        </button>
        <span className="text-muted">
          หลักฐาน {total} ไฟล์ • Statement {transactions.length} รายการ
        </span>
      </form>
      <EvidenceMatcher
        key={`${business.id}:${month.id}:${account?.id ?? "all"}:${page}`}
        businessId={business.id}
        monthId={month.id}
        files={files.map((file) => {
          const ocr = readEvidenceOcr(file.note);
          return {
            id: file.id,
            name: file.name,
            url: file.webViewLink,
            kind: file.kind,
            refType: file.refType,
            refId: file.refId,
            ocr: ocr
              ? { amount: ocr.amount, date: ocr.date, time: ocr.time }
              : null,
          };
        })}
        transactions={transactions.map((tx) => ({
          id: tx.id,
          date: tx.date.toISOString(),
          description: tx.description,
          deposit: tx.deposit,
          withdraw: tx.withdraw,
          accountName: tx.account.name,
          accountId: tx.accountId,
        }))}
        linkedTransactionIds={linked
          .map((file) => Number(file.refId))
          .filter(Number.isSafeInteger)}
      />
      {total > 50 && (
        <nav aria-label="หน้าหลักฐาน" className="flex gap-4 text-sm">
          {page > 1 && (
            <Link className="underline" href={`${base}&page=${page - 1}`}>
              หน้าก่อนหน้า
            </Link>
          )}
          <span>
            หน้า {page} / {Math.ceil(total / 50)}
          </span>
          {page * 50 < total && (
            <Link className="underline" href={`${base}&page=${page + 1}`}>
              หน้าถัดไป
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
