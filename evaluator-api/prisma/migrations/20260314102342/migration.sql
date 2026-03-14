/*
  Warnings:

  - You are about to drop the column `executionTime` on the `TestRun` table. All the data in the column will be lost.
  - You are about to drop the column `memoryUsage` on the `TestRun` table. All the data in the column will be lost.
  - You are about to drop the column `output` on the `TestRun` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `TestRun` table. All the data in the column will be lost.
  - You are about to drop the `TestCase` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'EVALUATING';
ALTER TYPE "SubmissionStatus" ADD VALUE 'COMPLETED';

-- AlterEnum
ALTER TYPE "TestRunStatus" ADD VALUE 'COMPILING';

-- DropForeignKey
ALTER TABLE "TestRun" DROP CONSTRAINT "TestRun_testCaseId_fkey";

-- AlterTable
ALTER TABLE "TestRun" DROP COLUMN "executionTime",
DROP COLUMN "memoryUsage",
DROP COLUMN "output",
DROP COLUMN "score",
ADD COLUMN     "actualExitCode" INTEGER,
ADD COLUMN     "actualStderr" TEXT,
ADD COLUMN     "actualStdout" TEXT,
ADD COLUMN     "bonusEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "compileSuccess" BOOLEAN,
ADD COLUMN     "compileTimeMs" INTEGER,
ADD COLUMN     "expectedExitCode" INTEGER,
ADD COLUMN     "expectedStdout" TEXT,
ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "runSuccess" BOOLEAN,
ADD COLUMN     "runTimeMs" INTEGER;

-- DropTable
DROP TABLE "TestCase";

-- CreateIndex
CREATE INDEX "TestRun_submissionId_idx" ON "TestRun"("submissionId");

-- CreateIndex
CREATE INDEX "TestRun_testCaseId_idx" ON "TestRun"("testCaseId");
