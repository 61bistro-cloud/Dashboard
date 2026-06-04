-- ════════════════════════════════════════════════════════════════════
--  Multi-business (multi-tenant) migration
--  - New Business + UserBusiness tables
--  - businessId on every master + transactional table
--  - All existing data backfilled to business #1 (61 Bistro)
--  - Per-business unique constraints
-- ════════════════════════════════════════════════════════════════════

-- ── Business ──
CREATE TABLE "Business" (
  "id"        SERIAL       NOT NULL,
  "name"      TEXT         NOT NULL,
  "slug"      TEXT         NOT NULL,
  "active"    BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder" INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- Seed business #1 — all existing data belongs here. Additional businesses
-- are created by the owner via the management UI (which seeds their default
-- bank accounts + transaction categories).
INSERT INTO "Business" ("id", "name", "slug", "active", "sortOrder", "createdAt")
VALUES (1, '61 Bistro', '61-bistro', true, 0, CURRENT_TIMESTAMP);
SELECT setval('"Business_id_seq"', 1, true);

-- ── UserBusiness (per-user access) ──
CREATE TABLE "UserBusiness" (
  "id"         SERIAL  NOT NULL,
  "userId"     TEXT    NOT NULL,
  "businessId" INTEGER NOT NULL,
  CONSTRAINT "UserBusiness_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserBusiness_userId_businessId_key" ON "UserBusiness"("userId", "businessId");
ALTER TABLE "UserBusiness" ADD CONSTRAINT "UserBusiness_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBusiness" ADD CONSTRAINT "UserBusiness_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════ Add businessId to every data table (backfill → 1) ════════════

-- Employee
ALTER TABLE "Employee" ADD COLUMN "businessId" INTEGER;
UPDATE "Employee" SET "businessId" = 1;
ALTER TABLE "Employee" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Employee_businessId_idx" ON "Employee"("businessId");

-- EmployeePayroll
ALTER TABLE "EmployeePayroll" ADD COLUMN "businessId" INTEGER;
UPDATE "EmployeePayroll" SET "businessId" = 1;
ALTER TABLE "EmployeePayroll" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "EmployeePayroll" ADD CONSTRAINT "EmployeePayroll_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "EmployeePayroll_businessId_fiscalMonthId_idx" ON "EmployeePayroll"("businessId", "fiscalMonthId");

-- PayrollExtra (unique must include businessId now)
ALTER TABLE "PayrollExtra" ADD COLUMN "businessId" INTEGER;
UPDATE "PayrollExtra" SET "businessId" = 1;
ALTER TABLE "PayrollExtra" ALTER COLUMN "businessId" SET NOT NULL;
DROP INDEX "PayrollExtra_fiscalMonthId_type_key";
CREATE UNIQUE INDEX "PayrollExtra_businessId_fiscalMonthId_type_key" ON "PayrollExtra"("businessId", "fiscalMonthId", "type");
ALTER TABLE "PayrollExtra" ADD CONSTRAINT "PayrollExtra_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PayrollExtra_businessId_fiscalMonthId_idx" ON "PayrollExtra"("businessId", "fiscalMonthId");

-- Supplier (unique becomes businessId+category+name)
ALTER TABLE "Supplier" ADD COLUMN "businessId" INTEGER;
UPDATE "Supplier" SET "businessId" = 1;
ALTER TABLE "Supplier" ALTER COLUMN "businessId" SET NOT NULL;
DROP INDEX "Supplier_category_name_key";
CREATE UNIQUE INDEX "Supplier_businessId_category_name_key" ON "Supplier"("businessId", "category", "name");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Supplier_businessId_idx" ON "Supplier"("businessId");

-- SupplierPurchase
ALTER TABLE "SupplierPurchase" ADD COLUMN "businessId" INTEGER;
UPDATE "SupplierPurchase" SET "businessId" = 1;
ALTER TABLE "SupplierPurchase" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SupplierPurchase_businessId_fiscalMonthId_idx" ON "SupplierPurchase"("businessId", "fiscalMonthId");

-- FixedCostCategory (unique becomes businessId+name)
ALTER TABLE "FixedCostCategory" ADD COLUMN "businessId" INTEGER;
UPDATE "FixedCostCategory" SET "businessId" = 1;
ALTER TABLE "FixedCostCategory" ALTER COLUMN "businessId" SET NOT NULL;
DROP INDEX "FixedCostCategory_name_key";
CREATE UNIQUE INDEX "FixedCostCategory_businessId_name_key" ON "FixedCostCategory"("businessId", "name");
ALTER TABLE "FixedCostCategory" ADD CONSTRAINT "FixedCostCategory_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FixedCostCategory_businessId_idx" ON "FixedCostCategory"("businessId");

-- FixedCost
ALTER TABLE "FixedCost" ADD COLUMN "businessId" INTEGER;
UPDATE "FixedCost" SET "businessId" = 1;
ALTER TABLE "FixedCost" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "FixedCost" ADD CONSTRAINT "FixedCost_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FixedCost_businessId_fiscalMonthId_idx" ON "FixedCost"("businessId", "fiscalMonthId");

-- MonthlyRevenueOverride (was unique on fiscalMonthId → businessId+fiscalMonthId)
ALTER TABLE "MonthlyRevenueOverride" ADD COLUMN "businessId" INTEGER;
UPDATE "MonthlyRevenueOverride" SET "businessId" = 1;
ALTER TABLE "MonthlyRevenueOverride" ALTER COLUMN "businessId" SET NOT NULL;
DROP INDEX "MonthlyRevenueOverride_fiscalMonthId_key";
CREATE UNIQUE INDEX "MonthlyRevenueOverride_businessId_fiscalMonthId_key" ON "MonthlyRevenueOverride"("businessId", "fiscalMonthId");
ALTER TABLE "MonthlyRevenueOverride" ADD CONSTRAINT "MonthlyRevenueOverride_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PosBill (composite PK businessId+id)
ALTER TABLE "PosBill" ADD COLUMN "businessId" INTEGER;
UPDATE "PosBill" SET "businessId" = 1;
ALTER TABLE "PosBill" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "PosBill" DROP CONSTRAINT "PosBill_pkey";
ALTER TABLE "PosBill" ADD CONSTRAINT "PosBill_pkey" PRIMARY KEY ("businessId", "id");
DROP INDEX "PosBill_paymentDate_idx";
DROP INDEX "PosBill_businessDate_idx";
CREATE INDEX "PosBill_businessId_businessDate_idx" ON "PosBill"("businessId", "businessDate");
CREATE INDEX "PosBill_businessId_paymentDate_idx" ON "PosBill"("businessId", "paymentDate");
ALTER TABLE "PosBill" ADD CONSTRAINT "PosBill_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PosImportBatch
ALTER TABLE "PosImportBatch" ADD COLUMN "businessId" INTEGER;
UPDATE "PosImportBatch" SET "businessId" = 1;
ALTER TABLE "PosImportBatch" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "PosImportBatch" ADD CONSTRAINT "PosImportBatch_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PosImportBatch_businessId_idx" ON "PosImportBatch"("businessId");

-- BankAccount (unique becomes businessId+code)
ALTER TABLE "BankAccount" ADD COLUMN "businessId" INTEGER;
UPDATE "BankAccount" SET "businessId" = 1;
ALTER TABLE "BankAccount" ALTER COLUMN "businessId" SET NOT NULL;
DROP INDEX "BankAccount_code_key";
CREATE UNIQUE INDEX "BankAccount_businessId_code_key" ON "BankAccount"("businessId", "code");
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BankAccount_businessId_idx" ON "BankAccount"("businessId");

-- AccountOpening
ALTER TABLE "AccountOpening" ADD COLUMN "businessId" INTEGER;
UPDATE "AccountOpening" SET "businessId" = 1;
ALTER TABLE "AccountOpening" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "AccountOpening" ADD CONSTRAINT "AccountOpening_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AccountOpening_businessId_fiscalMonthId_idx" ON "AccountOpening"("businessId", "fiscalMonthId");

-- TransactionCategory (unique becomes businessId+name)
ALTER TABLE "TransactionCategory" ADD COLUMN "businessId" INTEGER;
UPDATE "TransactionCategory" SET "businessId" = 1;
ALTER TABLE "TransactionCategory" ALTER COLUMN "businessId" SET NOT NULL;
DROP INDEX "TransactionCategory_name_key";
CREATE UNIQUE INDEX "TransactionCategory_businessId_name_key" ON "TransactionCategory"("businessId", "name");
ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TransactionCategory_businessId_idx" ON "TransactionCategory"("businessId");

-- BankTransaction
ALTER TABLE "BankTransaction" ADD COLUMN "businessId" INTEGER;
UPDATE "BankTransaction" SET "businessId" = 1;
ALTER TABLE "BankTransaction" ALTER COLUMN "businessId" SET NOT NULL;
DROP INDEX "BankTransaction_fiscalMonthId_accountId_date_idx";
CREATE INDEX "BankTransaction_businessId_fiscalMonthId_accountId_date_idx" ON "BankTransaction"("businessId", "fiscalMonthId", "accountId", "date");
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
