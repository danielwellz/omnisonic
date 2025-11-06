CREATE TABLE "RoyaltyEvent" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "workId" TEXT,
    "usageType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "territory" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoyaltyEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CycleCheckpoint" (
    "id" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalAmount" DECIMAL(18,6) NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CycleCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "workId" TEXT,
    "contributorId" TEXT,
    "cycleId" TEXT,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "direction" TEXT NOT NULL DEFAULT 'credit',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoyaltyEvent_recordingId_idx" ON "RoyaltyEvent"("recordingId");
CREATE INDEX "RoyaltyEvent_workId_idx" ON "RoyaltyEvent"("workId");
CREATE INDEX "RoyaltyEvent_occurredAt_idx" ON "RoyaltyEvent"("occurredAt");

CREATE UNIQUE INDEX "CycleCheckpoint_cycleNumber_currency_key" ON "CycleCheckpoint"("cycleNumber", "currency");

CREATE INDEX "LedgerEntry_eventId_idx" ON "LedgerEntry"("eventId");
CREATE INDEX "LedgerEntry_workId_idx" ON "LedgerEntry"("workId");
CREATE INDEX "LedgerEntry_contributorId_idx" ON "LedgerEntry"("contributorId");
CREATE INDEX "LedgerEntry_cycleId_idx" ON "LedgerEntry"("cycleId");

ALTER TABLE "RoyaltyEvent" ADD CONSTRAINT "RoyaltyEvent_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoyaltyEvent" ADD CONSTRAINT "RoyaltyEvent_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CycleCheckpoint" ADD CONSTRAINT "CycleCheckpoint_totalAmount_currency_check" CHECK ("totalAmount" >= 0);

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RoyaltyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CycleCheckpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
