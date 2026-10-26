-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('UNCLAIMED', 'CLAIMED', 'MERGED');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "currentCity" TEXT,
ADD COLUMN     "memberNo" SERIAL NOT NULL,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "status" "PersonStatus" NOT NULL DEFAULT 'UNCLAIMED';

-- Number existing people in the order they were added (before the unique index, so renumbering can't collide),
-- then continue the sequence after them
UPDATE "Person" p SET "memberNo" = o.n
FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Person") o
WHERE p.id = o.id;
SELECT setval(pg_get_serial_sequence('"Person"', 'memberNo'), COALESCE((SELECT max("memberNo") FROM "Person"), 0) + 1, false);

-- CreateIndex
CREATE UNIQUE INDEX "Person_memberNo_key" ON "Person"("memberNo");

-- People a registered member is linked to are already claimed
UPDATE "Person" SET "status" = 'CLAIMED' WHERE id IN (SELECT "personId" FROM "User" WHERE "personId" IS NOT NULL);
