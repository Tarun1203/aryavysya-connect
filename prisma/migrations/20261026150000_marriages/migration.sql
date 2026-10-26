-- CreateEnum
CREATE TYPE "MarriageStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'WIDOWED', 'DIVORCED');

-- AlterTable
ALTER TABLE "Couple" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "status" "MarriageStatus" NOT NULL DEFAULT 'CONFIRMED';

-- AddForeignKey
ALTER TABLE "Couple" ADD CONSTRAINT "Couple_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Couple" ADD CONSTRAINT "Couple_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

