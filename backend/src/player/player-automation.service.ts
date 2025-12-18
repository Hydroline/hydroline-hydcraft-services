import { setTimeout as delay } from 'node:timers/promises';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LifecycleEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthmeService } from '../authme/authme.service';
import { LuckpermsService } from '../luckperms/luckperms.service';
import { MinecraftServerService } from '../minecraft/minecraft-server.service';
import {
  buildAuthmeChangePasswordCommand,
  buildAuthmeForceLoginCommand,
} from '../lib/authme/authme.commands';
import { buildLuckpermsSetParentCommand } from '../lib/luckperms/luckperms.commands';
import type { UserAuthmeBinding } from '@prisma/client';
import type { LuckpermsPlayer } from '../luckperms/luckperms.interfaces';

type LifecycleMetadata = Prisma.JsonObject & {
  action: string;
  status: 'PENDING' | 'EXECUTING' | 'VERIFYING' | 'SUCCESS' | 'FAILED';
  bindingId: string;
  identifier: string;
  server: { id: string; name: string } | null;
  targetGroup?: string | null;
  previousGroup?: string | null;
  reason?: string | null;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  verificationAttempts?: number;
  error?: string | null;
  resultMessage?: string | null;
};

@Injectable()
export class PlayerAutomationService {
  private readonly logger = new Logger(PlayerAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authmeService: AuthmeService,
    private readonly luckpermsService: LuckpermsService,
    private readonly minecraftServers: MinecraftServerService,
  ) {}

  async submitAuthmePasswordReset(
    userId: string,
    payload: {
      bindingId?: string | null;
      serverId: string;
      password: string;
      reason?: string | null;
    },
  ) {
    const binding = await this.resolveBinding(userId, payload.bindingId);
    const server = await this.resolveServer(payload.serverId);
    const identifier = this.resolveIdentifier(binding);
    const metadata: LifecycleMetadata = {
      action: 'authme.password-reset',
      status: 'PENDING',
      bindingId: binding.id,
      identifier,
      server,
      reason: this.toNullableString(payload.reason),
      requestedAt: new Date().toISOString(),
    };
    const event = await this.createLifecycleEvent(
      userId,
      'portal.player.authme-reset',
      metadata,
      this.toNullableString(payload.reason),
    );
    this.runDetached('authme-password-reset', () =>
      this.processAuthmePasswordReset(event.id, {
        binding,
        serverId: payload.serverId,
        identifier,
        password: payload.password,
      }),
    );
    return { success: true, requestId: event.id } as const;
  }

  async submitAuthmeForceLogin(
    userId: string,
    payload: {
      bindingId?: string | null;
      serverId: string;
      reason?: string | null;
    },
  ) {
    const binding = await this.resolveBinding(userId, payload.bindingId);
    const server = await this.resolveServer(payload.serverId);
    const identifier = this.resolveIdentifier(binding);
    const metadata: LifecycleMetadata = {
      action: 'authme.force-login',
      status: 'PENDING',
      bindingId: binding.id,
      identifier,
      server,
      reason: this.toNullableString(payload.reason),
      requestedAt: new Date().toISOString(),
    };
    const event = await this.createLifecycleEvent(
      userId,
      'portal.player.force-login',
      metadata,
      this.toNullableString(payload.reason),
    );
    this.runDetached('authme-force-login', () =>
      this.processAuthmeForceLogin(event.id, {
        serverId: payload.serverId,
        identifier,
      }),
    );
    return { success: true, requestId: event.id } as const;
  }

  async submitPermissionGroupAdjustment(
    userId: string,
    payload: {
      bindingId?: string | null;
      serverId: string;
      targetGroup: string;
      reason?: string | null;
    },
  ) {
    if (!this.luckpermsService.isEnabled()) {
      throw new BadRequestException('LuckPerms API is not enabled');
    }
    const binding = await this.resolveBinding(userId, payload.bindingId);
    const server = await this.resolveServer(payload.serverId);
    const identifier = this.resolveIdentifier(binding);
    const metadata: LifecycleMetadata = {
      action: 'luckperms.permission-adjust',
      status: 'PENDING',
      bindingId: binding.id,
      identifier,
      server,
      targetGroup: payload.targetGroup,
      reason: this.toNullableString(payload.reason),
      requestedAt: new Date().toISOString(),
    };
    const event = await this.createLifecycleEvent(
      userId,
      'portal.player.permission-adjust',
      metadata,
      this.toNullableString(payload.reason),
    );
    this.runDetached('luckperms-permission-adjust', () =>
      this.processPermissionAdjustment(event.id, {
        binding,
        serverId: payload.serverId,
        identifier,
        targetGroup: payload.targetGroup,
      }),
    );
    return { success: true, requestId: event.id } as const;
  }

