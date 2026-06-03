-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ACCOUNTANT', 'STAFF');

-- CreateEnum
CREATE TYPE "PayrollExtraType" AS ENUM ('OT', 'BONUS', 'EXTRA', 'SERVICE_CHARGE');

-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('FOOD', 'BEVERAGE', 'PACKAGING');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" SERIAL NOT NULL,
    "yearBE" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalMonth" (
    "id" SERIAL NOT NULL,
    "yearId" INTEGER NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "calendarYear" INTEGER NOT NULL,
    "calendarMonth" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "fullLabel" TEXT NOT NULL,
    "daysInMonth" INTEGER NOT NULL,

    CONSTRAINT "FiscalMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "shift" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayroll" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "fiscalMonthId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EmployeePayroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollExtra" (
    "id" SERIAL NOT NULL,
    "fiscalMonthId" INTEGER NOT NULL,
    "type" "PayrollExtraType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PayrollExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupplierCategory" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPurchase" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "fiscalMonthId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SupplierPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedCostCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FixedCostCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedCost" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "fiscalMonthId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FixedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyRevenueOverride" (
    "id" SERIAL NOT NULL,
    "fiscalMonthId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "MonthlyRevenueOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosBill" (
    "id" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paymentDate" TEXT NOT NULL,
    "posId" TEXT,
    "invoiceNo" TEXT,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "itemDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voucherAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voucherDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roundingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tip" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderType" TEXT,
    "paymentType" TEXT,
    "paymentMethod" TEXT,
    "channel" TEXT,
    "tableNo" TEXT,
    "customerCount" INTEGER,
    "customerName" TEXT,
    "note" TEXT,
    "promotionType" TEXT,
    "promotionCode" TEXT,
    "openedBy" TEXT,
    "closedBy" TEXT,
    "branch" TEXT,
    "lineManAdjustDate" TEXT,
    "lineManAdjustAmt" DOUBLE PRECISION DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importBatchId" INTEGER,

    CONSTRAINT "PosBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosImportBatch" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsErrored" INTEGER NOT NULL DEFAULT 0,
    "errorSample" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "PosImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountOpening" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "fiscalMonthId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AccountOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "posChannel" TEXT,

    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" SERIAL NOT NULL,
    "fiscalMonthId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "deposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withdraw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channel" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_yearBE_key" ON "FiscalYear"("yearBE");

-- CreateIndex
CREATE INDEX "FiscalMonth_calendarYear_calendarMonth_idx" ON "FiscalMonth"("calendarYear", "calendarMonth");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalMonth_yearId_monthIndex_key" ON "FiscalMonth"("yearId", "monthIndex");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayroll_employeeId_fiscalMonthId_key" ON "EmployeePayroll"("employeeId", "fiscalMonthId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollExtra_fiscalMonthId_type_key" ON "PayrollExtra"("fiscalMonthId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_category_name_key" ON "Supplier"("category", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPurchase_supplierId_fiscalMonthId_key" ON "SupplierPurchase"("supplierId", "fiscalMonthId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedCostCategory_name_key" ON "FixedCostCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FixedCost_categoryId_fiscalMonthId_key" ON "FixedCost"("categoryId", "fiscalMonthId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRevenueOverride_fiscalMonthId_key" ON "MonthlyRevenueOverride"("fiscalMonthId");

-- CreateIndex
CREATE INDEX "PosBill_paymentDate_idx" ON "PosBill"("paymentDate");

-- CreateIndex
CREATE INDEX "PosBill_paidAt_idx" ON "PosBill"("paidAt");

-- CreateIndex
CREATE INDEX "PosBill_paymentType_idx" ON "PosBill"("paymentType");

-- CreateIndex
CREATE INDEX "PosBill_channel_idx" ON "PosBill"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_code_key" ON "BankAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AccountOpening_accountId_fiscalMonthId_key" ON "AccountOpening"("accountId", "fiscalMonthId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCategory_name_key" ON "TransactionCategory"("name");

-- CreateIndex
CREATE INDEX "BankTransaction_fiscalMonthId_accountId_date_idx" ON "BankTransaction"("fiscalMonthId", "accountId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_categoryId_idx" ON "BankTransaction"("categoryId");

-- AddForeignKey
ALTER TABLE "FiscalMonth" ADD CONSTRAINT "FiscalMonth_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayroll" ADD CONSTRAINT "EmployeePayroll_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayroll" ADD CONSTRAINT "EmployeePayroll_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExtra" ADD CONSTRAINT "PayrollExtra_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedCost" ADD CONSTRAINT "FixedCost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FixedCostCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedCost" ADD CONSTRAINT "FixedCost_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyRevenueOverride" ADD CONSTRAINT "MonthlyRevenueOverride_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosBill" ADD CONSTRAINT "PosBill_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "PosImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosImportBatch" ADD CONSTRAINT "PosImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpening" ADD CONSTRAINT "AccountOpening_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOpening" ADD CONSTRAINT "AccountOpening_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
