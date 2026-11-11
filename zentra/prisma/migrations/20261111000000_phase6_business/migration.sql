-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "campaignExternalId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "consentRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "isSimulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INITIAL',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "taxMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlanPrice" ADD COLUMN     "taxPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethodEnc" TEXT,
ADD COLUMN     "priceMinor" INTEGER,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxIncluded" BOOLEAN,
ADD COLUMN     "taxPercent" DECIMAL(5,2),
ADD COLUMN     "trialWarned1" TIMESTAMP(3),
ADD COLUMN     "trialWarned3" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "Payment"("provider", "providerRef");

