-- CreateTable
CREATE TABLE "SourceFileVersion" (
    "id" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceFileVersion_sourceFileId_idx" ON "SourceFileVersion"("sourceFileId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFileVersion_sourceFileId_version_key" ON "SourceFileVersion"("sourceFileId", "version");

-- AddForeignKey
ALTER TABLE "SourceFileVersion" ADD CONSTRAINT "SourceFileVersion_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
