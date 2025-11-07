CREATE TYPE "TaggedEntityType" AS ENUM ('artist', 'work', 'recording');
CREATE TYPE "TaggingMethod" AS ENUM ('heuristic', 'fuzzy', 'embedding', 'hybrid');

CREATE TABLE "EntityTag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "newsItemId" TEXT NOT NULL,
    "entityType" "TaggedEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" "TaggingMethod" NOT NULL DEFAULT 'heuristic',
    "matchedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityTag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EntityTag_newsItemId_idx" ON "EntityTag"("newsItemId");
CREATE INDEX "EntityTag_entityType_entityId_idx" ON "EntityTag"("entityType", "entityId");

CREATE TYPE "AlertChannelType" AS ENUM ('email', 'webhook', 'slack');
CREATE TYPE "AlertEventStatus" AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE "AlertChannel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "AlertChannelType" NOT NULL,
    "destination" TEXT NOT NULL,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerHour" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channelId" UUID NOT NULL,
    "entityType" "TaggedEntityType",
    "entityId" TEXT,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "threshold" INTEGER NOT NULL DEFAULT 10,
    "windowMinutes" INTEGER NOT NULL DEFAULT 60,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "template" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AlertRule_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "AlertChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AlertRule_channelId_idx" ON "AlertRule"("channelId");
CREATE INDEX "AlertRule_entityType_entityId_idx" ON "AlertRule"("entityType", "entityId");

CREATE TABLE "AlertEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ruleId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "entityType" "TaggedEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "mentions" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "payload" JSONB,
    "status" "AlertEventStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AlertEvent_ruleId_fkey"
      FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlertEvent_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "AlertChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AlertEvent_ruleId_idx" ON "AlertEvent"("ruleId");
CREATE INDEX "AlertEvent_channelId_idx" ON "AlertEvent"("channelId");
CREATE INDEX "AlertEvent_entityType_entityId_idx" ON "AlertEvent"("entityType", "entityId");
