-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('OFFENSIVE', 'FAKE', 'PRIVACY', 'CHILD_SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('MEMBER', 'FILTER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'REPORT_FILED';
ALTER TYPE "NotificationKind" ADD VALUE 'REPORT_RESOLVED';

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "source" "ReportSource" NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "personId" TEXT NOT NULL,
    "field" TEXT,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "reporterId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_number_key" ON "Report"("number");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_personId_idx" ON "Report"("personId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

