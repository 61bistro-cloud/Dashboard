// Synthetic store and transaction identifiers only.
const headers = [
  "ชื่อร้าน",
  "Merchant ID",
  "ชื่อร้าน",
  "รหัสร้านค้า",
  "วันที่สร้าง",
  "ประเภท",
  "หมวดหมู่",
  "สถานะ",
  "Transaction ID",
  "รหัสคำสั่งซื้อยาว",
  "รหัสคำสั่งซื้อสั้น",
  "รหัสการจอง",
  "ประเภทคำสั่งซื้อ",
  "วิธีการชำระเงิน",
  "รหัสการทำรายการ",
  "วันที่โอน",
  "ยอดขายสุทธิ",
  "ค่าคอมมิชชันแพลตฟอร์ม",
  "ทั้งหมด",
  "ภาษีค่าคอมมิชชัน, การปรับรายได้, โฆษณา GrabFood / GrabMart",
];
export const fixtureRow = [
  "Proprietor",
  "merchant-1",
  "Store, Demo",
  "store-1",
  "31 Oct 2026 3:05 PM",
  "GrabFood",
  "ชำระเงิน",
  "โอนแล้ว",
  "tx-long-1",
  "order-long-1",
  "GF-001",
  "booking-1",
  "Auto-Paid",
  "เงินสด",
  "settlement-1",
  "1 Nov 2026 3:29 AM",
  "208",
  "-44.51",
  "163.49",
  "-2.91",
];
export const fixtureCsv = (rows: string[][] = [fixtureRow]) =>
  "\uFEFF" +
  [headers, ...rows]
    .map((row) => row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","))
    .join("\r\n");
