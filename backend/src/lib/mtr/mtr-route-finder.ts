import type { BlockPosition } from '../../transportation/utils/block-pos.util';
import type {
  PlatformNode,
  RailConnectionMetadata,
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
  RailGraphNode,
} from '../../transportation/railway/railway-graph.types';

// Large routes can span thousands of rail nodes.
// If the search is capped too low, route detail will fall back to
// platform-centers and look like a straight line between stops.
const MAX_SEARCH_VISITS = 120000;

class MinHeap<T> {
  private items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size() {
    return this.items.length;
  }

  push(value: T) {
    this.items.push(value);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (!this.items.length) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[index], this.items[parent]) >= 0) {
        return;
      }
      const tmp = this.items[parent];
      this.items[parent] = this.items[index];
      this.items[index] = tmp;
      index = parent;
    }
  }

  private bubbleDown(index: number) {
    const length = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < length &&
        this.compare(this.items[left], this.items[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < length &&
        this.compare(this.items[right], this.items[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === index) {
        return;
      }
      const tmp = this.items[smallest];
      this.items[smallest] = this.items[index];
      this.items[index] = tmp;
      index = smallest;
    }
  }
}

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
  private lastFailure: {
    segmentIndex: number;
    reason:
      | 'start-nodes-not-in-graph'
      | 'target-nodes-not-in-graph'
      | 'no-path'
      | 'visit-cap-exceeded';
    visits: number;
  } | null = null;

  constructor(private readonly graph: RailGraph) {
    this.initializeDensity();
  }

  getLastFailure() {
    return this.lastFailure;
  }

  findRoute(platformNodes: PlatformNode[]): PathResult | null {
    this.lastFailure = null;
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
      const result = this.findPathBetween(current.nodes, next.nodes, index);
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
    segmentIndex: number,
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
    if (!startIds.length) {
      this.lastFailure = {
        segmentIndex,
        reason: 'start-nodes-not-in-graph',
        visits: 0,
      };
      return null;
    }
    if (!targetSet.size) {
      this.lastFailure = {
        segmentIndex,
        reason: 'target-nodes-not-in-graph',
        visits: 0,
      };
      return null;
    }
    const openSet = new MinHeap<Candidate>((a, b) => a.cost - b.cost);
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const visited = new Set<string>();
    for (const id of startIds) {
      distances.set(id, 0);
      previous.set(id, null);
      openSet.push({ id, cost: 0 });
    }
    let visits = 0;
    while (openSet.size) {
      const current = openSet.pop()!;
      const knownCost = distances.get(current.id) ?? Number.POSITIVE_INFINITY;
      if (current.cost > knownCost) {
        continue;
      }
      if (visited.has(current.id)) {
        continue;
      }
      visited.add(current.id);
      visits += 1;
      if (visits > MAX_SEARCH_VISITS) {
        this.lastFailure = {
          segmentIndex,
          reason: 'visit-cap-exceeded',
          visits,
        };
        return null;
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
    this.lastFailure = {
      segmentIndex,
      reason: 'no-path',
      visits,
    };
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
