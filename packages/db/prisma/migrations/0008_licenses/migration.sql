CREATE TYPE "LicenseRightsType" AS ENUM ('mechanical', 'performance', 'synchronization', 'master');
CREATE TYPE "LicenseStatus" AS ENUM ('draft', 'active', 'expired', 'revoked');

CREATE TABLE "License" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workId" UUID NOT NULL,
    "licensee" TEXT NOT NULL,
    "territory" TEXT,
    "rightsType" "LicenseRightsType" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "terms" JSONB,
    "status" "LicenseStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "License_workId_idx" ON "License"("workId");
CREATE INDEX "License_status_idx" ON "License"("status");

ALTER TABLE "License"
  ADD CONSTRAINT "License_workId_fkey"
  FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
