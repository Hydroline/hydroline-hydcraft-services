import type { BlockPosition } from '../../transportation/utils/block-pos.util';
import type {
  PlatformNode,
  RailConnectionMetadata,
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
  RailGraphNode,
} from '../../transportation/railway/railway-graph.types';

const MAX_SEARCH_VISITS = 20000;

type PathResult = {
  points: BlockPosition[];
  segments: RailGeometrySegment[];
};

type Candidate = {
  id: string;
  cost: number;
};

export class MtrRouteFinder {
  private readonly connectionDensity = new Map<string, number>();

  constructor(private readonly graph: RailGraph) {
    this.initializeDensity();
  }

  findRoute(platformNodes: PlatformNode[]): PathResult | null {
    if (!platformNodes.length) return null;
    if (platformNodes.length === 1) {
      const points = platformNodes[0].nodes.map((node) => node.position);
      return { points, segments: [] };
    }
    const collected: BlockPosition[] = [];
    const segments: RailGeometrySegment[] = [];
    for (let index = 0; index < platformNodes.length - 1; index += 1) {
      const current = platformNodes[index];
      const next = platformNodes[index + 1];
      const result = this.findPathBetween(current.nodes, next.nodes);
      if (!result?.points?.length) {
        return null;
      }
      if (!collected.length) {
        collected.push(...result.points);
        segments.push(...result.segments);
      } else {
        const lastPoint = collected[collected.length - 1];
        result.points.forEach((point, idx) => {
          if (idx === 0 && lastPoint && this.isSamePosition(lastPoint, point)) {
            return;
          }
          collected.push(point);
        });
        segments.push(...result.segments);
      }
      this.bumpDensityAlongPath(result.segments);
    }
    return collected.length ? { points: collected, segments } : null;
  }

  findRouteVariants(
    startNodes: RailGraphNode[],
    targetNodes: RailGraphNode[],
  ): PathResult[] {
    const results: PathResult[] = [];
    if (!startNodes.length || !targetNodes.length) {
      return results;
    }
    const targetSet = new Set(
      targetNodes
        .map((node) => node.id)
        .filter((id): id is string =>
          Boolean(id && this.graph.positions.has(id)),
        ),
    );
    if (!targetSet.size) {
      return results;
    }
    for (const node of startNodes) {
      if (!node?.id || !this.graph.positions.has(node.id)) {
        continue;
      }
      const path = this.findPathFromSingle(node.id, targetSet);
      if (!path) {
        continue;
      }
      results.push(path);
      this.bumpDensityAlongPath(path.segments);
    }
    return results;
  }

  private initializeDensity() {
    for (const [from, neighbors] of this.graph.adjacency) {
      for (const to of neighbors) {
        const fromPosition = this.graph.positions.get(from);
        const toPosition = this.graph.positions.get(to);
        if (!fromPosition || !toPosition) {
          continue;
        }
        const key = this.edgeKey(fromPosition, toPosition);
        this.connectionDensity.set(key, neighbors.size);
      }
    }
  }

  private findPathBetween(
    startNodes: RailGraphNode[],
    targetNodes: RailGraphNode[],
  ): PathResult | null {
    const startIds = startNodes
      .map((node) => node.id)
      .filter((id): id is string =>
        Boolean(id && this.graph.positions.has(id)),
      );
    const targetSet = new Set(
      targetNodes
        .map((node) => node.id)
        .filter((id): id is string =>
          Boolean(id && this.graph.positions.has(id)),
        ),
    );
    if (!startIds.length || !targetSet.size) {
      return null;
    }
    const openSet: Candidate[] = [];
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    for (const id of startIds) {
      distances.set(id, 0);
      previous.set(id, null);
      openSet.push({ id, cost: 0 });
    }
    let visits = 0;
    while (openSet.length) {
      openSet.sort((a, b) => a.cost - b.cost);
      const current = openSet.shift()!;
      const knownCost = distances.get(current.id) ?? Number.POSITIVE_INFINITY;
      if (current.cost > knownCost) {
        continue;
      }
      visits += 1;
      if (visits > MAX_SEARCH_VISITS) {
        break;
      }
      if (targetSet.has(current.id)) {
        return this.reconstructPath(current.id, previous);
      }
      const neighbors = this.graph.adjacency.get(current.id);
      if (!neighbors?.size) {
        continue;
      }
      const currentPosition = this.graph.positions.get(current.id);
      if (!currentPosition) {
        continue;
      }
      for (const neighbor of neighbors) {
        const neighborPosition = this.graph.positions.get(neighbor);
        if (!neighborPosition) {
          continue;
        }
        const connection =
          this.graph.connections.get(current.id)?.get(neighbor) ?? null;
        const edgeCost = this.calculateEdgeCost(
          connection,
          currentPosition,
          neighborPosition,
        );
        const newCost = knownCost + edgeCost;
        const existingCost =
          distances.get(neighbor) ?? Number.POSITIVE_INFINITY;
        if (newCost < existingCost) {
          distances.set(neighbor, newCost);
          previous.set(neighbor, current.id);
          openSet.push({ id: neighbor, cost: newCost });
        }
      }
    }
    return null;
  }

