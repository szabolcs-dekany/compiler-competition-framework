-- CreateTable
CREATE TABLE "Dockerfile" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dockerfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DockerfileVersion" (
    "id" TEXT NOT NULL,
    "dockerfileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DockerfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dockerfile_teamId_key" ON "Dockerfile"("teamId");

-- CreateIndex
CREATE INDEX "Dockerfile_teamId_idx" ON "Dockerfile"("teamId");

-- CreateIndex
CREATE INDEX "DockerfileVersion_dockerfileId_idx" ON "DockerfileVersion"("dockerfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DockerfileVersion_dockerfileId_version_key" ON "DockerfileVersion"("dockerfileId", "version");

-- AddForeignKey
ALTER TABLE "Dockerfile" ADD CONSTRAINT "Dockerfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockerfileVersion" ADD CONSTRAINT "DockerfileVersion_dockerfileId_fkey" FOREIGN KEY ("dockerfileId") REFERENCES "Dockerfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
