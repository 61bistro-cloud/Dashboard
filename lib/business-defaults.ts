import { prisma } from "@/lib/prisma";

/** Default bank accounts every new business starts with. */
const DEFAULT_BANK_ACCOUNTS = [
  {
    code: "KBANK",
    name: "ธนาคารกสิกรไทย",
    icon: "🟢",
    color: "emerald",
    accountType: "BANK",
  },
  {
    code: "SCB",
    name: "ไทยพาณิชย์",
    icon: "🟣",
    color: "purple",
    accountType: "BANK",
  },
  {
    code: "CASH",
    name: "เงินสด",
    icon: "💵",
    color: "slate",
    accountType: "BANK",
  },
  {
    code: "KBANK_CREDIT",
    name: "KBANK Master Card",
    icon: "💳",
    color: "amber",
    accountType: "CREDIT_CARD",
  },
];

/** Default transaction categories every new business starts with. */
const DEFAULT_TX_CATEGORIES: Array<{
  name: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER";
  posChannel?: string;
}> = [
  { name: "💰 รายรับ - โอนรับ/ยอดขาย", kind: "INCOME" },
  {
    name: "💳 Platform - EDC/MYQR",
    kind: "INCOME",
    posChannel: "EDC_PROMPTPAY",
  },
  { name: "💰 รายรับ - ฝากเงินสด", kind: "INCOME", posChannel: "CASH" },
  { name: "💰 รายรับ - เพิ่มเงินบริหาร", kind: "INCOME" },
  { name: "💰 รายรับ - อื่นๆ", kind: "INCOME" },
  { name: "🛵 รายรับ - Grab", kind: "INCOME", posChannel: "GRAB" },
  { name: "🟢 รายรับ - LINE MAN", kind: "INCOME", posChannel: "LINEMAN" },
  { name: "🥩 ต้นทุน - วัตถุดิบอาหาร", kind: "EXPENSE" },
  { name: "🍹 ต้นทุน - วัตถุดิบเครื่องดื่ม", kind: "EXPENSE" },
  { name: "📦 ต้นทุน - แพ็คเกจจิ้ง", kind: "EXPENSE" },
  { name: "🛒 ต้นทุน - ซื้อสินค้า/จัดซื้อ", kind: "EXPENSE" },
  { name: "👥 เงินเดือนพนักงาน", kind: "EXPENSE" },
  { name: "👥 ค่าจ้าง/OT/พิเศษ", kind: "EXPENSE" },
  { name: "💊 เบิกล่วงหน้าพนักงาน", kind: "EXPENSE" },
  { name: "🏠 ค่าเช่า", kind: "EXPENSE" },
  { name: "⚡ ค่าสาธารณูปโภค (ไฟ/น้ำ)", kind: "EXPENSE" },
  { name: "🌐 ค่าอินเตอร์เน็ต/โทรศัพท์", kind: "EXPENSE" },
  { name: "📱 Subscription & Software", kind: "EXPENSE" },
  { name: "🛵 Platform - Lineman/Grab GP", kind: "EXPENSE" },
  { name: "📣 Marketing & โฆษณา", kind: "EXPENSE" },
  { name: "🗂️ ค่าใช้จ่ายเบ็ดเตล็ด", kind: "EXPENSE" },
  { name: "👔 เบิกเงิน/โอนให้ผู้บริหาร", kind: "EXPENSE" },
  { name: "🔴 ชำระบัตรเครดิต", kind: "EXPENSE" },
  { name: "🔄 โอนระหว่างบัญชี", kind: "TRANSFER" },
  { name: "💵 ถอนเงินสด (ATM)", kind: "TRANSFER" },
  { name: "📅 ยกยอดเดือนก่อน", kind: "TRANSFER" },
];

/**
 * Seed the infrastructure a fresh business needs to be usable: bank accounts
 * + transaction categories. Idempotent — uses createMany with skipDuplicates.
 * Master data (employees / suppliers / fixed-cost categories) is intentionally
 * NOT seeded; the owner fills those in per business.
 */
export async function seedBusinessDefaults(businessId: number) {
  await prisma.bankAccount.createMany({
    data: DEFAULT_BANK_ACCOUNTS.map((a, i) => ({
      ...a,
      businessId,
      sortOrder: i,
      active: true,
    })),
    skipDuplicates: true,
  });

  await prisma.transactionCategory.createMany({
    data: DEFAULT_TX_CATEGORIES.map((c, i) => ({
      businessId,
      name: c.name,
      kind: c.kind,
      posChannel: c.posChannel ?? null,
      sortOrder: i,
      active: true,
    })),
    skipDuplicates: true,
  });
}
