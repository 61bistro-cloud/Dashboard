-- Business: Google Drive/Sheets connection
ALTER TABLE "Business" ADD COLUMN "googleRefreshToken" TEXT;
ALTER TABLE "Business" ADD COLUMN "googleEmail" TEXT;
ALTER TABLE "Business" ADD COLUMN "driveRootFolderId" TEXT;
ALTER TABLE "Business" ADD COLUMN "driveSlipFolderId" TEXT;
ALTER TABLE "Business" ADD COLUMN "driveBillFolderId" TEXT;
ALTER TABLE "Business" ADD COLUMN "masterSheetId" TEXT;
ALTER TABLE "Business" ADD COLUMN "googleSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DriveFile" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fiscalMonthId" INTEGER,
    "driveFileId" TEXT NOT NULL,
    "webViewLink" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "uploadedByName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriveFile_businessId_kind_idx" ON "DriveFile"("businessId", "kind");

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
