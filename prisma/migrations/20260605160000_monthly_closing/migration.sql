-- Monthly P&L closing (ปิดงบรายเดือน): snapshot + adjustments + audit log.
CREATE TABLE "MonthlyClosing" (
  "id"            SERIAL  NOT NULL,
  "businessId"    INTEGER NOT NULL,
  "fiscalMonthId" INTEGER NOT NULL,
  "status"        TEXT    NOT NULL DEFAULT 'CLOSED',
  "netRevenue"    DOUBLE PRECISION NOT NULL,
  "posBillCount"  INTEGER NOT NULL DEFAULT 0,
  "food"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bev"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pack"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cogs"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "laborBase"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "laborExtra"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "labor"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fixed"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalCost"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netProfit"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "marginPct"     DOUBLE PRECISION,
  "note"          TEXT,
  "closedById"    TEXT,
  "closedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonthlyClosing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MonthlyClosing_businessId_fiscalMonthId_key" ON "MonthlyClosing"("businessId", "fiscalMonthId");

CREATE TABLE "ClosingAdjustment" (
  "id"        SERIAL  NOT NULL,
  "closingId" INTEGER NOT NULL,
  "kind"      TEXT    NOT NULL,
  "label"     TEXT    NOT NULL,
  "amount"    DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClosingAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosingAdjustment_closingId_idx" ON "ClosingAdjustment"("closingId");

CREATE TABLE "ClosingLog" (
  "id"        SERIAL  NOT NULL,
  "closingId" INTEGER NOT NULL,
  "action"    TEXT    NOT NULL,
  "detail"    TEXT,
  "byUserId"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClosingLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosingLog_closingId_idx" ON "ClosingLog"("closingId");

ALTER TABLE "MonthlyClosing" ADD CONSTRAINT "MonthlyClosing_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthlyClosing" ADD CONSTRAINT "MonthlyClosing_fiscalMonthId_fkey" FOREIGN KEY ("fiscalMonthId") REFERENCES "FiscalMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyClosing" ADD CONSTRAINT "MonthlyClosing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClosingAdjustment" ADD CONSTRAINT "ClosingAdjustment_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "MonthlyClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClosingLog" ADD CONSTRAINT "ClosingLog_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "MonthlyClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
