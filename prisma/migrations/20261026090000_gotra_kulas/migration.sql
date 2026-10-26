-- AlterTable
ALTER TABLE "Gotra" ADD COLUMN     "kulas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "no" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Gotra_no_key" ON "Gotra"("no");

