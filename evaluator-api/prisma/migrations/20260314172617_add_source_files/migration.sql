-- CreateTable
CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceFile_teamId_idx" ON "SourceFile"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFile_teamId_testCaseId_key" ON "SourceFile"("teamId", "testCaseId");

-- AddForeignKey
ALTER TABLE "SourceFile" ADD CONSTRAINT "SourceFile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
