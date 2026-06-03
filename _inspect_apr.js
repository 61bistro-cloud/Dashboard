const XLSX = require("xlsx");
const wb = XLSX.readFile(process.argv[2]);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

let h = 0;
for (let i = 0; i < 10; i++) {
  const r = (rows[i] || []).map((c) => String(c ?? "")).join("|");
  if (r.includes("วันที่ชำระเงิน") && r.includes("หมายเลขใบเสร็จ")) {
    h = i;
    break;
  }
}

const headers = rows[h] || [];
console.log("Header row:", h, "| Columns:", headers.length);

// Find key column indexes
const findCol = (re) => headers.findIndex((c) => re.test(String(c)));
const idxId = findCol(/หมายเลขใบเสร็จ/);
const idxGross = findCol(/^ยอดก่อนลด$/);
const idxItemDisc = findCol(/^ส่วนลดสินค้า$/);
const idxBillDisc = findCol(/^ส่วนลดบิล$/);
const idxTotal = findCol(/^ยอดรวม(\s|$)/);
const idxService = findCol(/^ค่าบริการ$/);
const idxVat = findCol(/^ภาษี$/);
const idxRound = findCol(/^ยอดปัดเศษ$/);
const idxGrand = findCol(/^รวมสุทธิ(\s|\(|$)/);
const idxRefund = findCol(/^คืนเงิน$/);

console.log("Col indexes:", {
  id: idxId,
  gross: idxGross,
  itemDisc: idxItemDisc,
  billDisc: idxBillDisc,
  total: idxTotal,
  service: idxService,
  vat: idxVat,
  round: idxRound,
  grand: idxGrand,
  refund: idxRefund,
});

// Aggregate
let billCount = 0;
let activeCount = 0;
let cancelledCount = 0;
let sumGross = 0,
  sumDisc = 0,
  sumTotal = 0,
  sumService = 0,
  sumVat = 0,
  sumRound = 0,
  sumGrand = 0,
  sumRefund = 0;
const cancelled = [];
const ambiguous = [];
for (let i = h + 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[idxId]) continue;
  billCount++;
  const num = (x) =>
    x == null || x === "" || x === "-"
      ? 0
      : Number(String(x).replace(/,/g, "")) || 0;
  const gross = num(r[idxGross]);
  const itemDisc = num(r[idxItemDisc]);
  const billDisc = num(r[idxBillDisc]);
  const total = num(r[idxTotal]);
  const service = num(r[idxService]);
  const vat = num(r[idxVat]);
  const round = num(r[idxRound]);
  const grand = num(r[idxGrand]);
  const refund = num(r[idxRefund]);

  sumGross += gross;
  sumDisc += itemDisc + billDisc;
  sumTotal += total;
  sumService += service;
  sumVat += vat;
  sumRound += round;
  sumGrand += grand;
  sumRefund += refund;

  if (grand > 0) {
    activeCount++;
  } else {
    cancelledCount++;
    if (cancelled.length < 5)
      cancelled.push({
        id: r[idxId],
        gross,
        disc: itemDisc + billDisc,
        total,
        grand,
        refund,
        promo: r[34],
      });
  }
}

console.log("\n=== TOTALS ===");
console.log("Bills total:", billCount);
console.log("Active (grand>0):", activeCount);
console.log("Cancelled (grand=0):", cancelledCount);
console.log("Sum gross:", sumGross.toFixed(2));
console.log("Sum disc:", sumDisc.toFixed(2));
console.log("Sum total:", sumTotal.toFixed(2));
console.log("Sum service:", sumService.toFixed(2));
console.log("Sum vat:", sumVat.toFixed(2));
console.log("Sum rounding:", sumRound.toFixed(2));
console.log("Sum grandTotal:", sumGrand.toFixed(2));
console.log("Sum refund:", sumRefund.toFixed(2));

console.log("\n=== Foodstory dashboard says ===");
console.log("ยอดขายสุทธิ: 190,355");
console.log("Active bills: 383");

console.log("\n=== Sample cancelled bills ===");
cancelled.forEach((c) => console.log(JSON.stringify(c)));
