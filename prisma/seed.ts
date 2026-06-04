import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const THAI_MONTH_LABELS = [
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
];

const THAI_MONTH_FULL = [
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
];

function daysIn(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

async function seedUsers() {
  const users = [
    {
      email: "owner@61bistro.local",
      name: "เจ้าของร้าน",
      password: "owner1234",
      role: "OWNER" as const,
    },
    {
      email: "accountant@61bistro.local",
      name: "บัญชี",
      password: "acct1234",
      role: "ACCOUNTANT" as const,
    },
    {
      email: "staff@61bistro.local",
      name: "พนักงาน",
      password: "staff1234",
      role: "STAFF" as const,
    },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
  }
  console.log(`✓ Users: ${users.length}`);
}

async function seedFiscalYear() {
  const yearBE = 2569; // Apr 2026 – Mar 2027
  const fy = await prisma.fiscalYear.upsert({
    where: { yearBE },
    update: {},
    create: {
      yearBE,
      label: `${yearBE} (เม.ย. 2026 – มี.ค. 2027)`,
    },
  });

  for (let i = 0; i < 12; i++) {
    const calendarYear = i < 9 ? 2026 : 2027;
    const calendarMonth = ((i + 3) % 12) + 1; // i=0 → 4 (Apr); i=9 → 1 (Jan)
    await prisma.fiscalMonth.upsert({
      where: { yearId_monthIndex: { yearId: fy.id, monthIndex: i + 1 } },
      update: {},
      create: {
        yearId: fy.id,
        monthIndex: i + 1,
        calendarYear,
        calendarMonth,
        label: THAI_MONTH_LABELS[i],
        fullLabel: `${THAI_MONTH_FULL[i]} ${yearBE}`,
        daysInMonth: daysIn(calendarYear, calendarMonth),
      },
    });
  }
  console.log(`✓ FiscalYear ${yearBE} + 12 months`);
  return fy.id;
}

const EMPLOYEES = [
  {
    name: "Max (System Operator) 12:00-21:00",
    shortName: "Max",
    shift: "12:00-21:00",
  },
  {
    name: "Som (Junior Head Chef) 10:30-19:30",
    shortName: "Som",
    shift: "10:30-19:30",
  },
  {
    name: "NEW (Kitchen Hand 1) 10:30-19:30",
    shortName: "NEW K1",
    shift: "10:30-19:30",
  },
  {
    name: "Ning (Service Barista) 10:30-19:30",
    shortName: "Ning",
    shift: "10:30-19:30",
  },
  { name: "พนักงานเพิ่ม #1", shortName: "Extra 1", shift: "" },
  {
    name: "Smart (Restaurant Manager) 17:00-02:00",
    shortName: "Smart",
    shift: "17:00-02:00",
  },
  {
    name: "NEW (Kitchen Hand 2) 17:00-02:00",
    shortName: "NEW K2",
    shift: "17:00-02:00",
  },
  { name: "NEW (Service)", shortName: "NEW Svc", shift: "" },
  { name: "พนักงานเพิ่ม #2", shortName: "Extra 2", shift: "" },
];

async function seedEmployees() {
  const ids: number[] = [];
  for (let i = 0; i < EMPLOYEES.length; i++) {
    const emp = EMPLOYEES[i];
    const e = await prisma.employee.upsert({
      where: { id: i + 1 },
      update: {
        name: emp.name,
        shortName: emp.shortName,
        shift: emp.shift,
        sortOrder: i,
      },
      create: {
        id: i + 1,
        name: emp.name,
        shortName: emp.shortName,
        shift: emp.shift,
        sortOrder: i,
        active: true,
      },
    });
    ids.push(e.id);
  }
  console.log(`✓ Employees: ${EMPLOYEES.length}`);
  return ids;
}

const SUPPLIERS: Array<{
  name: string;
  category: "FOOD" | "BEVERAGE" | "PACKAGING";
}> = [
  { name: "Food cost (Supplier ทั่วไป)", category: "FOOD" },
  { name: "Makro", category: "FOOD" },
  { name: "Freshket", category: "FOOD" },
  { name: "Salad", category: "FOOD" },
  { name: "Pizza Dough", category: "FOOD" },
  { name: "อื่นๆ", category: "FOOD" },
  { name: "Bev cost", category: "BEVERAGE" },
  { name: "จิ้ปาอ๊", category: "PACKAGING" },
  { name: "อื่นๆ", category: "PACKAGING" },
];

async function seedSuppliers() {
  for (let i = 0; i < SUPPLIERS.length; i++) {
    const s = SUPPLIERS[i];
    await prisma.supplier.upsert({
      where: { category_name: { category: s.category, name: s.name } },
      update: { sortOrder: i },
      create: {
        name: s.name,
        category: s.category,
        sortOrder: i,
        active: true,
      },
    });
  }
  console.log(`✓ Suppliers: ${SUPPLIERS.length}`);
}

const FIXED_CATS = [
  { name: "ค่าเช่า", icon: "🏠" },
  { name: "ค่าไฟ + น้ำ", icon: "⚡" },
  { name: "ค่าส่วนกลาง", icon: "🏢" },
  { name: "อินเทอร์เน็ต / โทรศัพท์", icon: "🌐" },
  { name: "Subscriptions (Monomax/Canva/etc)", icon: "📱" },
  { name: "Platform GP (Lineman/Grab/Wokboy)", icon: "🛵" },
  { name: "Marketing / โฆษณา", icon: "📣" },
  { name: "ซื้อของเข้าร้าน / Office", icon: "🛒" },
  { name: "ค่าใช้จ่ายเบ็ดเตล็ด", icon: "🗂️" },
];

async function seedFixedCategories() {
  for (let i = 0; i < FIXED_CATS.length; i++) {
    const c = FIXED_CATS[i];
    await prisma.fixedCostCategory.upsert({
      where: { name: c.name },
      update: { icon: c.icon, sortOrder: i },
      create: { name: c.name, icon: c.icon, sortOrder: i, active: true },
    });
  }
  console.log(`✓ FixedCostCategories: ${FIXED_CATS.length}`);
}

async function seedHistoricalData(employeeIds: number[]) {
  const fy = await prisma.fiscalYear.findUniqueOrThrow({
    where: { yearBE: 2569 },
  });
  const months = await prisma.fiscalMonth.findMany({
    where: { yearId: fy.id },
    orderBy: { monthIndex: "asc" },
  });
  const apr = months[0].id;
  const may = months[1].id;
  const jun = months[2].id;

  // Payroll: เม.ย. / พ.ค. / มิ.ย.
  // index in EMPLOYEES array → [apr, may, jun] amount
  const payroll: Record<number, [number, number, number]> = {
    0: [25000, 25000, 8000], // Max
    1: [12000, 13000, 15000], // Som
    2: [1200, 8000, 12000], // NEW K1
    3: [12000, 7893.33, 12000], // Ning
    4: [10000, 0, 0], // Extra 1 (slot 6 in Excel)
    5: [18000, 18000, 18000], // Smart
    6: [8000, 10000, 10000], // NEW K2
    7: [3453.33, 12000, 12000], // NEW Service
    8: [0, 0, 0], // Extra 2
  };

  for (const [idxStr, [a, m, j]] of Object.entries(payroll)) {
    const employeeId = employeeIds[Number(idxStr)];
    const rows: Array<[number, number]> = [
      [apr, a],
      [may, m],
      [jun, j],
    ];
    for (const [fiscalMonthId, amount] of rows) {
      if (amount === 0) continue;
      await prisma.employeePayroll.upsert({
        where: { employeeId_fiscalMonthId: { employeeId, fiscalMonthId } },
        update: { amount },
        create: { employeeId, fiscalMonthId, amount },
      });
    }
  }

  // Payroll extras: OT / Service Charge 3% (เม.ย./พ.ค.)
  const extras: Array<[number, "OT" | "SERVICE_CHARGE", number]> = [
    [apr, "OT", 120],
    [apr, "SERVICE_CHARGE", 5052.83],
    [may, "SERVICE_CHARGE", 4884],
  ];
  for (const [fiscalMonthId, type, amount] of extras) {
    await prisma.payrollExtra.upsert({
      where: { fiscalMonthId_type: { fiscalMonthId, type } },
      update: { amount },
      create: { fiscalMonthId, type, amount },
    });
  }

  // Suppliers: load by name, then seed purchases
  const supplierAmounts: Array<{
    name: string;
    category: "FOOD" | "BEVERAGE" | "PACKAGING";
    apr: number;
    may: number;
  }> = [
    {
      name: "Food cost (Supplier ทั่วไป)",
      category: "FOOD",
      apr: 56772.17,
      may: 73229.25,
    },
    { name: "Makro", category: "FOOD", apr: 15975.19, may: 8000 },
    { name: "Freshket", category: "FOOD", apr: 1865.01, may: 2500 },
    { name: "Salad", category: "FOOD", apr: 200, may: 300 },
    { name: "Pizza Dough", category: "FOOD", apr: 270, may: 1041.54 },
    { name: "Bev cost", category: "BEVERAGE", apr: 1150, may: 8515.21 },
    { name: "จิ้ปาอ๊", category: "PACKAGING", apr: 0, may: 2011 },
  ];
  for (const s of supplierAmounts) {
    const supp = await prisma.supplier.findUniqueOrThrow({
      where: { category_name: { category: s.category, name: s.name } },
    });
    for (const [fiscalMonthId, amount] of [
      [apr, s.apr],
      [may, s.may],
    ] as const) {
      if (amount === 0) continue;
      await prisma.supplierPurchase.upsert({
        where: {
          supplierId_fiscalMonthId: { supplierId: supp.id, fiscalMonthId },
        },
        update: { amount },
        create: { supplierId: supp.id, fiscalMonthId, amount },
      });
    }
  }

  // Fixed costs
  const fixedAmounts: Array<{ name: string; apr: number; may: number }> = [
    { name: "ค่าเช่า", apr: 0, may: 7500 },
    { name: "ค่าไฟ + น้ำ", apr: 23347.06, may: 24850.34 },
    { name: "อินเทอร์เน็ต / โทรศัพท์", apr: 0, may: 2428.86 },
    { name: "Subscriptions (Monomax/Canva/etc)", apr: 299, may: 0 },
    { name: "Marketing / โฆษณา", apr: 0, may: 300 },
    { name: "ซื้อของเข้าร้าน / Office", apr: 7626, may: 2896.68 },
    { name: "ค่าใช้จ่ายเบ็ดเตล็ด", apr: 107, may: 6584 },
  ];
  for (const f of fixedAmounts) {
    const cat = await prisma.fixedCostCategory.findUniqueOrThrow({
      where: { name: f.name },
    });
    for (const [fiscalMonthId, amount] of [
      [apr, f.apr],
      [may, f.may],
    ] as const) {
      if (amount === 0) continue;
      await prisma.fixedCost.upsert({
        where: {
          categoryId_fiscalMonthId: { categoryId: cat.id, fiscalMonthId },
        },
        update: { amount },
        create: { categoryId: cat.id, fiscalMonthId, amount },
      });
    }
  }

  // Revenue override: เม.ย. = 149,441 (no POS yet for April)
  await prisma.monthlyRevenueOverride.upsert({
    where: { fiscalMonthId: apr },
    update: {
      amount: 149441,
      note: "Manual จาก Excel เดิม (ยังไม่มี POS เมษายน)",
    },
    create: {
      fiscalMonthId: apr,
      amount: 149441,
      note: "Manual จาก Excel เดิม (ยังไม่มี POS เมษายน)",
    },
  });

  console.log(
    `✓ Historical data: Apr/May/Jun payroll, suppliers, fixed, override`
  );
}

const BANK_ACCOUNTS = [
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

const TX_CATEGORIES: Array<{
  name: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER";
  posChannel?: string;
}> = [
  // INCOME
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

  // EXPENSE (linked to Cost Setup)
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

  // TRANSFER (not P&L)
  { name: "🔄 โอนระหว่างบัญชี", kind: "TRANSFER" },
  { name: "💵 ถอนเงินสด (ATM)", kind: "TRANSFER" },
  { name: "📅 ยกยอดเดือนก่อน", kind: "TRANSFER" },
];

async function seedBank() {
  for (let i = 0; i < BANK_ACCOUNTS.length; i++) {
    const a = BANK_ACCOUNTS[i];
    await prisma.bankAccount.upsert({
      where: { code: a.code },
      update: {
        name: a.name,
        icon: a.icon,
        color: a.color,
        accountType: a.accountType,
        sortOrder: i,
      },
      create: { ...a, sortOrder: i, active: true },
    });
  }
  console.log(`✓ BankAccounts: ${BANK_ACCOUNTS.length}`);

  for (let i = 0; i < TX_CATEGORIES.length; i++) {
    const c = TX_CATEGORIES[i];
    await prisma.transactionCategory.upsert({
      where: { name: c.name },
      update: { kind: c.kind, sortOrder: i, posChannel: c.posChannel ?? null },
      create: {
        name: c.name,
        kind: c.kind,
        sortOrder: i,
        active: true,
        posChannel: c.posChannel ?? null,
      },
    });
  }
  console.log(`✓ TransactionCategories: ${TX_CATEGORIES.length}`);

  // Seed opening balances for เม.ย./พ.ค./มิ.ย. — values from Excel header
  const months = await prisma.fiscalMonth.findMany({
    where: { year: { yearBE: 2569 } },
    orderBy: { monthIndex: "asc" },
    take: 3,
  });
  const accountByCode = new Map(
    (await prisma.bankAccount.findMany()).map((a) => [a.code, a])
  );

  const openings: Array<[string, number, number]> = [
    // [code, monthIndex 0-2, amount]
    ["KBANK", 0, 11240.26],
    ["SCB", 0, 6684.14],
    ["KBANK", 1, 255.99],
    ["SCB", 1, 14288.09],
    ["KBANK", 2, 6091.26],
  ];
  for (const [code, idx, amount] of openings) {
    const acc = accountByCode.get(code);
    const month = months[idx];
    if (!acc || !month) continue;
    await prisma.accountOpening.upsert({
      where: {
        accountId_fiscalMonthId: { accountId: acc.id, fiscalMonthId: month.id },
      },
      update: { amount },
      create: { accountId: acc.id, fiscalMonthId: month.id, amount },
    });
  }
  console.log(`✓ Account openings: ${openings.length}`);

  // Sample 6 transactions for เม.ย. to demo the flow
  const kbank = accountByCode.get("KBANK")!;
  const apr = months[0];
  const catByName = new Map(
    (await prisma.transactionCategory.findMany()).map((c) => [c.name, c])
  );

  const sampleTx: Array<{
    date: string;
    desc: string;
    deposit?: number;
    withdraw?: number;
    channel?: string;
    catName: string;
  }> = [
    {
      date: "2026-04-01",
      desc: "ยอดยกมา เมษายน 2569",
      deposit: 0,
      catName: "📅 ยกยอดเดือนก่อน",
    },
    {
      date: "2026-04-01",
      desc: "โอนเงิน → วงศพัทธ์ ดันตี (Makro)",
      withdraw: 1810.82,
      channel: "K PLUS",
      catName: "🥩 ต้นทุน - วัตถุดิบอาหาร",
    },
    {
      date: "2026-04-01",
      desc: "รับโอนจาก คณิน โรจน์พงษ์",
      deposit: 2000,
      channel: "K PLUS",
      catName: "💰 รายรับ - เพิ่มเงินบริหาร",
    },
    {
      date: "2026-04-01",
      desc: "รับเงินจากการขาย Foodstory",
      deposit: 652.79,
      channel: "EDC",
      catName: "💳 Platform - EDC/MYQR",
    },
    {
      date: "2026-04-02",
      desc: "ถอนเงินสด ATM",
      withdraw: 4500,
      channel: "ATM",
      catName: "💵 ถอนเงินสด (ATM)",
    },
    {
      date: "2026-04-02",
      desc: "รับเงินจากการขาย Foodstory",
      deposit: 2606.14,
      channel: "EDC",
      catName: "💳 Platform - EDC/MYQR",
    },
  ];

  // delete existing samples first (idempotent seed)
  await prisma.bankTransaction.deleteMany({
    where: { fiscalMonthId: apr.id, accountId: kbank.id },
  });

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  for (const t of sampleTx) {
    const cat = catByName.get(t.catName);
    await prisma.bankTransaction.create({
      data: {
        fiscalMonthId: apr.id,
        accountId: kbank.id,
        categoryId: cat?.id,
        date: new Date(t.date + "T00:00:00Z"),
        description: t.desc,
        deposit: t.deposit ?? 0,
        withdraw: t.withdraw ?? 0,
        channel: t.channel ?? null,
        createdById: owner?.id ?? null,
      },
    });
  }
  console.log(`✓ Sample transactions: ${sampleTx.length}`);
}

async function main() {
  await seedUsers();
  await seedFiscalYear();
  const employeeIds = await seedEmployees();
  await seedSuppliers();
  await seedFixedCategories();
  await seedHistoricalData(employeeIds);
  await seedBank();
  console.log("✅ Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
