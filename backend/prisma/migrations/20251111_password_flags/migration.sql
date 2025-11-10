-- Add password status tracking columns to users
ALTER TABLE "users"
    ADD COLUMN "passwordNeedsReset" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "passwordUpdatedAt" TIMESTAMP;
