-- DriveFile: link a file to a specific record (polymorphic)
ALTER TABLE "DriveFile" ADD COLUMN "refType" TEXT;
ALTER TABLE "DriveFile" ADD COLUMN "refId" TEXT;

CREATE INDEX "DriveFile_refType_refId_idx" ON "DriveFile"("refType", "refId");
