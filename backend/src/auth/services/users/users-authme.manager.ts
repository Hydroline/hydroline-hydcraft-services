import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AuthmeBindingAction,
  LifecycleEventType,
  Prisma,
} from '@prisma/client';
import { UsersServiceContext } from './users.context';
import { normalizeOptionalString, toJson, toJsonValue } from './users.helpers';
import { ensureUser } from './users-core.manager';
import { UpdateAuthmeBindingAdminDto } from '../../dto/update-authme-binding-admin.dto';
import { CreateAuthmeBindingAdminDto } from '../../dto/create-authme-binding-admin.dto';

export async function updateAuthmeBinding(
  ctx: UsersServiceContext,
  userId: string,
  bindingId: string,
  dto: UpdateAuthmeBindingAdminDto,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const binding = await ctx.prisma.userAuthmeBinding.findUnique({
    where: { id: bindingId },
  });
  if (!binding || binding.userId !== userId) {
    throw new NotFoundException('AuthMe 绑定不存在');
  }

  const normalizedRealname =
    dto.authmeRealname !== undefined
      ? normalizeOptionalString(dto.authmeRealname ?? undefined)
      : undefined;
  const normalizedNotes =
    dto.notes !== undefined
      ? normalizeOptionalString(dto.notes ?? undefined)
      : undefined;

  const updated = await ctx.prisma.$transaction(async (tx) => {
    let destinationUserId = binding.userId;
    if (dto.targetUserId && dto.targetUserId !== binding.userId) {
      await ensureUser(ctx, dto.targetUserId);
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
      destinationUserId = dto.targetUserId;
    }

    const record = await tx.userAuthmeBinding.update({
      where: { id: bindingId },
      data: {
        userId: destinationUserId,
        authmeRealname:
          normalizedRealname !== undefined
            ? normalizedRealname
            : binding.authmeRealname,
        status: dto.status ?? binding.status,
        notes: normalizedNotes !== undefined ? normalizedNotes : binding.notes,
        metadata:
          dto.metadata !== undefined
            ? toJsonValue(dto.metadata)
            : binding.metadata,
      },
    });

    if (dto.primary === false) {
      await tx.userProfile.updateMany({
        where: {
          userId: destinationUserId,
          primaryAuthmeBindingId: bindingId,
        },
        data: { primaryAuthmeBindingId: null },
      });
      await ctx.authmeBindingService.recordHistoryEntry(
        {
          bindingId: record.id,
          userId: record.userId,
          operatorId: actorId ?? null,
          authmeUsername: record.authmeUsername,
          authmeRealname: record.authmeRealname,
          authmeUuid: record.authmeUuid,
          action: AuthmeBindingAction.PRIMARY_UNSET,
          reason: 'primary-cleared',
        },
        tx,
      );
    }

    if (dto.targetUserId && dto.targetUserId !== binding.userId) {
      await ctx.authmeBindingService.recordHistoryEntry(
        {
          bindingId: record.id,
          userId: record.userId,
          operatorId: actorId ?? null,
          authmeUsername: record.authmeUsername,
          authmeRealname: record.authmeRealname,
          authmeUuid: record.authmeUuid,
          action: AuthmeBindingAction.TRANSFER,
          reason: 'binding-transfer',
          payload: {
            fromUserId: binding.userId,
            toUserId: dto.targetUserId,
          },
        },
        tx,
      );
    }

    if (dto.primary === true) {
      await tx.userProfile.upsert({
        where: { userId: record.userId },
        update: { primaryAuthmeBindingId: record.id },
        create: { userId: record.userId, primaryAuthmeBindingId: record.id },
      });
    }

    return record;
  });

  await ctx.adminAuditService.record({
    actorId,
    action: 'update_authme_binding',
    targetType: 'authme_binding',
    targetId: bindingId,
    payload: { dto },
  });

  const isPrimary = await ctx.prisma.userProfile.findFirst({
    where: { userId, primaryAuthmeBindingId: updated.id },
  });

  return {
    id: binding.id,
    authmeUsername: binding.authmeUsername,
    authmeRealname: binding.authmeRealname,
    authmeUuid: binding.authmeUuid,
    boundAt: binding.boundAt,
    isPrimary: Boolean(isPrimary),
  };
}

