-- CreateTable
CREATE TABLE "ReconItem" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "matchField" TEXT,
    "matchKeywords" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconEntry" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "reconItemId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "actual" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconItem_businessId_sortOrder_idx" ON "ReconItem"("businessId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ReconEntry_reconItemId_date_key" ON "ReconEntry"("reconItemId", "date");

-- CreateIndex
CREATE INDEX "ReconEntry_businessId_date_idx" ON "ReconEntry"("businessId", "date");

-- AddForeignKey
ALTER TABLE "ReconItem" ADD CONSTRAINT "ReconItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconEntry" ADD CONSTRAINT "ReconEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconEntry" ADD CONSTRAINT "ReconEntry_reconItemId_fkey" FOREIGN KEY ("reconItemId") REFERENCES "ReconItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
