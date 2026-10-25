-- CreateEnum
CREATE TYPE "LocalityKind" AS ENUM ('VILLAGE', 'POST_OFFICE');

-- AlterTable
ALTER TABLE "District" ADD COLUMN     "lgdCode" INTEGER;

-- AlterTable
ALTER TABLE "FamilyClaim" ADD COLUMN     "nativeLocalityId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "localityId" TEXT,
ADD COLUMN     "talukId" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "birthLocalityId" TEXT,
ADD COLUMN     "nativeLocalityId" TEXT;

-- CreateTable
CREATE TABLE "Taluk" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lgdCode" INTEGER,
    "districtId" TEXT NOT NULL,

    CONSTRAINT "Taluk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locality" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLocal" TEXT,
    "kind" "LocalityKind" NOT NULL,
    "pincode" TEXT,
    "officeType" TEXT,
    "lgdCode" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "districtId" TEXT NOT NULL,
    "talukId" TEXT,

    CONSTRAINT "Locality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Taluk_lgdCode_key" ON "Taluk"("lgdCode");

-- CreateIndex
CREATE UNIQUE INDEX "Taluk_districtId_name_key" ON "Taluk"("districtId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Locality_key_key" ON "Locality"("key");

-- CreateIndex
CREATE INDEX "Locality_districtId_talukId_name_idx" ON "Locality"("districtId", "talukId", "name");

-- CreateIndex
CREATE INDEX "Locality_pincode_idx" ON "Locality"("pincode");

-- CreateIndex
CREATE UNIQUE INDEX "District_lgdCode_key" ON "District"("lgdCode");

-- AddForeignKey
ALTER TABLE "Taluk" ADD CONSTRAINT "Taluk_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_talukId_fkey" FOREIGN KEY ("talukId") REFERENCES "Taluk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_talukId_fkey" FOREIGN KEY ("talukId") REFERENCES "Taluk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyClaim" ADD CONSTRAINT "FamilyClaim_nativeLocalityId_fkey" FOREIGN KEY ("nativeLocalityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_birthLocalityId_fkey" FOREIGN KEY ("birthLocalityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_nativeLocalityId_fkey" FOREIGN KEY ("nativeLocalityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

