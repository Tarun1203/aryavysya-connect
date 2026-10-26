-- AlterTable
ALTER TABLE "Gotra" ADD COLUMN     "kulaNames" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "localVerified" BOOLEAN NOT NULL DEFAULT false;

