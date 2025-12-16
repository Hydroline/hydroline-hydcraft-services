import type { BlockPosition } from '../utils/block-pos.util';

export type PreferredRailCurve = 'primary' | 'secondary' | null;

export type RailCurveParameters = {
  h: number | null;
  k: number | null;
  r: number | null;
  tStart: number | null;
  tEnd: number | null;
  reverse: boolean | null;
  isStraight: boolean | null;
};

export type RailConnectionMetadata = {
  targetNodeId: string;
  railType: string | null;
  transportMode: string | null;
  modelKey: string | null;
  isSecondaryDir: boolean | null;
  yStart: number | null;
  yEnd: number | null;
  verticalCurveRadius: number | null;
  primary: RailCurveParameters | null;
  secondary: RailCurveParameters | null;
  preferredCurve: 'primary' | 'secondary' | null;
};

export type RailGeometrySegment = {
  start: BlockPosition;
  end: BlockPosition;
  connection: RailConnectionMetadata | null;
};

export type RailGraphNode = {
  id: string;
  position: BlockPosition;
};

export type PlatformNode = {
  platformId: string | null;
  nodes: RailGraphNode[];
};

export type RailGraph = {
  positions: Map<string, BlockPosition>;
  adjacency: Map<string, Set<string>>;
  connections: Map<string, Map<string, RailConnectionMetadata>>;
};
