-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('PENDING', 'BUILDING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "DockerfileVersion" ADD COLUMN     "buildCompletedAt" TIMESTAMP(3),
ADD COLUMN     "buildError" TEXT,
ADD COLUMN     "buildLogS3Key" TEXT,
ADD COLUMN     "buildStartedAt" TIMESTAMP(3),
ADD COLUMN     "buildStatus" "BuildStatus" NOT NULL DEFAULT 'PENDING';