  private findPathFromSingle(
    startId: string,
    targetSet: Set<string>,
  ): PathResult | null {
    if (!this.graph.positions.has(startId) || !targetSet.size) {
      return null;
    }
    const openSet: Candidate[] = [{ id: startId, cost: 0 }];
    const distances = new Map<string, number>([[startId, 0]]);
    const previous = new Map<string, string | null>([[startId, null]]);
    let visits = 0;
    while (openSet.length) {
      openSet.sort((a, b) => a.cost - b.cost);
      const current = openSet.shift()!;
      const knownCost = distances.get(current.id) ?? Number.POSITIVE_INFINITY;
      if (current.cost > knownCost) {
        continue;
      }
      visits += 1;
      if (visits > MAX_SEARCH_VISITS) {
        break;
      }
      if (targetSet.has(current.id)) {
        return this.reconstructPath(current.id, previous);
      }
      const neighbors = this.graph.adjacency.get(current.id);
      if (!neighbors?.size) {
        continue;
      }
      const currentPosition = this.graph.positions.get(current.id);
      if (!currentPosition) {
        continue;
      }
      for (const neighbor of neighbors) {
        const neighborPosition = this.graph.positions.get(neighbor);
        if (!neighborPosition) {
          continue;
        }
        const connection =
          this.graph.connections.get(current.id)?.get(neighbor) ?? null;
        const edgeCost = this.calculateEdgeCost(
          connection,
          currentPosition,
          neighborPosition,
        );
        const newCost = knownCost + edgeCost;
        const existingCost =
          distances.get(neighbor) ?? Number.POSITIVE_INFINITY;
        if (newCost < existingCost) {
          distances.set(neighbor, newCost);
          previous.set(neighbor, current.id);
          openSet.push({ id: neighbor, cost: newCost });
        }
      }
    }
    return null;
  }

  private calculateEdgeCost(
    connection: RailConnectionMetadata | null,
    from: BlockPosition,
    to: BlockPosition,
  ) {
    const distance = this.euclideanDistance(from, to);
    const key = this.edgeKey(from, to);
    const density = this.connectionDensity.get(key) ?? 1;
    const densityBoost = Math.log1p(density);
    let penalty = 0;
    if (connection) {
      if (connection.isSecondaryDir) {
        penalty += 12;
      }
      if (this.curveHasReverse(connection.primary)) {
        penalty += 20;
      }
      if (this.curveHasReverse(connection.secondary)) {
        penalty += 10;
      }
      if (connection.preferredCurve === 'secondary') {
        penalty += 6;
      }
    }
    return distance + penalty - densityBoost * 0.5;
  }

  private euclideanDistance(a: BlockPosition, b: BlockPosition) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.hypot(dx, dz);
  }

  private reconstructPath(
    targetId: string,
    previous: Map<string, string | null>,
  ): PathResult {
    const pathIds: string[] = [];
    let cursor: string | null | undefined = targetId;
    while (cursor) {
      pathIds.push(cursor);
      cursor = previous.get(cursor) ?? null;
    }
    pathIds.reverse();
    const points = pathIds
      .map((id) => this.graph.positions.get(id))
      .filter((position): position is BlockPosition => Boolean(position));
    const segments: RailGeometrySegment[] = [];
    for (let i = 0; i < pathIds.length - 1; i++) {
      const fromId = pathIds[i];
      const toId = pathIds[i + 1];
      const start = this.graph.positions.get(fromId);
      const end = this.graph.positions.get(toId);
      if (!start || !end) continue;
      const connection = this.graph.connections.get(fromId)?.get(toId) ?? null;
      segments.push({
        start,
        end,
        connection,
      });
    }
    return { points, segments };
  }

  private bumpDensityAlongPath(segments: RailGeometrySegment[]) {
    for (const segment of segments) {
      const key = this.edgeKey(segment.start, segment.end);
      const existing = this.connectionDensity.get(key) ?? 0;
      this.connectionDensity.set(key, existing + 1);
    }
  }

  private edgeKey(from: BlockPosition, to: BlockPosition) {
    return `${from.x},${from.y},${from.z}->${to.x},${to.y},${to.z}`;
  }

  private isSamePosition(a: BlockPosition, b: BlockPosition) {
    return a.x === b.x && a.y === b.y && a.z === b.z;
  }

  private curveHasReverse(curve: RailCurveParameters | null) {
    return Boolean(curve?.reverse);
  }
}
