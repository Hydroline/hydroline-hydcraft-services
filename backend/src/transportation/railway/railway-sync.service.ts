import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Prisma,
  TransportationRailwayEntityCategory,
  TransportationRailwaySyncJob,
  TransportationRailwaySyncStatus,
  TransportationRailwayMod,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HydrolineBeaconPoolService } from '../../lib/hydroline-beacon';
import { HydrolineBeaconEvent } from '../../lib/hydroline-beacon/beacon.client';
import {
  DEFAULT_RAILWAY_TYPE,
  RAILWAY_TYPE_CONFIG,
  RailwayTypeConfig,
} from './railway-type.config';

const BEACON_TIMEOUT_MS = 10000;
const QUERY_LIMIT = 200;
const UPSERT_BATCH_SIZE = 25;

type BeaconServerRecord = {
  id: string;
  displayName: string;
  beaconEndpoint: string;
  beaconKey: string;
  beaconRequestTimeoutMs?: number | null;
  beaconMaxRetry?: number | null;
  railwayMod: TransportationRailwayMod;
};

type QueryMtrEntitiesResponse = {
  success?: boolean;
  category?: string;
  rows?: Array<Record<string, unknown>>;
  limit?: number;
  offset?: number;
  truncated?: boolean;
};

type StoredJsonValue = Prisma.JsonNullValueInput | Prisma.InputJsonValue;

