import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LifecycleEventType, Prisma, RankSyncStatus } from '@prisma/client';
import type { RankSyncJob } from '@prisma/client';
import { HydrolineBeaconEvent } from '../lib/hydroline-beacon/beacon.client';
import { HydrolineBeaconPoolService } from '../lib/hydroline-beacon/pool.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RankSnapshotPayload,
  RankSnapshotService,
} from './rank-snapshot.service';
import { AuthmeService } from '../authme/authme.service';
import type { AuthmeUser } from '../authme/authme.interfaces';
import { RANK_CHUNK_SIZE, RANK_STAT_KEYS } from './constants';

const IDENTITY_PAGE_SIZE = 1000;
const MAX_IDENTITY_PAGES = 100;
const BEACON_TIMEOUT_MS = 10000;
const ADVANCEMENT_PAGE_SIZE = 1000;
const ADVANCEMENT_MAX_PAGES = 10;
const ADVANCEMENT_FETCH_CONCURRENCY = 6;
const MAX_SYNC_AGE_MS = 24 * 60 * 60 * 1000;

type BeaconIdentity = {
  player_uuid?: string | null;
  player_name?: string | null;
};

type BeaconBalanceEntry = {
  player?: string;
  balance?: number | string | null;
};

type BeaconGetPlayersDataResponse = {
  success?: boolean;
  stats?: Record<string, Record<string, unknown>>;
  balances?: BeaconBalanceEntry[];
};

type BeaconIdentityListResponse = {
  success?: boolean;
  total?: number;
  page?: number;
  page_size?: number;
  records?: BeaconIdentity[];
};

type BeaconPlayerAdvancementsResponse = {
  success?: boolean;
  error?: string;
  total?: number | string;
  advancements?: Record<string, unknown>;
};

type BindingWithUser = Prisma.UserAuthmeBindingGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        createdAt: true;
        joinDate: true;
        lastLoginAt: true;
        profile: { select: { displayName: true } };
      };
    };
  };
}>;

export type RankSyncJobStatus = {
  id: string;
  serverId: string | null;
  initiatedById: string | null;
  status: RankSyncStatus;
  startedAt: string;
  completedAt: string | null;
  message: string | null;
};