export async function createAuthmeBindingAdmin(
  ctx: UsersServiceContext,
  userId: string,
  dto: CreateAuthmeBindingAdminDto,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const username = dto.authmeUsername.trim();
  const existingAccount = await ctx.authmeService
    .getAccount(username)
    .catch(() => null);
  if (!existingAccount) {
    throw new NotFoundException('AuthMe 账户不存在');
  }

  const existingBinding = await ctx.prisma.userAuthmeBinding.findFirst({
    where: { authmeUsernameLower: username.toLowerCase() },
  });
  if (existingBinding && existingBinding.userId !== userId) {
    throw new BadRequestException('该 AuthMe 账户已绑定其他用户');
  }

  const binding = await ctx.prisma.$transaction(async (tx) => {
    const record = await tx.userAuthmeBinding.upsert({
      where: {
        userId_authmeUsernameLower: {
          userId,
          authmeUsernameLower: username.toLowerCase(),
        },
      },
      update: {
        authmeRealname: existingAccount.realname,
        authmeUuid: existingAccount.uuid ?? null,
        boundAt: dto.boundAt ?? new Date(),
        boundByUserId: actorId ?? null,
        boundByIp: dto.boundByIp ?? existingAccount.ip ?? null,
        metadata: toJson(dto.metadata),
        status: dto.status ?? 'ACTIVE',
      },
      create: {
        userId,
        authmeUsername: username,
        authmeUsernameLower: username.toLowerCase(),
        authmeRealname: existingAccount.realname,
        authmeUuid: existingAccount.uuid ?? null,
        boundAt: dto.boundAt ?? new Date(),
        boundByUserId: actorId ?? null,
        boundByIp: dto.boundByIp ?? existingAccount.ip ?? null,
        metadata: toJson(dto.metadata),
        status: dto.status ?? 'ACTIVE',
      },
    });

    await ctx.authmeBindingService.recordHistoryEntry(
      {
        bindingId: record.id,
        userId: record.userId,
        operatorId: actorId ?? userId,
        authmeUsername: record.authmeUsername,
        authmeRealname: record.authmeRealname,
        authmeUuid: record.authmeUuid,
        action: AuthmeBindingAction.BIND,
        reason: 'admin-bind',
        payload: { source: 'admin' },
      },
      tx,
    );

    if (dto.primary) {
      await tx.userProfile.upsert({
        where: { userId },
        update: { primaryAuthmeBindingId: record.id },
        create: { userId, primaryAuthmeBindingId: record.id },
      });
    }

    return record;
  });

  await ctx.adminAuditService.record({
    actorId,
    action: 'create_authme_binding',
    targetType: 'authme_binding',
    targetId: binding.id,
    payload: { userId, authmeUsername: username },
  });

  return binding;
}