  async listLifecycleEvents(
    userId: string,
    options: { sources?: string[]; limit?: number },
  ) {
    const where: Prisma.UserLifecycleEventWhereInput = {
      userId,
    };
    if (options.sources && options.sources.length) {
      where.source = { in: options.sources };
    }
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const items = await this.prisma.userLifecycleEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return items.map((entry) => ({
      id: entry.id,
      source: entry.source ?? null,
      eventType: entry.eventType,
      occurredAt: entry.occurredAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      metadata: entry.metadata ?? null,
    }));
  }

  private async processAuthmePasswordReset(
    eventId: string,
    payload: {
      binding: UserAuthmeBinding;
      identifier: string;
      password: string;
      serverId: string;
    },
  ) {
    try {
      await this.updateLifecycleMetadata(eventId, {
        status: 'EXECUTING',
        startedAt: new Date().toISOString(),
      });
      const command = buildAuthmeChangePasswordCommand(
        payload.identifier,
        payload.password,
      );
      await this.minecraftServers.sendMcsmCommand(payload.serverId, command);
      await this.updateLifecycleMetadata(eventId, { status: 'VERIFYING' });
      await this.verifyAuthmePassword(
        eventId,
        payload.identifier,
        payload.password,
      );
      await this.updateLifecycleMetadata(eventId, {
        status: 'SUCCESS',
        completedAt: new Date().toISOString(),
        resultMessage: '密码已同步至 AuthMe',
      });
    } catch (error) {
      await this.updateLifecycleMetadata(eventId, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(
        `AuthMe 密码重置任务失败 (${eventId}): ${String(error)}`,
      );
    }
  }

  private async processAuthmeForceLogin(
    eventId: string,
    payload: { identifier: string; serverId: string },
  ) {
    try {
      await this.updateLifecycleMetadata(eventId, {
        status: 'EXECUTING',
        startedAt: new Date().toISOString(),
      });
      const command = buildAuthmeForceLoginCommand(payload.identifier);
      await this.minecraftServers.sendMcsmCommand(payload.serverId, command);
      await this.updateLifecycleMetadata(eventId, {
        status: 'SUCCESS',
        completedAt: new Date().toISOString(),
        resultMessage: '强制登录命令已发送',
      });
    } catch (error) {
      await this.updateLifecycleMetadata(eventId, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(
        `AuthMe 强制登录任务失败 (${eventId}): ${String(error)}`,
      );
    }
  }

  private async processPermissionAdjustment(
    eventId: string,
    payload: {
      binding: UserAuthmeBinding;
      identifier: string;
      targetGroup: string;
      serverId: string;
    },
  ) {
    try {
      await this.updateLifecycleMetadata(eventId, {
        status: 'EXECUTING',
        startedAt: new Date().toISOString(),
        targetGroup: payload.targetGroup,
      });
      const command = buildLuckpermsSetParentCommand(
        payload.identifier,
        payload.targetGroup,
      );
      await this.minecraftServers.sendMcsmCommand(payload.serverId, command);
      await this.updateLifecycleMetadata(eventId, { status: 'VERIFYING' });
      await this.verifyLuckpermsGroup(
        eventId,
        payload.binding,
        payload.targetGroup,
      );
      await this.updateLifecycleMetadata(eventId, {
        status: 'SUCCESS',
        completedAt: new Date().toISOString(),
        resultMessage: 'LuckPerms 权限组已更新',
      });
    } catch (error) {
      await this.updateLifecycleMetadata(eventId, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(
        `LuckPerms 权限组调整失败 (${eventId}): ${String(error)}`,
      );
    }
  }

  private async resolveBinding(userId: string, bindingId?: string | null) {
    const where: Prisma.UserAuthmeBindingWhereInput = {
      userId,
    };
    if (bindingId) {
      where.id = bindingId;
    }
    const binding = await this.prisma.userAuthmeBinding.findFirst({
      where,
      orderBy: { boundAt: 'desc' },
    });
    if (!binding) {
      throw new BadRequestException('No valid AuthMe binding found');
    }
    return binding;
  }

  private async resolveServer(serverId: string) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id: serverId },
      select: { id: true, displayName: true },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    return { id: server.id, name: server.displayName };
  }

  private resolveIdentifier(binding: UserAuthmeBinding) {
    const realname = binding.authmeRealname?.trim();
    if (realname) {
      return realname;
    }
    const username = binding.authmeUsername?.trim();
    if (username) {
      return username;
    }
    throw new BadRequestException('Valid AuthMe username is required');
  }

  private async verifyAuthmePassword(
    eventId: string,
    identifier: string,
    password: string,
  ) {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.authmeService.verifyCredentials(identifier, password);
        await this.updateLifecycleMetadata(eventId, {
          verificationAttempts: attempt,
        });
        return;
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw new Error('AuthMe password verification failed');
        }
        await this.updateLifecycleMetadata(eventId, {
          verificationAttempts: attempt,
        });
        await delay(2000);
      }
    }
  }

  private async verifyLuckpermsGroup(
    eventId: string,
    binding: UserAuthmeBinding,
    targetGroup: string,
  ) {
    const maxAttempts = 6;
    const normalizedTarget = targetGroup.toLowerCase();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const player = await this.lookupLuckpermsPlayer(binding);
        const primaryGroup = player?.primaryGroup?.toLowerCase() ?? null;
        await this.updateLifecycleMetadata(eventId, {
          verificationAttempts: attempt,
          previousGroup: player?.primaryGroup ?? null,
        });
        if (primaryGroup === normalizedTarget) {
          return;
        }
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw new Error('LuckPerms permission group verification failed');
        }
      }
      await delay(2000);
    }
    throw new Error('LuckPerms permission group verification failed');
  }

  private async lookupLuckpermsPlayer(
    binding: UserAuthmeBinding,
  ): Promise<LuckpermsPlayer | null> {
    if (!this.luckpermsService.isEnabled()) {
      return null;
    }
    if (binding.authmeUuid) {
      try {
        const player = await this.luckpermsService.getPlayerByUuid(
          binding.authmeUuid,
        );
        if (player) {
          return player;
        }
      } catch (error) {
        this.logger.debug(
          `LuckPerms 查找失败 (UUID ${binding.authmeUuid}): ${String(error)}`,
        );
      }
    }
    const identifier = this.resolveIdentifier(binding);
    try {
      return await this.luckpermsService.getPlayerByUsername(identifier);
    } catch (error) {
      this.logger.debug(
        `LuckPerms 查找失败 (用户名 ${identifier}): ${String(error)}`,
      );
      return null;
    }
  }

  private async createLifecycleEvent(
    userId: string,
    source: string,
    metadata: LifecycleMetadata,
    note?: string | null,
  ) {
    return this.prisma.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.OTHER,
        occurredAt: new Date(),
        source,
        notes: note ?? null,
        metadata,
      },
    });
  }

  private async updateLifecycleMetadata(
    eventId: string,
    patch: Record<string, unknown>,
  ) {
    const existing = await this.prisma.userLifecycleEvent.findUnique({
      where: { id: eventId },
      select: { metadata: true },
    });
    const current = isRecord(existing?.metadata)
      ? existing?.metadata
      : ({} as Prisma.JsonObject);
    const next = { ...current, ...patch } as Prisma.JsonObject;
    await this.prisma.userLifecycleEvent.update({
      where: { id: eventId },
      data: { metadata: next },
    });
    return next;
  }

  private runDetached(label: string, handler: () => Promise<void>) {
    Promise.resolve()
      .then(() => handler())
      .catch((error) =>
        this.logger.error(`任务 ${label} 执行失败: ${String(error)}`),
      );
  }

  private toNullableString(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
}

function isRecord(value: unknown): value is Prisma.JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
