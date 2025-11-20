import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HydrolineBeaconPoolService } from './pool.service';

interface BeaconServerRecord {
  id: string;
  beaconEnabled?: boolean | null;
  beaconEndpoint?: string | null;
  beaconKey?: string | null;
  beaconRequestTimeoutMs?: number | null;
  beaconMaxRetry?: number | null;
  updatedAt: Date | string;
}

@Injectable()
export class BeaconLibService implements OnModuleInit {
  private readonly logger = new Logger('BeaconService');
  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: HydrolineBeaconPoolService,
  ) {}

  async onModuleInit() {
    await this.refreshAll();
  }

  async refreshAll() {
    const servers = await this.prisma.minecraftServer.findMany({
      where: { beaconEnabled: true },
      select: {
        id: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        updatedAt: true,
      },
    });
    let created = 0;
    for (const s of servers) {
      if (this.isUsableConfig(s)) {
        this.pool.getOrCreate({
          serverId: s.id,
          endpoint: s.beaconEndpoint!,
          key: s.beaconKey!,
          timeoutMs: s.beaconRequestTimeoutMs ?? undefined,
          maxRetry: s.beaconMaxRetry ?? undefined,
        });
        created += 1;
      }
    }
    this.logger.log(`Beacon connection pool refreshed (${created} active)`);
  }

  async refreshForServer(id: string) {
    const s = await this.prisma.minecraftServer.findUnique({
      where: { id },
      select: {
        id: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        updatedAt: true,
      },
    });
    if (!s) return;
    if (!this.isUsableConfig(s)) {
      this.pool.remove(s.id);
      this.logger.warn(
        `Beacon config unusable; removed connection serverId=${s.id}`,
      );
      return;
    }
    this.pool.getOrCreate({
      serverId: s.id,
      endpoint: s.beaconEndpoint!,
      key: s.beaconKey!,
      timeoutMs: s.beaconRequestTimeoutMs ?? undefined,
      maxRetry: s.beaconMaxRetry ?? undefined,
    });
    this.logger.log(`Beacon connection ensured serverId=${s.id}`);
  }

  /**
   * 直接通过现有 WS 连接调用指定服务器的 get_server_time。
   * 若连接不存在或未就绪，返回 null，不抛出错误。
   */
  async fetchServerTimeNow(serverId: string) {
    const client = this.pool.getClientOrNull(serverId);
    if (!client) return null;
    try {
      const payload = await client.emit<unknown>(
        'get_server_time',
        {},
        {
          timeoutMs: this.defaultTimeoutMs,
        },
      );
      return payload;
    } catch (e) {
      this.logger.debug(
        `fetchServerTimeNow failed for ${serverId}: ${String(e)}`,
      );
      return null;
    }
  }

  /**
   * 直接通过现有 WS 连接调用指定服务器的 get_status。
   */
  async fetchStatusNow(serverId: string) {
    const client = this.pool.getClientOrNull(serverId);
    if (!client) return null;
    try {
      const payload = await client.emit<unknown>(
        'get_status',
        {},
        {
          timeoutMs: this.defaultTimeoutMs,
        },
      );
      return payload;
    } catch (e) {
      this.logger.debug(`fetchStatusNow failed for ${serverId}: ${String(e)}`);
      return null;
    }
  }

  private get defaultTimeoutMs() {
    // 与客户端默认超时建议保持一致
    return 8000;
  }

  private isUsableConfig(s: BeaconServerRecord): boolean {
    if (!s.beaconEnabled) return false;
    if (!s.beaconEndpoint || !s.beaconKey) return false;
    return true;
  }
}
