-- CreateTable
CREATE TABLE "Slip" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "imageData" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "fileName" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "extractStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractError" TEXT,
    "amount" DOUBLE PRECISION,
    "transferAt" TIMESTAMP(3),
    "senderName" TEXT,
    "receiverName" TEXT,
    "bankName" TEXT,
    "ref" TEXT,
    "confidence" DOUBLE PRECISION,
    "rawText" TEXT,
    "accountId" INTEGER,
    "matchedTxId" INTEGER,
    "suggestedCategoryId" INTEGER,
    "uploadedByName" TEXT,
    "confirmedByName" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Slip_businessId_contentHash_key" ON "Slip"("businessId", "contentHash");

-- CreateIndex
CREATE INDEX "Slip_businessId_status_idx" ON "Slip"("businessId", "status");

-- CreateIndex
CREATE INDEX "Slip_matchedTxId_idx" ON "Slip"("matchedTxId");

-- CreateIndex
CREATE INDEX "Slip_accountId_idx" ON "Slip"("accountId");

-- AddForeignKey
ALTER TABLE "Slip" ADD CONSTRAINT "Slip_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slip" ADD CONSTRAINT "Slip_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slip" ADD CONSTRAINT "Slip_matchedTxId_fkey" FOREIGN KEY ("matchedTxId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
