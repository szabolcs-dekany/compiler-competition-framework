-- CreateEnum
CREATE TYPE "CompilationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Compilation" (
    "id" TEXT NOT NULL,
    "sourceFileVersionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "status" "CompilationStatus" NOT NULL DEFAULT 'PENDING',
    "s3Key" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compilation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Compilation_sourceFileVersionId_submissionId_key" ON "Compilation"("sourceFileVersionId", "submissionId");

-- CreateIndex
CREATE INDEX "Compilation_sourceFileVersionId_idx" ON "Compilation"("sourceFileVersionId");

-- CreateIndex
CREATE INDEX "Compilation_submissionId_idx" ON "Compilation"("submissionId");

-- AddForeignKey
ALTER TABLE "Compilation" ADD CONSTRAINT "Compilation_sourceFileVersionId_fkey" FOREIGN KEY ("sourceFileVersionId") REFERENCES "SourceFileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey  
ALTER TABLE "Compilation" ADD CONSTRAINT "Compilation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
