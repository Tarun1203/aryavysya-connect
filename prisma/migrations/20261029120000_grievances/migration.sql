-- CreateEnum
CREATE TYPE "GrievanceKind" AS ENUM ('ACCESS', 'CORRECTION', 'ERASURE', 'CONSENT', 'NOMINATION', 'CHILD_SAFETY', 'COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "GrievanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "Grievance" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "kind" "GrievanceKind" NOT NULL,
    "status" "GrievanceStatus" NOT NULL DEFAULT 'OPEN',
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "userId" TEXT,
    "aboutText" TEXT,
    "message" TEXT NOT NULL,
    "ipHash" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "response" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grievance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grievance_number_key" ON "Grievance"("number");

-- CreateIndex
CREATE INDEX "Grievance_status_dueAt_idx" ON "Grievance"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Grievance_ipHash_createdAt_idx" ON "Grievance"("ipHash", "createdAt");

