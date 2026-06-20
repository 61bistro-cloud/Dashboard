-- Running balance per row — used to dedupe re-imports of overlapping
-- statement date ranges. Nullable; manual entries leave it empty.
ALTER TABLE "BankTransaction" ADD COLUMN "balanceAfter" DOUBLE PRECISION;
