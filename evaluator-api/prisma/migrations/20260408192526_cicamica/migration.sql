-- CreateEnum
CREATE TYPE "SourceFileCompileStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "SourceFile" ADD COLUMN     "compileStatus" "SourceFileCompileStatus" NOT NULL DEFAULT 'PENDING';