@Injectable()
export class RankSyncService implements OnModuleInit {
  private readonly logger = new Logger(RankSyncService.name);
  private activeJobId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
    private readonly snapshotService: RankSnapshotService,
    private readonly authmeService: AuthmeService,
  ) {}

  onModuleInit() {
    void this.ensureInitialSync();
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailySync() {
    try {
      await this.beginSync(null, null, false);
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        this.logger.error('Daily rank sync failed', error);
      }
    }
  }

  async requestSync(serverId?: string, initiatedById?: string | null) {
    return this.beginSync(serverId ?? null, initiatedById ?? null, true);
  }

  async getJobStatus(jobId: string): Promise<RankSyncJobStatus> {
    const job = await this.prisma.rankSyncJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new Error('Rank sync job not found');
    }
    return this.buildJobStatus(job);
  }

  private async ensureInitialSync() {
    try {
      const serverIds = await this.loadBeaconServerIds();
      if (!serverIds.length) {
        return;
      }
      const now = Date.now();
      for (const serverId of serverIds) {
        const latestUpdate =
          await this.snapshotService.getLatestUpdate(serverId);
        if (!latestUpdate) {
          await this.beginSync(null, null, false);
          return;
        }
        if (now - latestUpdate.getTime() > MAX_SYNC_AGE_MS) {
          await this.beginSync(null, null, false);
          return;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to ensure initial rank sync: ${this.extractMessage(error)}`,
      );
    }
  }

  private async beginSync(
    serverId: string | null,
    initiatedById: string | null,
    forceRefresh: boolean,
  ) {
    if (this.activeJobId) {
      throw new ConflictException('Rank sync is already in progress');
    }
    const job = await this.prisma.rankSyncJob.create({
      data: {
        serverId,
        initiatedById,
        status: RankSyncStatus.PENDING,
        startedAt: new Date(),
      },
    });
    this.activeJobId = job.id;
    void this.executeJob(job.id, forceRefresh);
    return this.buildJobStatus(job);
  }

  private async executeJob(jobId: string, forceRefresh: boolean) {
    try {
      await this.prisma.rankSyncJob.update({
        where: { id: jobId },
        data: { status: RankSyncStatus.RUNNING, startedAt: new Date() },
      });
      const job = await this.prisma.rankSyncJob.findUnique({
        where: { id: jobId },
      });
      if (!job) {
        throw new Error('Rank sync job not found');
      }
      const serverIds = job.serverId
        ? [job.serverId]
        : await this.loadBeaconServerIds();
      for (const serverId of serverIds) {
        await this.syncServer(
          serverId,
          forceRefresh && Boolean(job.initiatedById),
        );
      }
      await this.prisma.rankSyncJob.update({
        where: { id: jobId },
        data: {
          status: RankSyncStatus.SUCCESS,
          completedAt: new Date(),
          message: 'Synced',
        },
      });
      if (job.initiatedById) {
        await this.logLifecycle(
          job.initiatedById,
          job.id,
          job.serverId ?? null,
        );
      }
    } catch (error) {
      this.logger.error('Rank sync execution failed', error);
      await this.prisma.rankSyncJob.update({
        where: { id: jobId },
        data: {
          status: RankSyncStatus.FAILED,
          completedAt: new Date(),
          message: this.extractMessage(error),
        },
      });
    } finally {
      this.activeJobId = null;
    }
  }

  private extractMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error ?? 'Unknown error');
  }

  private async loadBeaconServerIds() {
    const servers = await this.prisma.minecraftServer.findMany({
      where: {
        isActive: true,
        beaconEnabled: true,
        beaconEndpoint: { not: null },
        beaconKey: { not: null },
      },
      select: { id: true },
    });
    return servers.map((entry) => entry.id);
  }

  private async syncServer(serverId: string, forceRefresh: boolean) {
    if (forceRefresh) {
      await this.tryForceUpdate(serverId);
    }
    this.logger.log(`Syncing rank data for server ${serverId}`);
    const identities = await this.listPlayerIdentities(serverId);
    if (!identities.length) {
      return;
    }
    const uuids = identities
      .map((entry) => entry.player_uuid)
      .filter((uuid): uuid is string => Boolean(uuid));
    const bindings = await this.prisma.userAuthmeBinding.findMany({
      where: { authmeUuid: { in: uuids } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            joinDate: true,
            lastLoginAt: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    const bindingMap = new Map<string, BindingWithUser>();
    for (const binding of bindings) {
      if (binding.authmeUuid) {
        bindingMap.set(binding.authmeUuid, binding);
      }
    }
    const accountMap = await this.loadAuthmeAccounts(bindings);
    const fallbackAccountCache = new Map<string, AuthmeUser | null>();
    const chunks = this.chunkArray(identities, RANK_CHUNK_SIZE);
    const advancementCache = new Map<string, number>();
    for (const chunk of chunks) {
      const uuidsChunk = chunk
        .map((entry) => entry.player_uuid)
        .filter((uuid): uuid is string => Boolean(uuid));
      if (!uuidsChunk.length) {
        continue;
      }
      const namesChunk = chunk
        .map((entry) => entry.player_name)
        .filter(
          (name): name is string =>
            typeof name === 'string' && name.trim().length > 0,
        );
      const response = await this.emitBeacon<BeaconGetPlayersDataResponse>(
        serverId,
        'get_players_data',
        {
          playerUuids: uuidsChunk,
          playerNames: namesChunk,
          includeBalance: true,
          statKeys: RANK_STAT_KEYS,
        },
      );
      if (response?.success === false) {
        this.logger.warn(
          `Beacon get_players_data returned failure for server ${serverId}`,
        );
        continue;
      }
      const stats = response?.stats ?? {};
      const balances = Array.isArray(response?.balances)
        ? response.balances
        : [];
      const balanceMap = new Map<string, number>();
      for (const entry of balances) {
        if (!entry?.player) continue;
        const value = Number(entry.balance);
        if (Number.isFinite(value)) {
          balanceMap.set(entry.player, value);
        }
      }
      const fallbackNamesToFetch = chunk.reduce<string[]>((acc, identity) => {
        if (identity.player_uuid && bindingMap.has(identity.player_uuid)) {
          return acc;
        }
        const key = this.normalizeAuthmeCacheKey(identity.player_name);
        if (!key) {
          return acc;
        }
        if (fallbackAccountCache.has(key)) {
          return acc;
        }
        acc.push(key);
        return acc;
      }, []);
      if (fallbackNamesToFetch.length) {
        const fetched =
          await this.fetchAuthmeAccountsByNames(fallbackNamesToFetch);
        for (const [key, value] of fetched) {
          fallbackAccountCache.set(key, value);
        }
      }

      const missingAdvancementIdentities = chunk.filter((identity) => {
        if (!identity.player_uuid && !identity.player_name) {
          return false;
        }
        const cached = this.lookupCachedAchievementCount(
          advancementCache,
          identity,
        );
        return cached === undefined;
      });
      if (missingAdvancementIdentities.length) {
        const counts = await this.fetchAdvancementCounts(
          serverId,
          missingAdvancementIdentities,
        );
        for (const [key, value] of counts) {
          advancementCache.set(key, value);
        }
      }

      for (const identity of chunk) {
        const playerUuid = identity.player_uuid;
        if (!playerUuid) continue;
        const binding = bindingMap.get(playerUuid);
        const account = binding
          ? (accountMap.get(binding.authmeUsername) ?? null)
          : this.getCachedAuthmeAccount(
              identity.player_name,
              fallbackAccountCache,
            );
        const statsEntry = stats[playerUuid] ?? {};
        const normalized = this.normalizeStats(statsEntry);
        const balanceKey =
          identity.player_name ?? binding?.user?.name ?? playerUuid;
        const portalLastLoginAt = binding?.user?.lastLoginAt ?? null;
        const authmeLastLoginAt = this.fromEpochSecondsOrMillis(
          account?.lastlogin,
        );
        const portalRegisteredAt =
          binding?.user?.joinDate ?? binding?.user?.createdAt ?? null;
        const authmeRegisteredAt = this.fromEpochSecondsOrMillis(
          account?.regdate,
        );
        const achievementsCount =
          this.lookupCachedAchievementCount(advancementCache, identity) ?? 0;
        const snapshot: RankSnapshotPayload = {
          serverId,
          playerUuid,
          playerName: identity.player_name ?? binding?.authmeUsername ?? null,
          bindingId: binding?.id ?? null,
          userId: binding?.userId ?? null,
          displayName: binding
            ? (binding.user?.name ?? binding.authmeUsername ?? null)
            : null,
          lastLoginAt: authmeLastLoginAt ?? portalLastLoginAt,
          registeredAt: authmeRegisteredAt ?? portalRegisteredAt,
          walkDistanceKm: normalized.walkDistanceKm,
          flyDistanceKm: normalized.flyDistanceKm,
          swimDistanceKm: normalized.swimDistanceKm,
          achievements: achievementsCount,
          playerKilledByCount: normalized.playerKilledByCount,
          deaths: normalized.deaths,
          jumpCount: normalized.jumpCount,
          playTimeHours: normalized.playTimeHours,
          useWandCount: normalized.useWandCount,
          logoutCount: normalized.logoutCount,
          mtrBalance: balanceMap.get(balanceKey) ?? 0,
          metrics: statsEntry,
          stats: statsEntry,
        };
        await this.snapshotService.upsert(snapshot);
      }
    }
  }

  private async listPlayerIdentities(serverId: string) {
    const result: BeaconIdentity[] = [];
    let page = 1;
    while (page <= MAX_IDENTITY_PAGES) {
      const response = await this.emitBeacon<BeaconIdentityListResponse>(
        serverId,
        'list_player_identities',
        {
          page,
          pageSize: IDENTITY_PAGE_SIZE,
        },
      );
      if (!response?.records?.length) {
        break;
      }
      result.push(...response.records);
      const total = response.total ?? 0;
      if (total && result.length >= total) {
        break;
      }
      if ((response.records?.length ?? 0) < IDENTITY_PAGE_SIZE) {
        break;
      }
      page += 1;
    }
    return result;
  }

  private async emitBeacon<T>(
    serverId: string,
    event: HydrolineBeaconEvent,
    payload: Record<string, unknown>,
  ) {
    const client = this.beaconPool.getClientOrNull(serverId);
    if (!client) {
      throw new Error(`Beacon connection not ready for server ${serverId}`);
    }
    return client.emit<T>(event, payload, { timeoutMs: BEACON_TIMEOUT_MS });
  }

  private async tryForceUpdate(serverId: string) {
    try {
      await this.emitBeacon(serverId, 'force_update', {});
    } catch (error) {
      this.logger.warn(
        `force_update failed for ${serverId}: ${this.extractMessage(error)}`,
      );
    }
  }

  private normalizeStats(stats: Record<string, unknown>) {
    const readNumber = (key: string) => {
      const value = stats[key];
      if (value === undefined || value === null) return 0;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };
    return {
      walkDistanceKm: this.toKilometers(
        readNumber('minecraft:custom:minecraft:walk_one_cm'),
      ),
      flyDistanceKm: this.toKilometers(
        readNumber('minecraft:custom:minecraft:fly_one_cm'),
      ),
      swimDistanceKm: this.toKilometers(
        readNumber('minecraft:custom:minecraft:swim_one_cm'),
      ),
      playerKilledByCount: readNumber('minecraft:killed_by:minecraft:player'),
      deaths: readNumber('minecraft:custom:minecraft:deaths'),
      jumpCount: readNumber('minecraft:custom:minecraft:jump'),
      playTimeHours: this.toHours(
        readNumber('minecraft:custom:minecraft:play_time'),
      ),
      useWandCount: readNumber('minecraft:custom:minecraft:use_wand'),
      logoutCount: readNumber('minecraft:custom:minecraft:leave_game'),
    };
  }

  private async loadAuthmeAccounts(bindings: BindingWithUser[]) {
    const map = new Map<string, AuthmeUser | null>();
    const queue = [...bindings];
    const concurrency = 6;
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length) {
          const binding = queue.shift();
          if (!binding || !binding.authmeUsername) continue;
          if (map.has(binding.authmeUsername)) continue;
          try {
            const account = await this.authmeService.getAccount(
              binding.authmeUsername,
            );
            map.set(binding.authmeUsername, account);
          } catch (error) {
            this.logger.warn(
              `Failed to load AuthMe account ${binding.authmeUsername}: ${this.extractMessage(error)}`,
            );
            map.set(binding.authmeUsername, null);
          }
        }
      },
    );
    await Promise.all(workers);
    return map;
  }

  private normalizeAuthmeCacheKey(name?: string | null) {
    if (typeof name !== 'string') {
      return null;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.toLowerCase();
  }

  private getCachedAuthmeAccount(
    name: string | null | undefined,
    cache: Map<string, AuthmeUser | null>,
  ) {
    const key = this.normalizeAuthmeCacheKey(name);
    if (!key) {
      return null;
    }
    return cache.get(key) ?? null;
  }

  private async fetchAuthmeAccountsByNames(names: string[]) {
    const normalized = Array.from(
      new Set(
        names
          .map((name) => this.normalizeAuthmeCacheKey(name))
          .filter((name): name is string => Boolean(name)),
      ),
    );
    const result = new Map<string, AuthmeUser | null>();
    const queue = [...normalized];
    const concurrency = 6;
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length) {
          const key = queue.shift();
          if (!key) continue;
          if (result.has(key)) continue;
          try {
            const account = await this.authmeService.getAccount(key);
            result.set(key, account);
          } catch (error) {
            this.logger.warn(
              `Failed to load AuthMe account ${key}: ${this.extractMessage(error)}`,
            );
            result.set(key, null);
          }
        }
      },
    );
    await Promise.all(workers);
    return result;
  }

  private lookupCachedAchievementCount(
    cache: Map<string, number>,
    identity: BeaconIdentity,
  ) {
    if (identity.player_uuid && cache.has(identity.player_uuid)) {
      return cache.get(identity.player_uuid);
    }
    const nameKey = this.normalizeAuthmeCacheKey(identity.player_name);
    if (nameKey && cache.has(nameKey)) {
      return cache.get(nameKey);
    }
    return undefined;
  }

  private async fetchAdvancementCounts(
    serverId: string,
    identities: BeaconIdentity[],
  ) {
    const result = new Map<string, number>();
    const queue = identities.filter(
      (identity) => identity.player_uuid || identity.player_name,
    );
    if (!queue.length) {
      return result;
    }
    const concurrency = Math.min(ADVANCEMENT_FETCH_CONCURRENCY, queue.length);
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const identity = queue.shift();
        if (!identity) continue;
        try {
          const count = await this.countPlayerAdvancements(serverId, identity);
          if (identity.player_uuid) {
            result.set(identity.player_uuid, count);
          }
          const nameKey = this.normalizeAuthmeCacheKey(identity.player_name);
          if (nameKey) {
            result.set(nameKey, count);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to load advancements for ${
              identity.player_name ?? identity.player_uuid ?? 'unknown player'
            }: ${this.extractMessage(error)}`,
          );
        }
      }
    });
    await Promise.all(workers);
    return result;
  }

  private async countPlayerAdvancements(
    serverId: string,
    identity: BeaconIdentity,
  ) {
    if (!identity.player_uuid && !identity.player_name) {
      return 0;
    }
    const basePayload: Record<string, unknown> = {};
    if (identity.player_uuid) {
      basePayload.playerUuid = identity.player_uuid;
    }
    if (identity.player_name) {
      basePayload.playerName = identity.player_name;
    }
    let completedCount = 0;
    let processedEntries = 0;
    let declaredTotal: number | null = null;
    for (let page = 1; page <= ADVANCEMENT_MAX_PAGES; page += 1) {
      const response = await this.emitBeacon<BeaconPlayerAdvancementsResponse>(
        serverId,
        'get_player_advancements',
        {
          ...basePayload,
          page,
          pageSize: ADVANCEMENT_PAGE_SIZE,
        },
      );
      if (!response || response.success === false) {
        throw new Error(
          response?.error ??
            'Beacon 未返回玩家成就信息 (get_player_advancements)',
        );
      }
      const entries = Object.values(response.advancements ?? {});
      for (const raw of entries) {
        if (typeof raw !== 'string') continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.done === true) {
            completedCount += 1;
          }
        } catch {
          continue;
        }
      }
      processedEntries += entries.length;
      const total = this.parseBeaconTotal(response.total);
      if (total !== null) {
        declaredTotal = total;
      }
      if (
        entries.length === 0 ||
        entries.length < ADVANCEMENT_PAGE_SIZE ||
        (declaredTotal !== null && processedEntries >= declaredTotal)
      ) {
        break;
      }
    }
    if (declaredTotal !== null && processedEntries < declaredTotal) {
      this.logger.warn(
        `Advancement scan incomplete for ${
          identity.player_name ?? identity.player_uuid ?? 'unknown player'
        } on server ${serverId}`,
      );
    }
    return completedCount;
  }

  private parseBeaconTotal(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private toKilometers(value: number | null) {
    if (value == null) return 0;
    return value / 100000;
  }

  private toHours(value: number | null) {
    if (value == null) return 0;
    return value / 72000;
  }

  private chunkArray<T>(items: T[], size: number) {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size));
    }
    return result;
  }

  private fromEpochSecondsOrMillis(value?: number | null) {
    if (value === null || value === undefined) {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    const epochMs = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(epochMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private buildJobStatus(job: RankSyncJob): RankSyncJobStatus {
    return {
      id: job.id,
      serverId: job.serverId ?? null,
      initiatedById: job.initiatedById ?? null,
      status: job.status,
      startedAt: job.startedAt?.toISOString() ?? new Date().toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      message: job.message ?? null,
    };
  }

  private async logLifecycle(
    userId: string,
    jobId: string,
    serverId: string | null,
  ) {
    await this.prisma.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.OTHER,
        occurredAt: new Date(),
        source: 'rank-sync',
        notes: `Rank sync ${jobId}`,
        metadata: {
          jobId,
          serverId,
        },
      },
    });
  }
}
