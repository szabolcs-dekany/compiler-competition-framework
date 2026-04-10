-- AlterTable
ALTER TABLE "SourceFile" DROP COLUMN "compileStatus",
DROP COLUMN "compiledAt",
DROP COLUMN "compiledS3Key",
DROP COLUMN "compiledSubmissionVersion";

-- AlterTable
ALTER TABLE "SourceFileVersion" DROP COLUMN "compileStatus",
DROP COLUMN "compiledAt",
DROP COLUMN "compiledS3Key",
DROP COLUMN "compiledSubmissionVersion";

-- DropEnum
DROP TYPE "SourceFileCompileStatus";
