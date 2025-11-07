CREATE TYPE "ExportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE "ExportFormat" AS ENUM ('wav', 'mp3', 'flac');

CREATE TABLE "Export" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'pending',
    "format" "ExportFormat" NOT NULL DEFAULT 'wav',
    "fileUrl" TEXT,
    "storageKey" TEXT,
    "fileSize" INTEGER,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Export_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Export_sessionId_idx" ON "Export"("sessionId");
CREATE INDEX "Export_userId_idx" ON "Export"("userId");
CREATE INDEX "Export_status_idx" ON "Export"("status");

ALTER TABLE "Export"
    ADD CONSTRAINT "Export_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100);

ALTER TABLE "Export"
    ADD CONSTRAINT "Export_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "studio_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Export"
    ADD CONSTRAINT "Export_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
