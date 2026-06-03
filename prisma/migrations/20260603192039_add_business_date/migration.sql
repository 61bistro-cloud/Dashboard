-- AlterTable
ALTER TABLE "PosBill" ADD COLUMN     "businessDate" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "PosBill_businessDate_idx" ON "PosBill"("businessDate");

-- Backfill: business day = calendar day of paidAt, EXCEPT if paid before 04:00
-- it counts as the previous day (matches Foodstory dashboard grouping for late-
-- night bills that cross midnight). paidAt is stored as UTC encoding Thai local
-- time, so EXTRACT(HOUR) returns the Thai hour directly.
UPDATE "PosBill"
SET "businessDate" = TO_CHAR(
  CASE
    WHEN EXTRACT(HOUR FROM "paidAt") < 4 THEN "paidAt" - INTERVAL '1 day'
    ELSE "paidAt"
  END,
  'YYYY-MM-DD'
);
