-- CreateEnum
CREATE TYPE "RuleLevel" AS ENUM ('ALLOW', 'WARN', 'BLOCK');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "birthGotraId" TEXT,
ADD COLUMN     "maternalGotraId" TEXT;

-- CreateTable
CREATE TABLE "MarriageRule" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "sagotra" "RuleLevel" NOT NULL DEFAULT 'WARN',
    "maternalGotra" "RuleLevel" NOT NULL DEFAULT 'WARN',
    "menarikam" "RuleLevel" NOT NULL DEFAULT 'WARN',
    "keepGotraAfterMarriageEnds" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarriageRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarriageRule_state_key" ON "MarriageRule"("state");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_birthGotraId_fkey" FOREIGN KEY ("birthGotraId") REFERENCES "Gotra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_maternalGotraId_fkey" FOREIGN KEY ("maternalGotraId") REFERENCES "Gotra"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Until now Person.gotraId held the gotra at birth: keep it as the birth gotra
UPDATE "Person" SET "birthGotraId" = "gotraId" WHERE "birthGotraId" IS NULL;

-- Mother's gotra = the mother's birth gotra
UPDATE "Person" c SET "maternalGotraId" = m."birthGotraId"
FROM "ParentChild" pc JOIN "Person" m ON m.id = pc."parentId" AND m.gender = 'FEMALE'
WHERE pc."childId" = c.id AND c."maternalGotraId" IS NULL AND m."birthGotraId" IS NOT NULL;

-- A married woman's own gotra becomes her husband's (latest marriage first)
UPDATE "Person" w SET "gotraId" = h."gotraId"
FROM (
  SELECT DISTINCT ON (wife) wife, husband FROM (
    SELECT c."person2Id" AS wife, c."person1Id" AS husband, c."createdAt" FROM "Couple" c
    UNION ALL
    SELECT c."person1Id", c."person2Id", c."createdAt" FROM "Couple" c
  ) pairs
  JOIN "Couple" cc ON (cc."person1Id" = pairs.wife AND cc."person2Id" = pairs.husband) OR (cc."person2Id" = pairs.wife AND cc."person1Id" = pairs.husband)
  WHERE cc.status <> 'PROPOSED'
  ORDER BY wife, pairs."createdAt" DESC
) m
JOIN "Person" h ON h.id = m.husband AND h.gender = 'MALE' AND h."gotraId" IS NOT NULL
WHERE w.id = m.wife AND w.gender = 'FEMALE';

-- Default marriage rules for every region; states can override them
INSERT INTO "MarriageRule" ("id", "state", "updatedAt") VALUES ('default', '*', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
