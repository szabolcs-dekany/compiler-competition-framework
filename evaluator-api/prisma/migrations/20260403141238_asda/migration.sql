/*
  Warnings:

  - A unique constraint covering the columns `[teamId,version]` on the table `Submission` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CompileStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "compileCompletedAt" TIMESTAMP(3),
ADD COLUMN     "compileError" TEXT,
ADD COLUMN     "compileLogS3Key" TEXT,
ADD COLUMN     "compileStartedAt" TIMESTAMP(3),
ADD COLUMN     "compileStatus" "CompileStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "Submission_teamId_version_key" ON "Submission"("teamId", "version");
