-- CreateEnum
CREATE TYPE "AttachmentVisibilityMode" AS ENUM ('INHERIT', 'PUBLIC', 'RESTRICTED');

-- AlterTable
ALTER TABLE "attachment_folders" ADD COLUMN     "visibilityLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visibilityMode" "AttachmentVisibilityMode" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "visibilityRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "visibilityLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visibilityMode" "AttachmentVisibilityMode" NOT NULL DEFAULT 'INHERIT',
ADD COLUMN     "visibilityRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "isPublic" SET DEFAULT true;

-- Backfill existing attachment visibility flags
UPDATE "attachments"
SET "visibilityMode" = CASE
    WHEN "isPublic" IS TRUE THEN 'PUBLIC'::"AttachmentVisibilityMode"
    ELSE 'RESTRICTED'::"AttachmentVisibilityMode"
  END;

-- Ensure folders have a default visibility mode
UPDATE "attachment_folders"
SET "visibilityMode" = 'PUBLIC'::"AttachmentVisibilityMode"
WHERE "visibilityMode" IS NULL;
