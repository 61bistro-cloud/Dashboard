import { redirect } from "next/navigation";
import {
  ReceiptText,
  Receipt,
  Wallet,
  Tag,
  Percent,
  History,
  FileSpreadsheet,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fmtTHB } from "@/lib/fiscal";
import { getCurrentBusiness } from "@/lib/business";
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

  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={ReceiptText} title="POS Sales" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1"));

  const where: {
    businessId: number;
    businessDate?: { gte?: string; lte?: string };
    channel?: string;
    paymentType?: string;
  } = { businessId: business.id };
  if (sp.from || sp.to) {
    where.businessDate = {};
    if (sp.from) where.businessDate.gte = sp.from;
    if (sp.to) where.businessDate.lte = sp.to;
  }
  if (sp.channel) where.channel = sp.channel;
  if (sp.payment) where.paymentType = sp.payment;

  // Foodstory definition (verified against the dashboard):
  //   - "บิลที่ปิดไปแล้ว" = bills NOT refunded/voided. Includes 100%-discount
  //     bills like staff meals (grandTotal == 0 but bill is still closed).
  //   - "บิลที่ยกเลิก" = refund > 0  OR  promotionType contains "Refund"/"Void"
  //   - All summary numbers (ยอดขายสุทธิ / VAT / ส่วนลด) sum ACROSS every
  //     imported bill (no filter — even cancelled bills have their grandTotal=0
  //     included as zero so it doesn't change totals).
  const cancelledFilter = {
    OR: [
      { refund: { gt: 0 } },
      { promotionType: { contains: "Refund" } },
      { promotionType: { contains: "Void" } },
    ],
  };

  const [
    stats,
    cancelledCountVal,
    recentBatches,
    bills,
    totalBills,
    distinctChannels,
    distinctPayments,
  ] = await Promise.all([
    prisma.posBill.aggregate({
      _count: { id: true },
      _sum: { grandTotal: true, totalDiscount: true, vatAmount: true },
      where,
    }),
    prisma.posBill.count({
      where: { AND: [where, cancelledFilter] },
    }),
    prisma.posImportBatch.findMany({
      where: { businessId: business.id },
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
      where: { businessId: business.id, channel: { not: null } },
    }),
    prisma.posBill.findMany({
      distinct: ["paymentType"],
      select: { paymentType: true },
      where: { businessId: business.id, paymentType: { not: null } },
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
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
          value={(stats._count.id - cancelledCountVal).toLocaleString("th-TH")}
          sub={
            cancelledCountVal > 0
              ? `+ ${cancelledCountVal} ยกเลิก (refund / void)`
              : "ทั้งหมด"
          }
        />
        <Stat
          icon={Wallet}
          label="ยอดขายสุทธิ"
          value={fmtTHB(stats._sum.grandTotal ?? 0)}
          sub="ตรงกับ Foodstory dashboard"
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
          <div className="flex items-center gap-2 flex-wrap">
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
                className="rounded-input bg-ink px-3 py-1 text-canvas hover:bg-ink-2"
              >
                กรอง
              </button>
            </form>
            <a
              href={(() => {
                const qs = new URLSearchParams();
                if (sp.from) qs.set("from", sp.from);
                if (sp.to) qs.set("to", sp.to);
                if (sp.channel) qs.set("channel", sp.channel);
                if (sp.payment) qs.set("payment", sp.payment);
                const s = qs.toString();
                return `/api/pos-bills/export${s ? `?${s}` : ""}`;
              })()}
              className="inline-flex items-center gap-1.5 rounded-pill bg-surface hover:bg-hairline px-3 py-1.5 text-xs font-medium text-ink transition-colors"
              title="Export ทุกบิลที่ตรงกับ filter เป็น .xlsx"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.75} />
              Export Excel
            </a>
          </div>
        </header>

        {bills.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            ยังไม่มีข้อมูลบิล — Upload Foodstory export เพื่อเริ่มต้น
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-max text-xs">
              <thead className="bg-surface text-left">
                <tr>
                  <Th sticky>วันที่</Th>
                  <Th>เวลา</Th>
                  <Th sticky2>เลขบิล / ID</Th>
                  <Th>POS ID</Th>
                  <Th>INV. No</Th>
                  <Th align="right">ยอดก่อนลด</Th>
                  <Th align="right">ส่วนลดสินค้า</Th>
                  <Th align="right">ส่วนลดบิล</Th>
                  <Th align="right">ยอดรวม</Th>
                  <Th align="right">ค่าบริการ</Th>
                  <Th align="right">ภาษี</Th>
                  <Th align="right">มูลค่า Voucher</Th>
                  <Th align="right">ส่วนลด Voucher</Th>
                  <Th align="right">ยอดปัดเศษ</Th>
                  <Th align="right">ค่าจัดส่ง</Th>
                  <Th align="right">รวมสุทธิ</Th>
                  <Th align="right">ทิป</Th>
                  <Th align="right">คืนเงิน</Th>
                  <Th>ประเภทการสั่ง</Th>
                  <Th>ประเภทการชำระ</Th>
                  <Th>วิธีบันทึก</Th>
                  <Th>ช่องทาง</Th>
                  <Th>โต๊ะ</Th>
                  <Th align="right">จำนวนลูกค้า</Th>
                  <Th>ชื่อลูกค้า</Th>
                  <Th>หมายเหตุ</Th>
                  <Th>LINE MAN วันที่</Th>
                  <Th align="right">LINE MAN ยอด</Th>
                  <Th>โปรโมชั่น</Th>
                  <Th>โค้ด</Th>
                  <Th>เปิดบิล</Th>
                  <Th>ปิดบิล</Th>
                  <Th>สาขา</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {bills.map((b) => {
                  const dateStr = b.paidAt.toLocaleDateString("th-TH", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  });
                  const timeStr = b.paidAt.toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <tr key={b.id} className="hover:bg-surface">
                      <Td sticky muted>
                        {dateStr}
                      </Td>
                      <Td muted>{timeStr}</Td>
                      <Td sticky2 mono>
                        {b.id}
                      </Td>
                      <Td muted>{b.posId ?? "-"}</Td>
                      <Td muted>{b.invoiceNo ?? "-"}</Td>
                      <Td num>{fmtTHB(b.grossAmount)}</Td>
                      <Td num red>
                        {b.itemDiscount > 0 ? fmtTHB(b.itemDiscount) : "-"}
                      </Td>
                      <Td num red>
                        {b.billDiscount > 0 ? fmtTHB(b.billDiscount) : "-"}
                      </Td>
                      <Td num>{fmtTHB(b.totalAmount)}</Td>
                      <Td num muted>
                        {b.serviceCharge > 0 ? fmtTHB(b.serviceCharge) : "-"}
                      </Td>
                      <Td num muted>
                        {fmtTHB(b.vatAmount)}
                      </Td>
                      <Td num muted>
                        {b.voucherAmount > 0 ? fmtTHB(b.voucherAmount) : "-"}
                      </Td>
                      <Td num red>
                        {b.voucherDiscount > 0
                          ? fmtTHB(b.voucherDiscount)
                          : "-"}
                      </Td>
                      <Td num muted>
                        {b.roundingAmount !== 0
                          ? fmtTHB(b.roundingAmount)
                          : "-"}
                      </Td>
                      <Td num muted>
                        {b.shippingFee > 0 ? fmtTHB(b.shippingFee) : "-"}
                      </Td>
                      <Td num bold>
                        {fmtTHB(b.grandTotal)}
                      </Td>
                      <Td num muted>
                        {b.tip > 0 ? fmtTHB(b.tip) : "-"}
                      </Td>
                      <Td num red>
                        {b.refund > 0 ? fmtTHB(b.refund) : "-"}
                      </Td>
                      <Td>{b.orderType ?? "-"}</Td>
                      <Td>{b.paymentType ?? "-"}</Td>
                      <Td muted>{b.paymentMethod ?? "-"}</Td>
                      <Td>{b.channel ?? "-"}</Td>
                      <Td muted>{b.tableNo ?? "-"}</Td>
                      <Td num muted>
                        {b.customerCount ?? "-"}
                      </Td>
                      <Td muted>{b.customerName ?? "-"}</Td>
                      <Td muted>{b.note ?? "-"}</Td>
                      <Td muted>{b.lineManAdjustDate ?? "-"}</Td>
                      <Td num muted>
                        {b.lineManAdjustAmt ? fmtTHB(b.lineManAdjustAmt) : "-"}
                      </Td>
                      <Td muted>{b.promotionType ?? "-"}</Td>
                      <Td muted>{b.promotionCode ?? "-"}</Td>
                      <Td muted>{b.openedBy ?? "-"}</Td>
                      <Td muted>{b.closedBy ?? "-"}</Td>
                      <Td muted>{b.branch ?? "-"}</Td>
                    </tr>
                  );
                })}
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

function Th({
  children,
  align = "left",
  sticky,
  sticky2,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sticky?: boolean;
  sticky2?: boolean;
}) {
  const stickyCls = sticky
    ? "sticky left-0 z-10 bg-surface"
    : sticky2
      ? "sticky left-[80px] z-10 bg-surface"
      : "";
  return (
    <th
      className={`px-3 py-2 font-medium whitespace-nowrap ${align === "right" ? "text-right" : ""} ${stickyCls}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  num,
  red,
  bold,
  muted,
  mono,
  sticky,
  sticky2,
}: {
  children: React.ReactNode;
  num?: boolean;
  red?: boolean;
  bold?: boolean;
  muted?: boolean;
  mono?: boolean;
  sticky?: boolean;
  sticky2?: boolean;
}) {
  const cls = [
    "px-3 py-1.5 whitespace-nowrap",
    num && "text-right tabular-nums",
    red && "text-red-700",
    bold && "font-medium",
    muted && "text-muted",
    mono && "font-mono text-[11px]",
    sticky && "sticky left-0 bg-canvas group-hover:bg-surface",
    sticky2 && "sticky left-[80px] bg-canvas group-hover:bg-surface",
  ]
    .filter(Boolean)
    .join(" ");
  return <td className={cls}>{children}</td>;
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-canvas p-4">
      <Icon className="h-5 w-5 text-muted-soft" strokeWidth={1.75} />
      <div className="mt-2 text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-soft">{sub}</div>}
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
