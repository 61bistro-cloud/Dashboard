import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const business = await getCurrentBusiness();
  if (!business) {
    return new NextResponse("No business access", { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const channel = url.searchParams.get("channel") ?? undefined;
  const payment = url.searchParams.get("payment") ?? undefined;

  const where: {
    businessId: number;
    businessDate?: { gte?: string; lte?: string };
    channel?: string;
    paymentType?: string;
  } = { businessId: business.id };
  if (from || to) {
    where.businessDate = {};
    if (from) where.businessDate.gte = from;
    if (to) where.businessDate.lte = to;
  }
  if (channel) where.channel = channel;
  if (payment) where.paymentType = payment;

  const bills = await prisma.posBill.findMany({
    where,
    orderBy: { paidAt: "asc" },
  });

  // Build rows matching Foodstory's 39-column format exactly
  const dd = (d: Date) => {
    const day = String(d.getUTCDate()).padStart(2, "0");
    const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yr = d.getUTCFullYear();
    return `${day}/${mon}/${yr}`;
  };
  const tt = (d: Date) => {
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };

  const data = bills.map((b) => ({
    วันที่ชำระเงิน: dd(b.paidAt),
    เวลาที่ชำระเงิน: tt(b.paidAt),
    เวลา: "",
    "หมายเลขใบเสร็จ / ID": b.id,
    "POS ID": b.posId ?? "",
    "INV. No": b.invoiceNo ?? "",
    ยอดก่อนลด: b.grossAmount,
    ส่วนลดสินค้า: b.itemDiscount,
    ส่วนลดบิล: b.billDiscount,
    ยอดรวม: b.totalAmount,
    ค่าบริการ: b.serviceCharge,
    ยอดสินค้าไม่มีภาษี: "",
    ยอดสินค้ามีภาษี: b.totalAmount,
    ยอดก่อนภาษี: b.totalAmount - b.vatAmount,
    ภาษี: b.vatAmount,
    "มูลค่า Voucher": b.voucherAmount,
    "ส่วนลด Voucher": b.voucherDiscount,
    ยอดปัดเศษ: b.roundingAmount,
    ค่าจัดส่ง: b.shippingFee,
    รวมสุทธิ: b.grandTotal,
    ทิป: b.tip,
    คืนเงิน: b.refund,
    ประเภทการสั่ง: b.orderType ?? "",
    รหัสถาดเก็บเงิน: "",
    ประเภทการชำระเงิน: b.paymentType ?? "",
    วิธีบันทึกรายการชำระ: b.paymentMethod ?? "",
    รหัสชำระเงินแบบกำหนดเอง: "",
    ช่องทาง: b.channel ?? "",
    โต๊ะ: b.tableNo ?? "",
    จำนวนลูกค้า: b.customerCount ?? "",
    ชื่อลูกค้า: b.customerName ?? "",
    หมายเหตุ: b.note ?? "",
    "LINE MAN วันที่ปรับยอด": b.lineManAdjustDate ?? "",
    "LINE MAN ยอดปรับยอด": b.lineManAdjustAmt ?? 0,
    ประเภทโปรโมชั่น: b.promotionType ?? "",
    โปรโมชั่นโค้ด: b.promotionCode ?? "",
    เปิดบิลโดย: b.openedBy ?? "",
    ปิดบิลโดย: b.closedBy ?? "",
    สาขา: b.branch ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(data, { cellDates: false });
  // Set reasonable column widths
  ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({
    wch: Math.max(10, Math.min(30, k.length + 2)),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "POS Bills");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const now = new Date();
  const fname = `61bistro-pos-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${bills.length}bills.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
