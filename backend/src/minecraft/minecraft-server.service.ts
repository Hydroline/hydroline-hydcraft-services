import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { MinecraftServerEdition, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMinecraftServerDto } from './dto/create-minecraft-server.dto';
import { UpdateMinecraftServerDto } from './dto/update-minecraft-server.dto';
import { MinecraftService } from './minecraft.service';
import { MinecraftPingScheduler } from './ping.scheduler';
import { PingMinecraftRequestDto } from './dto/ping-minecraft.dto';
import { McsmClient } from '../lib/mcsmanager/mcsmanager.client';
import { McsmInstanceDetail } from '../lib/mcsmanager/types';

@Injectable()
export class MinecraftServerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minecraftService: MinecraftService,
    private readonly pingScheduler: MinecraftPingScheduler,
  ) {}

  // 递归移除字符串中的 \u0000，避免 Postgres 22P05（text/json 不允许零字节）
  private sanitizeForPg(input: unknown): unknown {
    if (input == null) return input;
    if (typeof input === 'string') {
      // 仅移除 NUL，不动其他控制字符，避免破坏 MOTD 颜色码等
      // 使用字符代码过滤，避免正则中的控制字符误报
      let out = '';
      for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        if (ch === 0) continue; // 跳过 NUL
        out += input[i];
      }
      return out;
    }
    if (Array.isArray(input)) {
      return input.map((v) => this.sanitizeForPg(v));
    }
    if (typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = this.sanitizeForPg(v);
      }
      return out;
    }
    return input;
  }

  listServers(params: { keyword?: string } = {}) {
    const where: Prisma.MinecraftServerWhereInput | undefined = params.keyword
      ? {
          OR: [
            {
              displayName: {
                contains: params.keyword,
                mode: 'insensitive',
              },
            },
            {
              internalCodeCn: {
                contains: params.keyword,
                mode: 'insensitive',
              },
            },
            {
              internalCodeEn: {
                contains: params.keyword,
                mode: 'insensitive',
              },
            },
          ],
        }
      : undefined;

    return this.prisma.minecraftServer
      .findMany({
        where,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      })
      .then((list) => list.map((item) => this.stripSecret(item)));
  }

  async getServerById(id: string) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    return this.stripSecret(server);
  }

  async createServer(dto: CreateMinecraftServerDto, actorId?: string) {
    const payload = this.toCreatePayload(dto, actorId);
    const created = await this.prisma.minecraftServer.create({ data: payload });
    return this.stripSecret(created);
  }

  async updateServer(
    id: string,
    dto: UpdateMinecraftServerDto,
    actorId?: string,
  ) {
    await this.getServerById(id);
    const payload = this.toUpdatePayload(dto, actorId);
    const updated = await this.prisma.minecraftServer.update({
      where: { id },
      data: payload,
    });
    return this.stripSecret(updated);
  }

  async deleteServer(id: string) {
    await this.getServerById(id);
    await this.prisma.minecraftServer.delete({ where: { id } });
    return { success: true };
  }

  async pingManagedServer(id: string) {
    const server = await this.getServerById(id);
    const pingInput: PingMinecraftRequestDto = {
      host: server.host,
      port:
        server.port ??
        (server.edition === MinecraftServerEdition.BEDROCK ? 19132 : 25565),
      edition: server.edition,
    };
    try {
      const result = await this.minecraftService.pingServer(pingInput);
      // 记录历史（持久化前内容清洗，避免 22P05 Postgres NUL 问题）
      const safeRaw = this.sanitizeForPg(result.response) as object;
      const safeMotd = ((): string | null | undefined => {
        if (result.edition === MinecraftServerEdition.BEDROCK) {
          const v = (result.response as unknown as { motd?: string })?.motd;
          return (this.sanitizeForPg(v) as string | null | undefined) ?? null;
        }
        return undefined;
      })();

      await this.prisma.minecraftServerPingRecord.create({
        data: {
          serverId: server.id,
          edition: result.edition,
          latency: result.response.latency ?? null,
          onlinePlayers: result.response.players?.online ?? null,
          maxPlayers: result.response.players?.max ?? null,
          motd: safeMotd,
          raw: safeRaw,
        },
      });
      return {
        server,
        edition: result.edition,
        response: result.response,
      };
    } catch (err) {
      // 网络错误优雅处理
      if (err && typeof err === 'object' && 'message' in err) {
        const message = (err as Error).message;
        const isNetErr = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
          message,
        );
        if (isNetErr) {
          // 写入失败记录（仅时间戳 + 空字段）以便统计可用性

          await this.prisma.minecraftServerPingRecord.create({
            data: {
              serverId: server.id,
              edition: server.edition,
              latency: null,
              onlinePlayers: null,
              maxPlayers: null,
              motd: null,
              raw: { error: message },
            },
          });
          throw new HttpException(`Unable to connect to server (${message})`, 400);
        }
      }
      throw err;
    }
  }

  listPingHistory(serverId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    return (this.prisma as any).minecraftServerPingRecord.findMany({
      where: { serverId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }) as unknown;
  }

  async getPingSettings() {
    // 通过调度器读取以确保默认值已初始化
    return (await this.pingScheduler.getSettings()) as unknown;
  }

  async updatePingSettings(dto: {
    intervalMinutes?: number;
    retentionDays?: number;
  }) {
    // 委托调度器更新并动态调整定时任务
    return (await this.pingScheduler.updateSettings(dto)) as unknown;
  }

  async getMcsmStatus(id: string): Promise<{
    server: unknown;
    detail: McsmInstanceDetail;
  }> {
    const { server, client } = await this.prepareMcsmClient(id);
    const detail = await client.getInstanceDetail();
    // 当实例接口不返回 processInfo 时，尝试用 overview 的节点级数据补充
    if (!detail.processInfo || Object.keys(detail.processInfo).length === 0) {
      const overview = await client.getOverview();
      const remote = overview.remote?.find((r) => {
        return (
          r.id === server.mcsmDaemonId ||
          r.uuid === server.mcsmDaemonId ||
          r.uuid === server.mcsmInstanceUuid
        );
      });
      if (remote) {
        const chartPoint = remote.cpuMemChart?.[remote.cpuMemChart.length - 1];
        const cpuPercent =
          chartPoint?.cpu ?? (remote.process?.cpu ? remote.process.cpu / 1_000_000 : undefined);
        const memPercent =
          chartPoint?.mem ?? (remote.process?.memory ? remote.process.memory / 1024 / 1024 : undefined);
        detail.processInfo = {
          cpu: cpuPercent,
          memory: memPercent,
        };
      }
    }
    return { server: this.stripSecret(server), detail };
  }

  async getMcsmOutput(id: string, size?: number) {
    const { server, client } = await this.prepareMcsmClient(id);
    const output = await client.getOutputLog(size);
    return { server: this.stripSecret(server), output: output.output };
  }

  async sendMcsmCommand(id: string, command: string) {
    if (!command || command.trim().length === 0) {
      throw new HttpException('Command cannot be empty', 400);
    }
    const { server, client } = await this.prepareMcsmClient(id);
    const result = await client.sendCommand(command);
    return { server: this.stripSecret(server), result };
  }

  async startMcsmInstance(id: string) {
    const { server, client } = await this.prepareMcsmClient(id);
    const result = await client.startInstance();
    return { server: this.stripSecret(server), result };
  }

  async stopMcsmInstance(id: string) {
    const { server, client } = await this.prepareMcsmClient(id);
    const result = await client.stopInstance();
    return { server: this.stripSecret(server), result };
  }

  async restartMcsmInstance(id: string) {
    const { server, client } = await this.prepareMcsmClient(id);
    const result = await client.restartInstance();
    return { server: this.stripSecret(server), result };
  }

  async killMcsmInstance(id: string) {
    const { server, client } = await this.prepareMcsmClient(id);
    const result = await client.killInstance();
    return { server: this.stripSecret(server), result };
  }

  private toCreatePayload(
    dto: CreateMinecraftServerDto,
    actorId?: string,
  ): Prisma.MinecraftServerCreateInput {
    return {
      displayName: dto.displayName,
      internalCodeCn: this.normalizeCode(dto.internalCodeCn),
      internalCodeEn: this.normalizeCode(dto.internalCodeEn),
      host: dto.host,
      port: dto.port,
      edition: dto.edition ?? MinecraftServerEdition.JAVA,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
      displayOrder: dto.displayOrder ?? 0,
      metadata:
        dto.metadata !== undefined
          ? (dto.metadata as Prisma.InputJsonValue)
          : undefined,
      mcsmPanelUrl: dto.mcsmPanelUrl,
      mcsmDaemonId: dto.mcsmDaemonId,
      mcsmInstanceUuid: dto.mcsmInstanceUuid,
      mcsmApiKey: dto.mcsmApiKey,
      mcsmRequestTimeoutMs: dto.mcsmRequestTimeoutMs,
      createdBy: actorId ? { connect: { id: actorId } } : undefined,
      updatedBy: actorId ? { connect: { id: actorId } } : undefined,
    };
  }

  private toUpdatePayload(
    dto: UpdateMinecraftServerDto,
    actorId?: string,
  ): Prisma.MinecraftServerUpdateInput {
    const payload: Prisma.MinecraftServerUpdateInput = {
      updatedBy: actorId ? { connect: { id: actorId } } : undefined,
    };
    if (dto.displayName !== undefined) {
      payload.displayName = dto.displayName;
    }
    if (dto.internalCodeCn !== undefined) {
      payload.internalCodeCn = this.normalizeCode(dto.internalCodeCn);
    }
    if (dto.internalCodeEn !== undefined) {
      payload.internalCodeEn = this.normalizeCode(dto.internalCodeEn);
    }
    if (dto.host !== undefined) {
      payload.host = dto.host;
    }
    if (dto.port !== undefined) {
      payload.port = dto.port;
    }
    if (dto.edition !== undefined) {
      payload.edition = dto.edition;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description;
    }
    if (dto.isActive !== undefined) {
      payload.isActive = dto.isActive;
    }
    if (dto.displayOrder !== undefined) {
      payload.displayOrder = dto.displayOrder;
    }
    if (dto.metadata !== undefined) {
      payload.metadata = dto.metadata as Prisma.InputJsonValue;
    }
    if (dto.mcsmPanelUrl !== undefined) {
      payload.mcsmPanelUrl = dto.mcsmPanelUrl;
    }
    if (dto.mcsmDaemonId !== undefined) {
      payload.mcsmDaemonId = dto.mcsmDaemonId;
    }
    if (dto.mcsmInstanceUuid !== undefined) {
      payload.mcsmInstanceUuid = dto.mcsmInstanceUuid;
    }
    if (dto.mcsmApiKey !== undefined) {
      payload.mcsmApiKey = dto.mcsmApiKey;
    }
    if (dto.mcsmRequestTimeoutMs !== undefined) {
      payload.mcsmRequestTimeoutMs = dto.mcsmRequestTimeoutMs;
    }
    return payload;
  }

  private normalizeCode(value: string) {
    return value.trim();
  }

  private stripSecret<T extends { mcsmApiKey?: string | null }>(server: T) {
    if (!server) return server;
    const { mcsmApiKey: apiKey, ...rest } = server as Record<string, unknown>;
    return {
      ...rest,
      mcsmConfigured: Boolean(apiKey),
    } as Omit<T, 'mcsmApiKey'> & { mcsmConfigured: boolean };
  }

  private async getServerWithSecret(id: string) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    return server;
  }

  private async prepareMcsmClient(id: string) {
    const server = await this.getServerWithSecret(id);
    if (
      !server.mcsmPanelUrl ||
      !server.mcsmDaemonId ||
      !server.mcsmInstanceUuid ||
      !server.mcsmApiKey
    ) {
      throw new HttpException(
        'MCSM 配置不完整：请设置面板地址、Daemon ID、Instance UUID 与 API Key',
        400,
      );
    }
    const client = new McsmClient({
      baseUrl: server.mcsmPanelUrl,
      apiKey: server.mcsmApiKey,
      uuid: server.mcsmInstanceUuid,
      daemonId: server.mcsmDaemonId,
      timeoutMs: server.mcsmRequestTimeoutMs ?? undefined,
    });
    return { server, client };
  }
}
