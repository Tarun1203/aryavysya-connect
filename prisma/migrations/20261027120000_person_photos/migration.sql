-- CreateTable
CREATE TABLE "PersonPhoto" (
    "personId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonPhoto_pkey" PRIMARY KEY ("personId")
);

-- AddForeignKey
ALTER TABLE "PersonPhoto" ADD CONSTRAINT "PersonPhoto_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

