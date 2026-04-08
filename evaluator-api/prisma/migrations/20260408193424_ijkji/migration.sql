-- AlterTable
ALTER TABLE "SourceFileVersion" ADD COLUMN     "compileStatus" "SourceFileCompileStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "compiledAt" TIMESTAMP(3),
ADD COLUMN     "compiledS3Key" TEXT,
ADD COLUMN     "compiledSubmissionVersion" INTEGER;
