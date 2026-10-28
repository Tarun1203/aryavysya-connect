-- AlterTable
ALTER TABLE "OtpChallenge" ADD COLUMN     "ipHash" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "OtpChallenge_ipHash_createdAt_idx" ON "OtpChallenge"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_createdAt_idx" ON "OtpChallenge"("createdAt");


-- A marriage is one row per pair, whichever way round it was entered, and never a person with
-- themselves. Prisma doesn't manage triggers, so this stays out of the schema diff.
CREATE OR REPLACE FUNCTION couple_pair_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."person1Id" = NEW."person2Id" THEN
    RAISE EXCEPTION 'couple_self: a person cannot be married to themselves' USING ERRCODE = '23514';
  END IF;
  -- Serialise inserts for the same pair, so two at once can't both pass the check below
  PERFORM pg_advisory_xact_lock(hashtext(LEAST(NEW."person1Id", NEW."person2Id") || ':' || GREATEST(NEW."person1Id", NEW."person2Id")));
  IF EXISTS (
    SELECT 1 FROM "Couple"
    WHERE "person1Id" = NEW."person2Id" AND "person2Id" = NEW."person1Id" AND "id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'couple_duplicate: this pair is already recorded' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS couple_pair_guard ON "Couple";
CREATE TRIGGER couple_pair_guard BEFORE INSERT OR UPDATE OF "person1Id", "person2Id" ON "Couple"
  FOR EACH ROW EXECUTE FUNCTION couple_pair_guard();
