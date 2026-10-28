-- CreateEnum
CREATE TYPE "ChangeKind" AS ENUM ('EDIT', 'UNLINK', 'DISPUTE');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "ParentChild" ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "kind" "ChangeKind" NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PENDING',
    "personId" TEXT NOT NULL,
    "linkId" TEXT,
    "linkKind" TEXT,
    "changes" JSONB,
    "reason" TEXT NOT NULL,
    "correction" TEXT,
    "evidence" TEXT,
    "proposedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeRequest_personId_status_idx" ON "ChangeRequest"("personId", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_createdAt_idx" ON "ChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeRequest_proposedById_idx" ON "ChangeRequest"("proposedById");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

