ALTER TABLE "Work" ADD COLUMN "iswc" TEXT;
ALTER TABLE "Recording" ADD COLUMN "isrc" TEXT;

CREATE UNIQUE INDEX "Work_iswc_key" ON "Work"("iswc") WHERE "iswc" IS NOT NULL;
CREATE UNIQUE INDEX "Recording_isrc_key" ON "Recording"("isrc") WHERE "isrc" IS NOT NULL;
