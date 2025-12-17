-- Drop legacy aggregated entity storage
DROP TABLE IF EXISTS "transportation_railway_entities";
DROP TYPE IF EXISTS "TransportationRailwayEntityCategory";

-- Create dedicated tables for each MTR entity category
CREATE TABLE "transportation_railway_routes" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "entityId" TEXT NOT NULL,
    "dimensionContext" TEXT,
    "transportMode" TEXT,
    "name" TEXT,
    "color" INTEGER,
    "filePath" TEXT,
    "payload" JSONB NOT NULL,
    "lastBeaconUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_route"
    ON "transportation_railway_routes" ("serverId", "railwayMod", "entityId");
CREATE INDEX "idx_transportation_railway_route_scope"
    ON "transportation_railway_routes" ("serverId", "railwayMod", "dimensionContext");

CREATE TABLE "transportation_railway_stations" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "entityId" TEXT NOT NULL,
    "dimensionContext" TEXT,
    "transportMode" TEXT,
    "name" TEXT,
    "color" INTEGER,
    "filePath" TEXT,
    "payload" JSONB NOT NULL,
    "lastBeaconUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_stations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_station"
    ON "transportation_railway_stations" ("serverId", "railwayMod", "entityId");
CREATE INDEX "idx_transportation_railway_station_scope"
    ON "transportation_railway_stations" ("serverId", "railwayMod", "dimensionContext");

CREATE TABLE "transportation_railway_platforms" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "entityId" TEXT NOT NULL,
    "dimensionContext" TEXT,
    "transportMode" TEXT,
    "name" TEXT,
    "color" INTEGER,
    "filePath" TEXT,
    "payload" JSONB NOT NULL,
    "lastBeaconUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_platforms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_platform"
    ON "transportation_railway_platforms" ("serverId", "railwayMod", "entityId");
CREATE INDEX "idx_transportation_railway_platform_scope"
    ON "transportation_railway_platforms" ("serverId", "railwayMod", "dimensionContext");

CREATE TABLE "transportation_railway_depots" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "entityId" TEXT NOT NULL,
    "dimensionContext" TEXT,
    "transportMode" TEXT,
    "name" TEXT,
    "color" INTEGER,
    "filePath" TEXT,
    "payload" JSONB NOT NULL,
    "lastBeaconUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_depots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_depot"
    ON "transportation_railway_depots" ("serverId", "railwayMod", "entityId");
CREATE INDEX "idx_transportation_railway_depot_scope"
    ON "transportation_railway_depots" ("serverId", "railwayMod", "dimensionContext");

CREATE TABLE "transportation_railway_rails" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "entityId" TEXT NOT NULL,
    "dimensionContext" TEXT,
    "transportMode" TEXT,
    "name" TEXT,
    "color" INTEGER,
    "filePath" TEXT,
    "payload" JSONB NOT NULL,
    "lastBeaconUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_rails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_rail"
    ON "transportation_railway_rails" ("serverId", "railwayMod", "entityId");
CREATE INDEX "idx_transportation_railway_rail_scope"
    ON "transportation_railway_rails" ("serverId", "railwayMod", "dimensionContext");

CREATE TABLE "transportation_railway_signal_blocks" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "entityId" TEXT NOT NULL,
    "dimensionContext" TEXT,
    "transportMode" TEXT,
    "name" TEXT,
    "color" INTEGER,
    "filePath" TEXT,
    "payload" JSONB NOT NULL,
    "lastBeaconUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_signal_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_signal_block"
    ON "transportation_railway_signal_blocks" ("serverId", "railwayMod", "entityId");
CREATE INDEX "idx_transportation_railway_signal_scope"
    ON "transportation_railway_signal_blocks" ("serverId", "railwayMod", "dimensionContext");
