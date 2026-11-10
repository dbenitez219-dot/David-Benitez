-- CreateTable
CREATE TABLE "AnalysisSettings" (
    "organizationId" TEXT NOT NULL,
    "minSpend" DECIMAL(14,2) NOT NULL,
    "minDays" INTEGER NOT NULL DEFAULT 3,
    "minImpressions" INTEGER NOT NULL DEFAULT 1000,
    "targetCprMessages" DECIMAL(14,2),
    "targetCprLeads" DECIMAL(14,2),
    "targetCprSales" DECIMAL(14,2),
    "maxFrequency" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "anomalyFactor" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "AssistantLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT,
    "toolCalls" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantLog_organizationId_createdAt_idx" ON "AssistantLog"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AnalysisSettings" ADD CONSTRAINT "AnalysisSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantLog" ADD CONSTRAINT "AssistantLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
