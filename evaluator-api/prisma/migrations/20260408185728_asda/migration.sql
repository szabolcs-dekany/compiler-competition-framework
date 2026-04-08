-- AlterTable
ALTER TABLE "SourceFile" ADD COLUMN     "compiledAt" TIMESTAMP(3),
ADD COLUMN     "compiledS3Key" TEXT,
ADD COLUMN     "compiledSubmissionVersion" INTEGER;
