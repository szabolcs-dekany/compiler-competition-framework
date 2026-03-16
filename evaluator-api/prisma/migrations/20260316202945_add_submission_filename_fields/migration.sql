/*
  Warnings:

  - Added the required column `extension` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalName` to the `Submission` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "extension" TEXT NOT NULL,
ADD COLUMN     "originalName" TEXT NOT NULL;
