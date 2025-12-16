import { HydrolineBeaconEvent } from '../../lib/hydroline-beacon/beacon.client';
import { TransportationRailwayMod } from '@prisma/client';

export type RailwayTypeConfig = {
  snapshotEvent: HydrolineBeaconEvent;
  queryEvent: HydrolineBeaconEvent;
  dimensionPrefix: string;
};

export const RAILWAY_TYPE_CONFIG: Record<
  TransportationRailwayMod,
  RailwayTypeConfig
> = {
  [TransportationRailwayMod.MTR]: {
    snapshotEvent: 'get_mtr_railway_snapshot',
    queryEvent: 'query_mtr_entities',
    dimensionPrefix: 'mtr',
  },
};

export const DEFAULT_RAILWAY_TYPE = TransportationRailwayMod.MTR;
