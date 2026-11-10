-- AlterTable
ALTER TABLE "AdAccount" ADD COLUMN     "metaUserId" TEXT,
ADD COLUMN     "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "rawObjective" TEXT;

-- CreateTable
CREATE TABLE "DataDeletionRequest" (
    "code" TEXT NOT NULL,
    "metaUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "DataDeletionRequest_metaUserId_idx" ON "DataDeletionRequest"("metaUserId");