export async function listAuthmeBindingHistoryByUser(
  ctx: UsersServiceContext,
  userId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  await ensureUser(ctx, userId);
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
  const where = { userId };
  const [items, total] = await ctx.prisma.$transaction([
    ctx.prisma.authmeBindingHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        binding: {
          select: {
            id: true,
            authmeUsername: true,
            authmeRealname: true,
            authmeUuid: true,
            status: true,
          },
        },
        operator: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    }),
    ctx.prisma.authmeBindingHistory.count({ where }),
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function setPrimaryAuthmeBinding(
  ctx: UsersServiceContext,
  userId: string,
  bindingId: string,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const [binding, profile] = await Promise.all([
    ctx.prisma.userAuthmeBinding.findUnique({
      where: { id: bindingId },
    }),
    ctx.prisma.userProfile.findUnique({
      where: { userId },
      select: { primaryAuthmeBindingId: true },
    }),
  ]);
  if (!binding || binding.userId !== userId) {
    throw new NotFoundException('AuthMe 绑定不存在');
  }

  await ctx.prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      primaryAuthmeBindingId: bindingId,
    },
    update: { primaryAuthmeBindingId: bindingId },
  });

  await ctx.authmeBindingService.recordHistoryEntry({
    bindingId: binding.id,
    userId: binding.userId,
    operatorId: actorId ?? userId,
    authmeUsername: binding.authmeUsername,
    authmeRealname: binding.authmeRealname,
    authmeUuid: binding.authmeUuid,
    action: AuthmeBindingAction.PRIMARY_SET,
    reason: 'set-primary',
  });

  const previousPrimaryId = profile?.primaryAuthmeBindingId;
  if (previousPrimaryId && previousPrimaryId !== bindingId) {
    const previous = await ctx.prisma.userAuthmeBinding.findUnique({
      where: { id: previousPrimaryId },
    });
    if (previous) {
      await ctx.authmeBindingService.recordHistoryEntry({
        bindingId: previous.id,
        userId: previous.userId,
        operatorId: actorId ?? userId,
        authmeUsername: previous.authmeUsername,
        authmeRealname: previous.authmeRealname,
        authmeUuid: previous.authmeUuid,
        action: AuthmeBindingAction.PRIMARY_UNSET,
        reason: 'replaced-primary',
      });
    }
  }

  return binding;
}

export async function unbindAuthmeBinding(
  ctx: UsersServiceContext,
  userId: string,
  bindingId: string,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const binding = await ctx.prisma.userAuthmeBinding.findUnique({
    where: { id: bindingId },
  });
  if (!binding || binding.userId !== userId) {
    throw new NotFoundException('AuthMe 绑定不存在');
  }
  const profileBefore = await ctx.prisma.userProfile.findUnique({
    where: { userId },
    select: { primaryAuthmeBindingId: true },
  });
  const wasPrimary = profileBefore?.primaryAuthmeBindingId === bindingId;
  await ctx.prisma.$transaction(async (tx) => {
    await tx.userProfile.updateMany({
      where: { userId, primaryAuthmeBindingId: bindingId },
      data: { primaryAuthmeBindingId: null },
    });
    await tx.userMinecraftProfile.updateMany({
      where: { userId, authmeBindingId: bindingId },
      data: { authmeBindingId: null },
    });
    await ctx.authmeBindingService.recordHistoryEntry(
      {
        bindingId: binding.id,
        userId: binding.userId,
        operatorId: actorId ?? userId,
        authmeUsername: binding.authmeUsername,
        authmeRealname: binding.authmeRealname,
        authmeUuid: binding.authmeUuid,
        action: AuthmeBindingAction.UNBIND,
        reason: 'manual-unbind',
      },
      tx,
    );
    await tx.userAuthmeBinding.delete({ where: { id: bindingId } });
    await tx.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.ACCOUNT_UNBIND,
        occurredAt: new Date(),
        source: 'admin-unbind',
        metadata: toJsonValue({ bindingId }),
        createdById: actorId ?? userId,
      },
    });
    if (wasPrimary) {
      const next = await tx.userAuthmeBinding.findFirst({
        where: { userId },
        orderBy: { boundAt: 'asc' },
      });
      if (next) {
        await tx.userProfile.upsert({
          where: { userId },
          update: { primaryAuthmeBindingId: next.id },
          create: { userId, primaryAuthmeBindingId: next.id },
        });
        await ctx.authmeBindingService.recordHistoryEntry(
          {
            bindingId: next.id,
            userId: next.userId,
            operatorId: actorId ?? userId,
            authmeUsername: next.authmeUsername,
            authmeRealname: next.authmeRealname,
            authmeUuid: next.authmeUuid,
            action: AuthmeBindingAction.PRIMARY_SET,
            reason: 'auto-reassign-primary-unbind',
            payload: { auto: true },
          },
          tx,
        );
      }
    }
  });
  await ctx.adminAuditService.record({
    actorId,
    action: 'unbind_authme',
    targetType: 'authme_binding',
    targetId: bindingId,
    payload: { userId, authmeUsername: binding.authmeUsername },
  });
  return { success: true } as const;
}
