import { Injectable, Logger } from '@nestjs/common';
import {
  AuthmeBindingAction,
  LifecycleEventType,
  Prisma,
} from '@prisma/client';
import { Counter } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthmeUser } from './authme.interfaces';
import { businessError } from './authme.errors';
import { normalizeIpAddress } from '../lib/ip2region/ip-normalizer';
import { LuckpermsService } from '../luckperms/luckperms.service';

const authmeBindingHistoryCounter = new Counter({
  name: 'authme_binding_history_events_total',
  help: 'Number of AuthMe binding history events',
  labelNames: ['action'],
});

@Injectable()
export class AuthmeBindingService {
  private readonly logger = new Logger(AuthmeBindingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly luckpermsService: LuckpermsService,
  ) {}

  listBindingsByUserId(userId: string) {
    return this.prisma.userAuthmeBinding.findMany({
      where: { userId },
      orderBy: { boundAt: 'asc' },
    });
  }

  getBindingByUsernameLower(authmeUsernameLower: string) {
    return this.prisma.userAuthmeBinding.findUnique({
      where: { authmeUsernameLower },
    });
  }

  async bindUser(options: {
    userId: string;
    authmeUser: AuthmeUser;
    operatorUserId?: string;
    sourceIp?: string | null;
  }) {
    const normalizedUsername = options.authmeUser.username.toLowerCase();
    const resolvedUuid = await this.resolvePlayerUuid(
      options.authmeUser.username,
      options.authmeUser.realname,
    );
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userAuthmeBinding.findUnique({
        where: { authmeUsernameLower: normalizedUsername },
      });
      if (existing && existing.userId !== options.userId) {
        throw businessError({
          type: 'BUSINESS_VALIDATION_FAILED',
          code: 'BINDING_CONFLICT',
          safeMessage: '该 AuthMe 账号已绑定其他用户，请先解绑后再试',
        });
      }

      // Upsert by unique username; if it exists for same user, update metadata; if not exists, create a new binding
      const binding = await tx.userAuthmeBinding.upsert({
        where: { authmeUsernameLower: normalizedUsername },
        update: {
          userId: options.userId,
          authmeUsername: options.authmeUser.username,
          authmeRealname: options.authmeUser.realname,
          authmeUuid: resolvedUuid ?? existing?.authmeUuid ?? null,
          boundAt: new Date(),
          boundByUserId: options.operatorUserId ?? options.userId,
          boundByIp: sanitizeIp(options.sourceIp),
        },
        create: {
          userId: options.userId,
          authmeUsername: options.authmeUser.username,
          authmeUsernameLower: normalizedUsername,
          authmeRealname: options.authmeUser.realname,
          authmeUuid: resolvedUuid,
          boundByUserId: options.operatorUserId ?? options.userId,
          boundByIp: sanitizeIp(options.sourceIp),
        },
      });

      const profile = await tx.userProfile.findUnique({
        where: { userId: options.userId },
        select: { primaryAuthmeBindingId: true },
      });
      if (!profile) {
        await tx.userProfile.create({
          data: {
            userId: options.userId,
            primaryAuthmeBindingId: binding.id,
          },
        });
      } else if (!profile.primaryAuthmeBindingId) {
        await tx.userProfile.update({
          where: { userId: options.userId },
          data: { primaryAuthmeBindingId: binding.id },
        });
      }

      await tx.userLifecycleEvent.create({
        data: {
          userId: options.userId,
          eventType: LifecycleEventType.ACCOUNT_BIND,
          occurredAt: new Date(),
          source: 'authme-binding',
          metadata: this.toJson({
            authmeUsername: options.authmeUser.username,
            realname: options.authmeUser.realname,
          }),
          createdById: options.operatorUserId ?? options.userId,
        },
      });

      await this.recordHistoryEntry(
        {
          bindingId: binding.id,
          userId: binding.userId,
          operatorId: options.operatorUserId ?? options.userId,
          authmeUsername: binding.authmeUsername,
          authmeRealname: binding.authmeRealname,
          authmeUuid: binding.authmeUuid,
          action: AuthmeBindingAction.BIND,
          reason: 'authme-binding',
          payload: {
            source: 'bindUser',
            via: 'auth-service',
          },
        },
        tx,
      );

      return binding;
    });
  }

  async unbindUser(options: {
    userId: string;
    usernameLower?: string;
    operatorUserId?: string;
    sourceIp?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (options.usernameLower) {
        const target = await tx.userAuthmeBinding.findUnique({
          where: { authmeUsernameLower: options.usernameLower },
        });
        if (!target || target.userId !== options.userId) {
          return null;
        }
        await this.recordHistoryEntry(
          {
            bindingId: target.id,
            userId: target.userId,
            operatorId: options.operatorUserId ?? options.userId,
            authmeUsername: target.authmeUsername,
            authmeRealname: target.authmeRealname,
            authmeUuid: target.authmeUuid,
            action: AuthmeBindingAction.UNBIND,
            reason: 'authme-binding',
            payload: {
              sourceIp: sanitizeIp(options.sourceIp),
              mode: 'single',
            },
          },
          tx,
        );
        await tx.userAuthmeBinding.delete({
          where: { authmeUsernameLower: options.usernameLower },
        });
        await this.handleBindingRemoval(tx, target);
        await tx.userLifecycleEvent.create({
          data: {
            userId: options.userId,
            eventType: LifecycleEventType.ACCOUNT_UNBIND,
            occurredAt: new Date(),
            source: 'authme-binding',
            metadata: this.toJson({ authmeUsername: target.authmeUsername }),
            createdById: options.operatorUserId ?? options.userId,
          },
        });
        return target;
      }

      const bindings = await tx.userAuthmeBinding.findMany({
        where: { userId: options.userId },
      });
      if (bindings.length === 0) return null;
      await tx.userAuthmeBinding.deleteMany({
        where: { userId: options.userId },
      });
      for (const b of bindings) {
        await this.recordHistoryEntry(
          {
            bindingId: b.id,
            userId: b.userId,
            operatorId: options.operatorUserId ?? options.userId,
            authmeUsername: b.authmeUsername,
            authmeRealname: b.authmeRealname,
            authmeUuid: b.authmeUuid,
            action: AuthmeBindingAction.UNBIND,
            reason: 'authme-binding',
            payload: {
              sourceIp: sanitizeIp(options.sourceIp),
              mode: 'bulk',
            },
          },
          tx,
        );
        await this.handleBindingRemoval(tx, b);
        await tx.userLifecycleEvent.create({
          data: {
            userId: options.userId,
            eventType: LifecycleEventType.ACCOUNT_UNBIND,
            occurredAt: new Date(),
            source: 'authme-binding',
            metadata: this.toJson({ authmeUsername: b.authmeUsername }),
            createdById: options.operatorUserId ?? options.userId,
          },
        });
      }
      return bindings[0];
    });
  }

  private toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private async resolvePlayerUuid(
    authmeUsername: string,
    authmeRealname: string | null,
  ): Promise<string | null> {
    try {
      const identifier =
        typeof authmeRealname === 'string' && authmeRealname.length > 0
          ? authmeRealname
          : authmeUsername;
      const player = await this.luckpermsService
        .getPlayerByUsername(identifier)
        .catch(() => null);
      return player?.uuid ?? null;
    } catch (error) {
      this.logger.debug(
        `Failed to resolve LuckPerms UUID for ${authmeUsername}: ${String(error)}`,
      );
      return null;
    }
  }

  private async handleBindingRemoval(
    tx: Prisma.TransactionClient,
    binding: { id: string; userId: string },
  ) {
    await tx.userProfile.updateMany({
      where: {
        userId: binding.userId,
        primaryAuthmeBindingId: binding.id,
      },
      data: { primaryAuthmeBindingId: null },
    });
    await tx.userMinecraftProfile.updateMany({
      where: { userId: binding.userId, authmeBindingId: binding.id },
      data: { authmeBindingId: null },
    });
  }

  async recordHistoryEntry(
    params: {
      bindingId?: string | null;
      userId?: string | null;
      operatorId?: string | null;
      authmeUsername: string;
      authmeRealname?: string | null;
      authmeUuid?: string | null;
      action: AuthmeBindingAction;
      reason?: string | null;
      payload?: Record<string, unknown> | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const history = await client.authmeBindingHistory.create({
      data: {
        bindingId: params.bindingId ?? undefined,
        userId: params.userId ?? null,
        operatorId: params.operatorId ?? null,
        authmeUsername: params.authmeUsername,
        authmeUsernameLower: params.authmeUsername.toLowerCase(),
        authmeRealname: params.authmeRealname ?? null,
        authmeUuid: params.authmeUuid ?? null,
        action: params.action,
        reason: params.reason ?? null,
        payload: params.payload
          ? this.toJson(params.payload)
          : ((Prisma.JsonNull as unknown) as Prisma.InputJsonValue),
      },
    });
    authmeBindingHistoryCounter.inc({ action: params.action });
    this.logger.verbose(
      `AuthMe binding history recorded: ${JSON.stringify({
        action: params.action,
        bindingId: params.bindingId ?? 'unknown',
        userId: params.userId ?? 'unknown',
      })}`,
    );
    return history;
  }
}

function sanitizeIp(ip?: string | null) {
  const first = typeof ip === 'string' ? ip.split(',')[0] : null;
  return normalizeIpAddress(first) ?? null;
}
