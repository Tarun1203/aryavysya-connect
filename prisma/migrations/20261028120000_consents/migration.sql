-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('MEMBERSHIP', 'FAMILY_TREE', 'PHOTO');

-- CreateEnum
CREATE TYPE "ConsentBasis" AS ENUM ('SELF', 'GUARDIAN', 'OFFLINE_FORM');

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "basis" "ConsentBasis" NOT NULL,
    "personId" TEXT,
    "userId" TEXT,
    "givenById" TEXT,
    "guardianName" TEXT,
    "guardianRelation" TEXT,
    "noticeVersion" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consent_personId_purpose_idx" ON "Consent"("personId", "purpose");

-- CreateIndex
CREATE INDEX "Consent_userId_idx" ON "Consent"("userId");

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_givenById_fkey" FOREIGN KEY ("givenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

