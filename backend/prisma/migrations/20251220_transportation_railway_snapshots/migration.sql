CREATE TABLE "transportation_railway_route_geometry_snapshots" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "dimensionContext" TEXT NOT NULL,
    "routeEntityId" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "geometry2d" JSONB NOT NULL,
    "bounds" JSONB,
    "stops" JSONB,
    "pathNodes3d" JSONB,
    "pathEdges" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_route_geometry_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_route_geometry_snapshot"
    ON "transportation_railway_route_geometry_snapshots" ("serverId", "railwayMod", "dimensionContext", "routeEntityId");
CREATE INDEX "idx_transportation_railway_route_geometry_scope"
    ON "transportation_railway_route_geometry_snapshots" ("serverId", "railwayMod", "dimensionContext");

CREATE TABLE "transportation_railway_station_map_snapshots" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "dimensionContext" TEXT NOT NULL,
    "stationEntityId" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_station_map_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_station_map_snapshot"
    ON "transportation_railway_station_map_snapshots" ("serverId", "railwayMod", "dimensionContext", "stationEntityId");
CREATE INDEX "idx_transportation_railway_station_map_scope"
    ON "transportation_railway_station_map_snapshots" ("serverId", "railwayMod", "dimensionContext");

CREATE TABLE "transportation_railway_compute_scopes" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "dimensionContext" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "computedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_compute_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_compute_scope"
    ON "transportation_railway_compute_scopes" ("serverId", "railwayMod", "dimensionContext");
CREATE INDEX "idx_transportation_railway_compute_scope_fingerprint"
    ON "transportation_railway_compute_scopes" ("serverId", "railwayMod", "fingerprint");

