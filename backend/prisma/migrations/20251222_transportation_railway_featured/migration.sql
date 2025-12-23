-- Remove legacy railway banners
DROP TABLE IF EXISTS "transportation_railway_banners";

-- Create featured item type
DO $$ BEGIN
    CREATE TYPE "TransportationRailwayFeaturedType" AS ENUM ('ROUTE', 'STATION', 'DEPOT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create featured items table
CREATE TABLE "transportation_railway_featured_items" (
    "id" TEXT NOT NULL,
    "entityType" "TransportationRailwayFeaturedType" NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "entityId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "transportation_railway_featured_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_featured_scope"
    ON "transportation_railway_featured_items" ("entityType", "serverId", "railwayMod", "entityId");
CREATE INDEX "idx_transportation_railway_featured_order"
    ON "transportation_railway_featured_items" ("displayOrder", "createdAt");

ALTER TABLE "transportation_railway_featured_items" ADD CONSTRAINT "transportation_railway_featured_items_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transportation_railway_featured_items" ADD CONSTRAINT "transportation_railway_featured_items_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
