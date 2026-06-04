-- Per-month name overrides — allow editing employee/supplier display name
-- for THIS month only without touching the global record or other months.

ALTER TABLE "EmployeePayroll" ADD COLUMN "nameOverride" TEXT;
ALTER TABLE "SupplierPurchase" ADD COLUMN "nameOverride" TEXT;
