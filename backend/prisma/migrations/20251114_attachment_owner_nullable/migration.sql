-- Allow attachments to persist when uploader accounts are deleted
ALTER TABLE "attachments"
    ADD COLUMN "uploaderNameSnapshot" TEXT,
    ADD COLUMN "uploaderEmailSnapshot" TEXT;

UPDATE "attachments" AS a
SET "uploaderNameSnapshot" = u."name",
    "uploaderEmailSnapshot" = u."email"
FROM "users" AS u
WHERE a."ownerId" = u."id" AND a."ownerId" IS NOT NULL;

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_ownerId_fkey";

ALTER TABLE "attachments"
    ALTER COLUMN "ownerId" DROP NOT NULL;

ALTER TABLE "attachments"
    ADD CONSTRAINT "attachments_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
