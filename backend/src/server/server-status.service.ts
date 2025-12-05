import { Injectable, Logger } from '@nestjs/common';
import { MinecraftServer, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MinecraftServerService } from '../minecraft/minecraft-server.service';
import { HydrolineBeaconPoolService } from '../lib/hydroline-beacon';

export type ServerStatusHistoryPoint = {
  timestamp: string;
  latency?: number | null;
  onlinePlayers?: number | null;
};

export type ServerStatusLatest = {
  latency?: number | null;
  onlinePlayers?: number | null;
  maxPlayers?: number | null;
  versionLabel?: string | null;
  fetchedAt: string;
};

export type ServerStatusItem = {
  id: string;
  code: string;
  displayName: string;
  edition: 'JAVA' | 'BEDROCK';
  host: string;
  port: number;
  description?: string | null;
  ping: {
    latest?: ServerStatusLatest;
    history: ServerStatusHistoryPoint[];
  };
  mcsm: {
    configured: boolean;
    status?: number | null;
  };
  beacon: {
    configured: boolean;
    connection: ReturnType<HydrolineBeaconPoolService['getStatus']> | null;
  };
};

@Injectable()
export class ServerStatusService {
  private readonly logger = new Logger(ServerStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minecraftServers: MinecraftServerService,
    private readonly beaconPool: HydrolineBeaconPoolService,
  ) {}

  async getPublicServerStatus(): Promise<{ servers: ServerStatusItem[] }> {
    const servers = await this.prisma.minecraftServer.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!servers.length) {
      return { servers: [] };
    }
    const items = await Promise.all(
      servers.map((server) => this.buildServerStatus(server)),
    );
    return { servers: items };
  }

  private async buildServerStatus(
    server: MinecraftServer,
  ): Promise<ServerStatusItem> {
    const pingSummary = await this.loadServerPingSummary(server.id);
    const mcsm = await this.loadMcsmStatusPreview(server);
    const beacon = this.buildBeaconStatus(server);
    return {
      id: server.id,
      displayName: server.displayName,
      code: `${server.internalCodeCn} / ${server.internalCodeEn}`,
      edition: server.edition as 'JAVA' | 'BEDROCK',
      host: server.host,
      port: server.port,
      description: server.description ?? null,
      ping: {
        latest: pingSummary.latest,
        history: pingSummary.history,
      },
      mcsm,
      beacon,
    };
  }

  private async loadServerPingSummary(serverId: string) {
    const records = await this.prisma.minecraftServerPingRecord.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    const history = records
      .slice()
      .reverse()
      .map((record) => ({
        timestamp: record.createdAt.toISOString(),
        latency: record.latency,
        onlinePlayers: record.onlinePlayers,
      }));
    const latestRecord = records[0];
    const latest = latestRecord
      ? {
          latency: latestRecord.latency,
          onlinePlayers: latestRecord.onlinePlayers,
          maxPlayers: latestRecord.maxPlayers,
          versionLabel: this.extractVersionLabel(latestRecord.raw),
          fetchedAt: latestRecord.createdAt.toISOString(),
        }
      : undefined;
    return { latest, history };
  }

  private extractVersionLabel(
    payload: Prisma.JsonValue | null | undefined,
  ): string | null {
    if (payload == null) {
      return null;
    }
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        return this.extractVersionLabel(parsed);
      } catch {
        return trimmed;
      }
    }
    if (typeof payload === 'object') {
      if (Array.isArray(payload)) {
        return null;
      }
      const record = payload as Record<string, unknown>;
      const candidate =
        record.version ??
        record.edition ??
        record.versionText ??
        record.versionName;
      const label = this.extractVersionLabelFromField(candidate);
      if (label) {
        return label;
      }
    }
    return null;
  }

  private extractVersionLabelFromField(field: unknown): string | null {
    if (typeof field === 'string') {
      const trimmed = field.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof field === 'object' && field !== null) {
      const record = field as Record<string, unknown>;
      if (typeof record.name === 'string' && record.name.trim()) {
        return record.name.trim();
      }
      if (typeof record.version === 'string' && record.version.trim()) {
        return record.version.trim();
      }
      if (typeof record.protocol === 'number') {
        return `Protocol ${record.protocol}`;
      }
    }
    return null;
  }

  private async loadMcsmStatusPreview(server: MinecraftServer) {
    const configured =
      Boolean(server.mcsmPanelUrl) &&
      Boolean(server.mcsmDaemonId) &&
      Boolean(server.mcsmInstanceUuid) &&
      Boolean(server.mcsmApiKey);
    if (!configured) {
      return { configured: false };
    }
    try {
      const response = await this.minecraftServers.getMcsmStatus(server.id);
      const status =
        response?.detail && typeof response.detail.status === 'number'
          ? response.detail.status
          : undefined;
      return { configured: true, status };
    } catch (error) {
      this.logger.debug(
        `MCSM status preview failed for ${server.id}: ${String(error)}`,
      );
      return { configured: true };
    }
  }

  private buildBeaconStatus(server: MinecraftServer) {
    const configured =
      Boolean(server.beaconEnabled) &&
      Boolean(server.beaconEndpoint) &&
      Boolean(server.beaconKey);
    const connection = configured
      ? (this.beaconPool.getStatus(server.id) ?? null)
      : null;
    return {
      configured,
      connection,
    };
  }
}
