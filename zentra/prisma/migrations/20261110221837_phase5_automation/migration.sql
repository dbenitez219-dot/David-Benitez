-- AlterEnum
ALTER TYPE "ActionStatus" ADD VALUE 'EXECUTING';

-- AlterTable
ALTER TABLE "AdAccount" ADD COLUMN     "canManage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AutomationAction" ADD COLUMN     "adId" TEXT,
ADD COLUMN     "decidedBy" TEXT,
ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "ruleId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'RULE';

-- AlterTable
ALTER TABLE "AutomationSettings" ADD COLUMN     "activeFromHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "activeToHour" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "notifyEmail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailedAt" TIMESTAMP(3),
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'info';
