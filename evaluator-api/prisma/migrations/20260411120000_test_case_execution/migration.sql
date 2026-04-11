CREATE TYPE "TestRunAttemptValidationMode" AS ENUM ('EXPECTED_STDOUT', 'VALIDATOR');

ALTER TABLE "DockerfileVersion"
ADD COLUMN "imageName" TEXT;

ALTER TABLE "SourceFileVersion"
ADD COLUMN "originalName" TEXT,
ADD COLUMN "extension" TEXT NOT NULL DEFAULT '';

UPDATE "SourceFileVersion" AS "sfv"
SET
  "originalName" = "sf"."originalName",
  "extension" = "sf"."extension"
FROM "SourceFile" AS "sf"
WHERE "sf"."id" = "sfv"."sourceFileId";

ALTER TABLE "SourceFileVersion"
ALTER COLUMN "originalName" SET NOT NULL;

ALTER TABLE "SourceFileVersion"
ALTER COLUMN "extension" DROP DEFAULT;

ALTER TABLE "Submission"
ADD COLUMN "dockerfileId" TEXT,
ADD COLUMN "dockerfileVersion" INTEGER,
ADD COLUMN "dockerImageName" TEXT;

ALTER TABLE "TestRun"
ADD COLUMN "compilationId" TEXT;

CREATE TABLE "TestRunAttempt" (
  "id" TEXT NOT NULL,
  "testRunId" TEXT NOT NULL,
  "attemptIndex" INTEGER NOT NULL,
  "seed" TEXT NOT NULL,
  "generatedInputs" JSONB NOT NULL,
  "stdin" TEXT,
  "validationMode" "TestRunAttemptValidationMode" NOT NULL,
  "expectedStdout" TEXT,
  "expectedExitCode" INTEGER NOT NULL,
  "actualStdout" TEXT,
  "actualStderr" TEXT,
  "actualExitCode" INTEGER,
  "runTimeMs" INTEGER,
  "passed" BOOLEAN,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "TestRunAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestRun_compilationId_key" ON "TestRun"("compilationId");
CREATE UNIQUE INDEX "TestRun_submissionId_testCaseId_key" ON "TestRun"("submissionId", "testCaseId");
CREATE INDEX "Submission_dockerfileId_idx" ON "Submission"("dockerfileId");
CREATE UNIQUE INDEX "TestRunAttempt_testRunId_attemptIndex_key" ON "TestRunAttempt"("testRunId", "attemptIndex");
CREATE INDEX "TestRunAttempt_testRunId_idx" ON "TestRunAttempt"("testRunId");

ALTER TABLE "Submission"
ADD CONSTRAINT "Submission_dockerfileId_fkey"
FOREIGN KEY ("dockerfileId") REFERENCES "Dockerfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestRun"
ADD CONSTRAINT "TestRun_compilationId_fkey"
FOREIGN KEY ("compilationId") REFERENCES "Compilation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestRunAttempt"
ADD CONSTRAINT "TestRunAttempt_testRunId_fkey"
FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
