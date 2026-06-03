import { redirect } from "next/navigation";
import {
  ReceiptText,
  Receipt,
  Wallet,
  Tag,
  Percent,
  History,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fmtTHB } from "@/lib/fiscal";
import { UploadForm } from "./_components/upload-form";
import { DeleteBatchButton } from "./_components/delete-batch-button";
import { PageHeader } from "@/components/page-header";
import type { LucideIcon } from "lucide-react";

type SearchParams = Promise<{
  from?: string;
  to?: string;
  channel?: string;
  payment?: string;
  page?: string;
}>;

const PAGE_SIZE = 50;

export default async function PosSalesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1"));

  const where: {
    paymentDate?: { gte?: string; lte?: string };
    channel?: string;
    paymentType?: string;
  } = {};
  if (sp.from || sp.to) {
    where.paymentDate = {};
    if (sp.from) where.paymentDate.gte = sp.from;
    if (sp.to) where.paymentDate.lte = sp.to;
  }
  if (sp.channel) where.channel = sp.channel;
  if (sp.payment) where.paymentType = sp.payment;

  const [
    stats,
    recentBatches,
    bills,
    totalBills,
    distinctChannels,
    distinctPayments,
  ] = await Promise.all([
    prisma.posBill.aggregate({
      _count: { id: true },
      _sum: { netAmount: true, totalDiscount: true, vatAmount: true },
      where,
    }),
    prisma.posImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { uploadedBy: { select: { name: true, email: true } } },
    }),
    prisma.posBill.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.posBill.count({ where }),
    prisma.posBill.findMany({
      distinct: ["channel"],
      select: { channel: true },
      where: { channel: { not: null } },
    }),
    prisma.posBill.findMany({
      distinct: ["paymentType"],
      select: { paymentType: true },
      where: { paymentType: { not: null } },
    }),
  ]);

  const canImport =
    session.user.role === "OWNER" ||
    session.user.role === "ACCOUNTANT" ||
    session.user.role === "STAFF";
  const canDelete =
    session.user.role === "OWNER" || session.user.role === "ACCOUNTANT";

  const totalPages = Math.max(1, Math.ceil(totalBills / PAGE_SIZE));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={ReceiptText}
        title="POS Sales"
        description="ข้อมูลบิลจาก Foodstory — Upload .xlsx แล้วระบบจะ parse + dedupe ตามเลขบิล"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={Receipt}
          label="จำนวนบิล"
          value={stats._count.id.toLocaleString("th-TH")}
        />
        <Stat
          icon={Wallet}
          label="รวม Net"
          value={fmtTHB(stats._sum.netAmount ?? 0)}
        />
        <Stat
          icon={Tag}
          label="ส่วนลดรวม"
          value={fmtTHB(stats._sum.totalDiscount ?? 0)}
        />
        <Stat
          icon={Percent}
          label="VAT รวม"
          value={fmtTHB(stats._sum.vatAmount ?? 0)}
        />
      </div>

      {/* Upload */}
      {canImport && <UploadForm />}

      {/* Recent imports */}
      {recentBatches.length > 0 && (
        <section className="rounded-card border border-hairline bg-canvas">
          <header className="border-b border-hairline-soft px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-muted-soft" strokeWidth={1.75} />
              ประวัติการ import (5 ล่าสุด)
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">วันที่</th>
                  <th className="px-4 py-2 font-medium">ไฟล์</th>
                  <th className="px-4 py-2 font-medium">โดย</th>
                  <th className="px-4 py-2 font-medium text-right">ทั้งหมด</th>
                  <th className="px-4 py-2 font-medium text-right">เพิ่ม</th>
                  <th className="px-4 py-2 font-medium text-right">อัปเดต</th>
                  <th className="px-4 py-2 font-medium text-right">Error</th>
                  {canDelete && <th className="px-4 py-2 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {recentBatches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 text-muted whitespace-nowrap">
                      {b.createdAt.toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-2 truncate max-w-xs">
                      {b.fileName}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {b.uploadedBy.name ?? b.uploadedBy.email}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {b.rowsTotal}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                      +{b.rowsInserted}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-sky-700">
                      ↻{b.rowsUpdated}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-700">
                      {b.rowsErrored || "-"}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-2 text-center">
                        <DeleteBatchButton
                          batchId={b.id}
                          fileName={b.fileName}
                          rowCount={b.rowsInserted + b.rowsUpdated}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Filters + Bills table */}
      <section className="rounded-card border border-hairline bg-canvas">
        <header className="flex items-center justify-between gap-3 border-b border-hairline-soft px-5 py-3 flex-wrap">
          <h2 className="text-sm font-semibold">
            บิลทั้งหมด ({totalBills.toLocaleString("th-TH")})
          </h2>
          <form className="flex items-center gap-2 flex-wrap text-sm">
            <input
              type="date"
              name="from"
              defaultValue={sp.from}
              className="rounded-input border border-hairline px-2 py-1"
              aria-label="จากวันที่"
            />
            <span className="text-muted-soft">→</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to}
              className="rounded-input border border-hairline px-2 py-1"
              aria-label="ถึงวันที่"
            />
            <select
              name="channel"
              defaultValue={sp.channel ?? ""}
              className="rounded-input border border-hairline px-2 py-1"
              aria-label="ช่องทาง"
            >
              <option value="">ทุกช่องทาง</option>
              {distinctChannels.map((c) =>
                c.channel ? (
                  <option key={c.channel} value={c.channel}>
                    {c.channel}
                  </option>
                ) : null
              )}
            </select>
            <select
              name="payment"
              defaultValue={sp.payment ?? ""}
              className="rounded-input border border-hairline px-2 py-1"
              aria-label="วิธีจ่าย"
            >
              <option value="">ทุกวิธีจ่าย</option>
              {distinctPayments.map((c) =>
                c.paymentType ? (
                  <option key={c.paymentType} value={c.paymentType}>
                    {c.paymentType}
                  </option>
                ) : null
              )}
            </select>
            <button
              type="submit"
              className="rounded-input bg-ink px-3 py-1 text-white hover:bg-ink-2"
            >
              กรอง
            </button>
          </form>
        </header>

        {bills.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            ยังไม่มีข้อมูลบิล — Upload Foodstory export เพื่อเริ่มต้น
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">เลขบิล</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium">วิธีจ่าย</th>
                  <th className="px-3 py-2 font-medium">ช่องทาง</th>
                  <th className="px-3 py-2 font-medium">โต๊ะ</th>
                  <th className="px-3 py-2 font-medium text-right">Gross</th>
                  <th className="px-3 py-2 font-medium text-right">ส่วนลด</th>
                  <th className="px-3 py-2 font-medium text-right">Net</th>
                  <th className="px-3 py-2 font-medium text-right">VAT</th>
                  <th className="px-3 py-2 font-medium text-right">รวมสุทธิ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {bills.map((b) => (
                  <tr key={b.id} className="hover:bg-surface">
                    <td className="px-3 py-1.5 text-muted whitespace-nowrap">
                      {b.paidAt.toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{b.id}</td>
                    <td className="px-3 py-1.5">{b.orderType ?? "-"}</td>
                    <td className="px-3 py-1.5">{b.paymentType ?? "-"}</td>
                    <td className="px-3 py-1.5">{b.channel ?? "-"}</td>
                    <td className="px-3 py-1.5 text-muted">
                      {b.tableNo ?? "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmtTHB(b.grossAmount)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                      {b.totalDiscount > 0 ? fmtTHB(b.totalDiscount) : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                      {fmtTHB(b.netAmount)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {fmtTHB(b.vatAmount)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmtTHB(b.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} sp={sp} />
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-canvas p-4">
      <Icon className="h-5 w-5 text-muted-soft" strokeWidth={1.75} />
      <div className="mt-2 text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number;
  totalPages: number;
  sp: Record<string, string | undefined>;
}) {
  const mkUrl = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== "page") params.set(k, v);
    }
    params.set("page", String(p));
    return `/pos-sales?${params.toString()}`;
  };
  return (
    <div className="flex items-center justify-center gap-1 px-5 py-3 text-sm border-t border-hairline-soft">
      <a
        href={mkUrl(Math.max(1, page - 1))}
        className={
          "rounded-input px-3 py-1 " +
          (page === 1
            ? "pointer-events-none text-muted-soft"
            : "hover:bg-surface")
        }
      >
        ‹ ก่อนหน้า
      </a>
      <span className="px-3 py-1 text-muted tabular-nums">
        {page} / {totalPages}
      </span>
      <a
        href={mkUrl(Math.min(totalPages, page + 1))}
        className={
          "rounded-input px-3 py-1 " +
          (page === totalPages
            ? "pointer-events-none text-muted-soft"
            : "hover:bg-surface")
        }
      >
        ถัดไป ›
      </a>
    </div>
  );
}