type RailwaySyncJobStatus = {
  id: string;
  serverId: string;
  status: TransportationRailwaySyncStatus;
  message: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

const CATEGORY_MAP: Array<{
  key: string;
  type: TransportationRailwayEntityCategory;
}> = [
  { key: 'depots', type: TransportationRailwayEntityCategory.DEPOT },
  {
    key: 'platforms',
    type: TransportationRailwayEntityCategory.PLATFORM,
  },
  { key: 'rails', type: TransportationRailwayEntityCategory.RAIL },
  { key: 'routes', type: TransportationRailwayEntityCategory.ROUTE },
  {
    key: 'signal-blocks',
    type: TransportationRailwayEntityCategory.SIGNAL_BLOCK,
  },
  { key: 'stations', type: TransportationRailwayEntityCategory.STATION },
];

@Injectable()
export class TransportationRailwaySyncService implements OnModuleInit {
  private readonly logger = new Logger(TransportationRailwaySyncService.name);
  private syncing = false;
  private runningServerJobs = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
  ) {}

  onModuleInit() {
    void this.ensureInitialSync();
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleScheduledSync() {
    await this.runSync();
  }

  private async ensureInitialSync() {
    try {
      await this.runSync();
    } catch (error) {
      this.logger.warn(
        `Initial railway sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async runSync() {
    if (this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      const servers = await this.listBeaconServers();
      servers.forEach((server) => this.ensureBeaconClient(server));
      await this.waitForBeaconConnections(servers.map((server) => server.id));
      for (const server of servers) {
        await this.syncServer(server);
      }
    } catch (error) {
      this.logger.error(
        `Railway sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.syncing = false;
    }
  }

  private async syncServer(server: BeaconServerRecord) {
    this.logger.log(`Syncing railway data for ${server.displayName}`);
    const syncMarker = new Date();
    for (const category of CATEGORY_MAP) {
      await this.syncCategory(server, category.key, category.type, syncMarker);
    }
  }

  async syncServerById(serverId: string) {
    const servers = await this.listBeaconServers();
    const target = servers.find((server) => server.id === serverId);
    if (!target) {
      throw new NotFoundException('未找到启用 Beacon 的服务器');
    }
    this.ensureBeaconClient(target);
    await this.waitForBeaconConnections([target.id]);
    await this.syncServer(target);
  }

  async enqueueSyncJob(
    serverId: string,
    initiatedById: string | null,
  ): Promise<RailwaySyncJobStatus> {
    const job = await this.prisma.transportationRailwaySyncJob.create({
      data: {
        serverId,
        initiatedById,
        status: TransportationRailwaySyncStatus.PENDING,
      },
    });
    void this.executeSyncJob(job.id).catch((error) =>
      this.logger.error(
        `Railway sync job ${job.id} failed to start: ${this.extractMessage(error)}`,
      ),
    );
    return this.buildJobStatus(job);
  }

  async getSyncJob(jobId: string): Promise<RailwaySyncJobStatus> {
    const job = await this.prisma.transportationRailwaySyncJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException('同步任务不存在');
    }
    return this.buildJobStatus(job);
  }

  async getLatestActiveJob(serverId: string) {
    const job = await this.prisma.transportationRailwaySyncJob.findFirst({
      where: {
        serverId,
        status: {
          in: [
            TransportationRailwaySyncStatus.PENDING,
            TransportationRailwaySyncStatus.RUNNING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.buildJobStatus(job) : null;
  }

  private async syncCategory(
    server: BeaconServerRecord,
    category: string,
    entityType: TransportationRailwayEntityCategory,
    syncMarker: Date,
  ) {
    let offset = 0;
    let truncated = false;
    const config = this.getRailwayModConfig(server.railwayMod);
    do {
      const response = await this.emitBeacon<QueryMtrEntitiesResponse>(
        server,
        config.queryEvent,
        {
          category,
          limit: QUERY_LIMIT,
          offset,
          includePayload: true,
        },
      );
      const rows = Array.isArray(response?.rows) ? response.rows : [];
      if (rows.length) {
        await this.upsertRowsInBatches(server, entityType, rows, syncMarker);
      }
      truncated = Boolean(response?.truncated);
      offset += rows.length;
    } while (truncated);

    await this.prisma.transportationRailwayEntity.deleteMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        category: entityType,
        syncedAt: { lt: syncMarker },
      },
    });
  }

  private async upsertEntity(
    server: BeaconServerRecord,
    category: TransportationRailwayEntityCategory,
    row: Record<string, unknown>,
    syncMarker: Date,
  ) {
    const entityId = this.readString(row.entity_id ?? row.node_pos);
    if (!entityId) {
      return;
    }
    const filePath = this.readString(row.file_path);
    const railwayMod = this.resolveRailwayMod(server.railwayMod);
    const dimensionContext =
      this.readString(row.dimension_context) ??
      this.inferDimensionContext(filePath, railwayMod);
    const payload = this.normalizePayload(row.payload);
    const lastUpdated = this.readTimestamp(row.last_updated);
    await this.prisma.transportationRailwayEntity.upsert({
      where: {
        serverId_railwayMod_category_entityId: {
          serverId: server.id,
          railwayMod,
          category,
          entityId,
        },
      },
      update: {
        railwayMod,
        dimensionContext,
        transportMode: this.readString(row.transport_mode),
        name: this.readString(row.name),
        color: this.readNumber(row.color),
        filePath,
        payload,
        lastBeaconUpdatedAt: lastUpdated,
        syncedAt: syncMarker,
      },
      create: {
        serverId: server.id,
        railwayMod,
        category,
        entityId,
        dimensionContext,
        transportMode: this.readString(row.transport_mode),
        name: this.readString(row.name),
        color: this.readNumber(row.color),
        filePath,
        payload,
        lastBeaconUpdatedAt: lastUpdated,
        syncedAt: syncMarker,
      },
    });
    if (dimensionContext) {
      await this.prisma.transportationRailwayDimension.upsert({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: server.id,
            railwayMod,
            dimensionContext,
          },
        },
        update: {
          railwayMod,
          namespace: this.extractNamespace(dimensionContext),
          dimension: this.extractDimension(dimensionContext),
          lastUpdated: syncMarker,
        },
        create: {
          serverId: server.id,
          railwayMod,
          dimensionContext,
          namespace: this.extractNamespace(dimensionContext),
          dimension: this.extractDimension(dimensionContext),
          lastUpdated: syncMarker,
        },
      });
    }
  }

  private async upsertRowsInBatches(
    server: BeaconServerRecord,
    category: TransportationRailwayEntityCategory,
    rows: Array<Record<string, unknown>>,
    syncMarker: Date,
  ) {
    const pending: Array<Promise<void>> = [];
    for (const row of rows) {
      pending.push(this.upsertEntity(server, category, row, syncMarker));
      if (pending.length >= UPSERT_BATCH_SIZE) {
        await Promise.all(pending);
        pending.length = 0;
      }
    }
    if (pending.length) {
      await Promise.all(pending);
    }
  }

  private normalizePayload(value: unknown): StoredJsonValue {
    if (!value) return Prisma.JsonNull;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Prisma.InputJsonValue;
      } catch (error) {
        this.logger.warn(
          `Failed to parse MTR payload: ${(error as Error).message}`,
        );
        return Prisma.JsonNull;
      }
    }
    if (typeof value === 'object') {
      return value as Prisma.InputJsonValue;
    }
    return Prisma.JsonNull;
  }

  private readString(value: unknown) {
    if (typeof value === 'string' && value.trim().length) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
    return null;
  }

  private readNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim().length) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }
    return null;
  }

  private readTimestamp(value: unknown) {
    const numeric = this.readNumber(value);
    if (numeric == null) {
      return null;
    }
    return new Date(numeric);
  }

  private extractNamespace(context: string) {
    const segments = context.split('/');
    return segments.length >= 2 ? segments[1] : null;
  }

  private extractDimension(context: string) {
    const segments = context.split('/');
    return segments.length >= 3 ? segments[2] : null;
  }

  private inferDimensionContext(
    filePath: string | null,
    type?: TransportationRailwayMod,
  ) {
    if (!filePath) {
      return null;
    }
    const config = this.getRailwayModConfig(type);
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    const idx = parts.findIndex((part) => part === config.dimensionPrefix);
    if (idx < 0) {
      return null;
    }
    if (idx + 2 < parts.length) {
      return `${config.dimensionPrefix}/${parts[idx + 1]}/${parts[idx + 2]}`;
    }
    if (idx + 1 < parts.length) {
      return `${config.dimensionPrefix}/${parts[idx + 1]}`;
    }
    return null;
  }

  private ensureBeaconClient(server: BeaconServerRecord) {
    this.beaconPool.getOrCreate({
      serverId: server.id,
      endpoint: server.beaconEndpoint,
      key: server.beaconKey,
      timeoutMs: server.beaconRequestTimeoutMs ?? undefined,
      maxRetry: server.beaconMaxRetry ?? undefined,
    });
  }

  private async waitForBeaconConnections(
    serverIds: string[],
    timeoutMs = 30000,
  ) {
    if (!serverIds.length) return;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const pending = serverIds.filter((serverId) => {
        const status = this.beaconPool.getStatus(serverId);
        return !status?.connected;
      });
      if (!pending.length) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    this.logger.warn(
      `Timed out waiting for Beacon connections for servers: ${serverIds.join(', ')}`,
    );
  }

  private async emitBeacon<T>(
    server: BeaconServerRecord,
    event: HydrolineBeaconEvent,
    payload: Record<string, unknown>,
  ) {
    const client = this.beaconPool.getOrCreate({
      serverId: server.id,
      endpoint: server.beaconEndpoint,
      key: server.beaconKey,
      timeoutMs: server.beaconRequestTimeoutMs ?? BEACON_TIMEOUT_MS,
      maxRetry: server.beaconMaxRetry ?? undefined,
    });
    return client.emit<T>(event, payload, {
      timeoutMs: server.beaconRequestTimeoutMs ?? BEACON_TIMEOUT_MS,
    });
  }

  private async executeSyncJob(jobId: string) {
    const job = await this.prisma.transportationRailwaySyncJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return;
    }
    if (this.runningServerJobs.has(job.serverId)) {
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.FAILED,
          completedAt: new Date(),
          message: '另一个同步任务正在运行，请稍后重试',
        },
      });
      return;
    }
    this.runningServerJobs.add(job.serverId);
    try {
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.RUNNING,
          startedAt: new Date(),
          message: null,
        },
      });
      await this.syncServerById(job.serverId);
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.SUCCEEDED,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.FAILED,
          completedAt: new Date(),
          message: this.extractMessage(error),
        },
      });
    } finally {
      this.runningServerJobs.delete(job.serverId);
    }
  }

  private buildJobStatus(
    job: TransportationRailwaySyncJob,
  ): RailwaySyncJobStatus {
    return {
      id: job.id,
      serverId: job.serverId,
      status: job.status as TransportationRailwaySyncStatus,
      message: job.message ?? null,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    };
  }

  private extractMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return '未知错误';
  }

  private async listBeaconServers() {
    const rows = await this.prisma.minecraftServer.findMany({
      where: {
        isActive: true,
        beaconEnabled: true,
        beaconEndpoint: { not: null },
        beaconKey: { not: null },
      },
      select: {
        id: true,
        displayName: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        transportationRailwayMod: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows
      .filter((row) => row.beaconEndpoint && row.beaconKey)
      .map((row) => ({
        id: row.id,
        displayName: row.displayName,
        beaconEndpoint: row.beaconEndpoint!,
        beaconKey: row.beaconKey!,
        beaconRequestTimeoutMs: row.beaconRequestTimeoutMs,
        beaconMaxRetry: row.beaconMaxRetry,
        railwayMod: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
        railwayType: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
      }));
  }

  private resolveRailwayMod(type?: TransportationRailwayMod) {
    if (type && RAILWAY_TYPE_CONFIG[type]) {
      return type;
    }
    return DEFAULT_RAILWAY_TYPE;
  }

  private getRailwayModConfig(
    type?: TransportationRailwayMod,
  ): RailwayTypeConfig {
    const resolved = this.resolveRailwayMod(type);
    return RAILWAY_TYPE_CONFIG[resolved];
  }
}
