import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  LifecycleEventType,
  MinecraftProfileSource,
  PIICStatus,
  PlayerStatus,
  Prisma,
  StatusSource,
} from '@prisma/client';
import { normalizeIpAddress } from '../../../lib/ip2region/ip-normalizer';
import { generateRandomString, hashPassword } from 'better-auth/crypto';
import { UsersServiceContext } from './users.context';
import {
  AuthmeBindingSnapshot,
  composeAuthmeBindingSnapshots,
  generatePiic,
  normalizeEmptyToNull,
  normalizeOptionalString,
  normalizeProfileExtra,
  toJson,
  toJsonValue,
} from './users.helpers';
import { ResetUserPasswordDto } from '../../dto/reset-user-password.dto';
import { UpdateCurrentUserDto } from '../../dto/update-current-user.dto';
import { UpdateUserProfileDto } from '../../dto/update-user-profile.dto';

export async function initializeUserRecords(
  ctx: UsersServiceContext,
  userId: string,
  options: {
    displayName?: string;
    minecraftId?: string;
    minecraftNick?: string;
    source?: MinecraftProfileSource;
    createdById?: string;
  } = {},
) {
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  await ctx.prisma.$transaction(async (tx) => {
    const profile = await tx.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      const piic = await generatePiic(ctx, tx);
      await tx.userProfile.create({
        data: {
          userId,
          displayName: options.displayName ?? user.name ?? user.email,
          piic,
          piicAssignedAt: new Date(),
        },
      });
      await tx.userPiicHistory.create({
        data: {
          userId,
          piic,
          status: PIICStatus.ACTIVE,
          reason: 'initial-assignment',
        },
      });
    }

    const existingLifecycle = await tx.userLifecycleEvent.findFirst({
      where: { userId, eventType: LifecycleEventType.REGISTERED },
    });
    if (!existingLifecycle) {
      await tx.userLifecycleEvent.create({
        data: {
          userId,
          eventType: LifecycleEventType.REGISTERED,
          occurredAt: user.createdAt,
          source: 'auth-service',
        },
      });
    }

    const latestStatus = await tx.userStatusSnapshot.findUnique({
      where: { userId },
    });
    if (!latestStatus) {
      const event = await tx.userStatusEvent.create({
        data: {
          userId,
          status: PlayerStatus.UNKNOWN,
          reasonCode: 'initial',
          source: StatusSource.SYSTEM,
          metadata: toJsonValue({ createdBy: 'auth-service' }),
        },
      });
      await tx.userStatusSnapshot.create({
        data: {
          userId,
          statusEventId: event.id,
          status: event.status,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        joinDate: user.joinDate ?? user.createdAt,
      },
    });

    if (options.minecraftId || options.minecraftNick) {
      const hasPrimary = await tx.userMinecraftProfile.findFirst({
        where: { userId, isPrimary: true },
      });
      const profile = await tx.userMinecraftProfile.create({
        data: {
          userId,
          nickname: options.minecraftNick ?? options.minecraftId ?? null,
          isPrimary: hasPrimary ? false : true,
          source: options.source ?? MinecraftProfileSource.MANUAL,
        },
      });
      if (!hasPrimary) {
        await tx.userProfile.updateMany({
          where: { userId },
          data: { primaryMinecraftProfileId: profile.id },
        });
      }
    }
  });
}

export async function listUsers(
  ctx: UsersServiceContext,
  params: {
    keyword?: string;
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
  },
) {
  const { keyword, page = 1, pageSize = 20, sortField, sortOrder } = params;
  const where: Prisma.UserWhereInput = keyword
    ? {
        OR: [
          { email: { contains: keyword, mode: 'insensitive' } },
          { name: { contains: keyword, mode: 'insensitive' } },
          { profile: { piic: { contains: keyword, mode: 'insensitive' } } },
          {
            minecraftIds: {
              some: {
                nickname: { contains: keyword, mode: 'insensitive' },
              },
            },
          },
          {
            authmeBindings: {
              some: {
                authmeUsername: { contains: keyword, mode: 'insensitive' },
              },
            },
          },
        ],
      }
    : {};

  const orderBy: Prisma.UserOrderByWithRelationInput[] = [];
  const sort = resolveUserSort(sortField, sortOrder);
  if (sort) {
    orderBy.push(sort);
  }
  orderBy.push({ createdAt: 'asc' });

  const [items, total] = await ctx.prisma.$transaction([
    ctx.prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        profile: {
          include: {
            primaryMinecraftProfile: true,
          },
        },
        statusSnapshot: true,
        roles: { include: { role: true } },
        contacts: {
          where: { channel: { key: 'email' } },
          select: {
            id: true,
            value: true,
            isPrimary: true,
            verification: true,
            verifiedAt: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        authmeBindings: {
          orderBy: { boundAt: 'asc' },
          select: {
            id: true,
            userId: true,
            authmeUsername: true,
            authmeUsernameLower: true,
            authmeRealname: true,
            authmeUuid: true,
            boundAt: true,
            boundByUserId: true,
            boundByIp: true,
            status: true,
            updatedAt: true,
          },
        },
        permissionLabels: {
          include: {
            label: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    }),
    ctx.prisma.user.count({ where }),
  ]);

  type UserListQueryResult = Prisma.UserGetPayload<{
    include: {
      profile: { include: { primaryMinecraftProfile: true } };
      statusSnapshot: true;
      roles: { include: { role: true } };
      contacts: true;
      permissionLabels: {
        include: {
          label: {
            include: {
              permissions: { include: { permission: true } };
            };
          };
        };
      };
      authmeBindings: true;
    };
  }>;

  const itemsTyped = items as unknown as UserListQueryResult[];

  const mappedItems = itemsTyped.map((user) => {
    const authmeBindings = (user.authmeBindings ?? []).map((b) => ({
      id: b.id,
      authmeUsername: b.authmeUsername,
      authmeRealname: b.authmeRealname ?? null,
      authmeUuid: b.authmeUuid ?? null,
      boundAt: b.boundAt,
      status: b.status,
      isPrimary: (user.profile?.primaryAuthmeBindingId ?? null) === b.id,
    }));

    return {
      ...user,
      authmeBindings,
      minecraftIds: undefined,
    } as unknown as Record<string, unknown>;
  });

  return {
    items: mappedItems,
    pagination: {
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    },
  };
}

function resolveUserSort(
  field?: string,
  order?: string,
): Prisma.UserOrderByWithRelationInput | null {
  if (!field) return null;
  const direction = order?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  switch (field) {
    case 'displayName':
      return { profile: { displayName: direction } };
    case 'username':
      return { name: direction };
    case 'email':
      return { email: direction };
    case 'piic':
      return { profile: { piic: direction } };
    case 'roles':
      return { roles: { _count: direction } };
    case 'labels':
      return { permissionLabels: { _count: direction } };
    case 'minecraft':
      return { minecraftIds: { _count: direction } };
    case 'createdAt':
      return { createdAt: direction };
    case 'lastLoginAt':
      return { lastLoginAt: direction };
    case 'joinDate':
      return { joinDate: direction };
    default:
      return null;
  }
}

export async function getSessionUser(ctx: UsersServiceContext, userId: string) {
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      joinDate: true,
      lastLoginAt: true,
      lastLoginIp: true,
      createdAt: true,
      updatedAt: true,
      profile: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          birthday: true,
          piic: true,
          piicAssignedAt: true,
          primaryMinecraftProfileId: true,
          primaryAuthmeBindingId: true,
          timezone: true,
          locale: true,
          motto: true,
          gender: true,
          extra: true,
        },
      },
      contacts: {
        select: {
          id: true,
          userId: true,
          channelId: true,
          value: true,
          isPrimary: true,
          verification: true,
          verifiedAt: true,
          metadata: true,
          channel: {
            select: {
              id: true,
              key: true,
              displayName: true,
              description: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      authmeBindings: {
        select: {
          id: true,
          authmeUsername: true,
          authmeRealname: true,
          authmeUuid: true,
          boundAt: true,
          boundByUserId: true,
          boundByIp: true,
        },
        orderBy: { boundAt: 'asc' },
      },
      roles: {
        select: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const passwordRows = await ctx.prisma.$queryRaw<
    Array<{
      password: string | null;
      passwordNeedsReset: boolean | null;
      passwordUpdatedAt: Date | null;
    }>
  >`SELECT "password", "passwordNeedsReset", "passwordUpdatedAt" FROM "users" WHERE "id" = ${userId} LIMIT 1`;

  const passwordSnapshot = passwordRows[0] ?? null;
  const security = {
    hasPassword: Boolean(passwordSnapshot?.password),
    passwordNeedsReset: Boolean(passwordSnapshot?.passwordNeedsReset),
    passwordUpdatedAt: passwordSnapshot?.passwordUpdatedAt ?? null,
  } as const;

  const normalizedLastLoginIp = normalizeIpAddress(user.lastLoginIp);
  const [lastLoginLocation, bindingData] = await Promise.all([
    normalizedLastLoginIp
      ? ctx.ipLocationService.lookup(normalizedLastLoginIp)
      : Promise.resolve(null),
    composeAuthmeBindingSnapshots(ctx, user.authmeBindings),
  ]);

  const authmeBindings = await Promise.all(
    bindingData.bindings.map(async (binding) => {
      const normalizedIp = normalizeIpAddress(binding.ip);
      const normalizedRegip = normalizeIpAddress(binding.regip);
      const [ipLocation, regipLocation] = await Promise.all([
        normalizedIp ? ctx.ipLocationService.lookup(normalizedIp) : null,
        normalizedRegip ? ctx.ipLocationService.lookup(normalizedRegip) : null,
      ]);

      return {
        ...binding,
        ip: normalizedIp,
        regip: normalizedRegip,
        ipLocation: ipLocation?.display ?? null,
        ipLocationRaw: ipLocation?.raw ?? null,
        regipLocation: regipLocation?.display ?? null,
        regipLocationRaw: regipLocation?.raw ?? null,
      };
    }),
  );

  return {
    ...user,
    lastLoginIp: normalizedLastLoginIp,
    lastLoginIpLocation: lastLoginLocation?.display ?? null,
    lastLoginIpLocationRaw: lastLoginLocation?.raw ?? null,
    authmeBindings,
    luckperms: bindingData.luckperms,
    security,
  } as typeof user & {
    authmeBindings: typeof authmeBindings;
    luckperms: typeof bindingData.luckperms;
    lastLoginIp: typeof normalizedLastLoginIp;
    lastLoginIpLocation: string | null;
    lastLoginIpLocationRaw: string | null;
    security: typeof security;
  };
}

export async function updateCurrentUser(
  ctx: UsersServiceContext,
  userId: string,
  dto: UpdateCurrentUserDto,
) {
  await ensureUser(ctx, userId);
  const userUpdate: Prisma.UserUpdateInput = {};
  const current = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, nameChangedAt: true, email: true },
  });

  if (dto.name !== undefined) {
    const normalizedName = normalizeEmptyToNull(dto.name);
    const newName = normalizedName ?? null;
    if (current && newName !== (current.name ?? null)) {
      const lastChanged = current.nameChangedAt?.getTime?.() ?? null;
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      if (lastChanged && Date.now() - lastChanged < THIRTY_DAYS_MS) {
        throw new BadRequestException('用户名每30天只能修改一次');
      }
      userUpdate.nameChangedAt = new Date();
    }
    userUpdate.name = newName;
  }

  if (dto.image !== undefined) {
    const normalizedImage = normalizeEmptyToNull(dto.image);
    userUpdate.image = normalizedImage ?? null;
  }

  if (dto.email !== undefined) {
    const normalizedEmail = normalizeOptionalString(dto.email);
    if (normalizedEmail !== undefined && normalizedEmail !== current?.email) {
      const exists = await ctx.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (exists && exists.id !== userId) {
        throw new BadRequestException('该邮箱已被其他账户使用');
      }
      userUpdate.email = normalizedEmail;
      userUpdate.emailVerified = false;
    }
  }

  if (Object.keys(userUpdate).length > 0) {
    await ctx.prisma.user.update({
      where: { id: userId },
      data: userUpdate,
    });
  }

  const profilePayload: UpdateUserProfileDto = {};
  const normalizedDisplayName = normalizeOptionalString(dto.displayName);
  if (normalizedDisplayName !== undefined) {
    profilePayload.displayName = normalizedDisplayName;
  }
  if (dto.birthday !== undefined) {
    profilePayload.birthday = dto.birthday;
  }
  if (dto.gender !== undefined) {
    profilePayload.gender = dto.gender;
  }
  const normalizedMotto = normalizeOptionalString(dto.motto);
  if (normalizedMotto !== undefined) {
    profilePayload.motto = normalizedMotto;
  }
  const normalizedTimezone = normalizeOptionalString(dto.timezone);
  if (normalizedTimezone !== undefined) {
    profilePayload.timezone = normalizedTimezone;
  }
  const normalizedLocale = normalizeOptionalString(dto.locale);
  if (normalizedLocale !== undefined) {
    profilePayload.locale = normalizedLocale;
  }
  const extraPayload = normalizeProfileExtra(dto.extra);
  if (extraPayload !== undefined) {
    profilePayload.extra = extraPayload;
  }

  if (Object.keys(profilePayload).length > 0) {
    await updateProfile(ctx, userId, profilePayload);
  }

  return getSessionUser(ctx, userId);
}

export async function getUserDetail(ctx: UsersServiceContext, userId: string) {
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      minecraftIds: true,
      authmeBindings: true,
      sessions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      statusSnapshot: {
        include: { event: true },
      },
      statusEvents: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      lifecycle: {
        orderBy: { occurredAt: 'desc' },
        take: 50,
      },
      contacts: {
        include: { channel: true },
      },
      roles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
      permissionLabels: {
        include: {
          label: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const bindingData = await composeAuthmeBindingSnapshots(
    ctx,
    user.authmeBindings,
  );
  const normalizedLastLoginIp = normalizeIpAddress(user.lastLoginIp);
  const lastLoginLocation = normalizedLastLoginIp
    ? await ctx.ipLocationService.lookup(normalizedLastLoginIp)
    : null;
  const enrichedBindings = await Promise.all(
    bindingData.bindings.map(async (b) => {
      const [ipLoc, regipLoc] = await Promise.all([
        ctx.ipLocationService.lookup(b.ip ?? null),
        ctx.ipLocationService.lookup(b.regip ?? null),
      ]);
      return {
        ...b,
        ipLocationRaw: ipLoc?.raw ?? null,
        ipLocation: ipLoc?.display ?? null,
        regipLocationRaw: regipLoc?.raw ?? null,
        regipLocation: regipLoc?.display ?? null,
      } as AuthmeBindingSnapshot & {
        ipLocationRaw: string | null;
        ipLocation: string | null;
        regipLocationRaw: string | null;
        regipLocation: string | null;
      };
    }),
  );

  return {
    ...user,
    authmeBindings: enrichedBindings,
    luckperms: bindingData.luckperms,
    lastLoginIp: normalizedLastLoginIp,
    lastLoginIpLocation: lastLoginLocation?.display ?? null,
    lastLoginIpLocationRaw: lastLoginLocation?.raw ?? null,
  };
}

export async function deleteUser(ctx: UsersServiceContext, userId: string) {
  await ensureUser(ctx, userId);
  await ctx.prisma.user.delete({ where: { id: userId } });
  return { success: true } as const;
}

export async function updateProfile(
  ctx: UsersServiceContext,
  userId: string,
  dto: UpdateUserProfileDto,
) {
  await ensureUser(ctx, userId);
  const data: Prisma.UserProfileUpdateInput = {
    ...(dto.displayName && { displayName: dto.displayName }),
    ...(dto.birthday && { birthday: new Date(dto.birthday) }),
    ...(dto.gender && { gender: dto.gender }),
    ...(dto.motto && { motto: dto.motto }),
    ...(dto.timezone && { timezone: dto.timezone }),
    ...(dto.locale && { locale: dto.locale }),
    ...(dto.extra && { extra: toJson(dto.extra) }),
  };

  const profile = await ctx.prisma.userProfile.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      displayName: dto.displayName ?? undefined,
      birthday: dto.birthday ? new Date(dto.birthday) : undefined,
      gender: dto.gender,
      motto: dto.motto,
      timezone: dto.timezone,
      locale: dto.locale,
      extra: toJson(dto.extra),
      piic: await generatePiic(ctx, ctx.prisma),
      piicAssignedAt: new Date(),
    },
  });

  return profile;
}

export async function updateJoinDate(
  ctx: UsersServiceContext,
  userId: string,
  joinDateIso: string,
) {
  await ensureUser(ctx, userId);
  const date = new Date(joinDateIso);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('无效的入服日期');
  }
  return ctx.prisma.user.update({
    where: { id: userId },
    data: { joinDate: date },
    select: { id: true, joinDate: true },
  });
}

export async function updateOwnPassword(
  ctx: UsersServiceContext,
  userId: string,
  password: string,
) {
  await ensureUser(ctx, userId);
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw new BadRequestException('密码长度至少 8 位');
  }
  const hashed = await hashPassword(trimmed);
  const accountIdentifier = generateRandomString(32, 'a-z', 'A-Z', '0-9');

  await ctx.prisma.$transaction(async (tx) => {
    const credential = await tx.account.findFirst({
      where: {
        userId,
        OR: [
          { provider: 'credential' },
          { providerId: 'credential' },
          { providerAccountId: 'credential' },
        ],
      },
    });

    if (credential) {
      await tx.account.update({
        where: { id: credential.id },
        data: { password: hashed },
      });
    } else {
      await tx.account.create({
        data: {
          userId,
          accountId: accountIdentifier,
          type: 'credential',
          provider: 'credential',
          providerId: 'credential',
          providerAccountId: accountIdentifier,
          password: hashed,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        passwordNeedsReset: false,
        passwordUpdatedAt: new Date(),
      } as Prisma.UserUpdateInput,
    });

    await tx.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.OTHER,
        occurredAt: new Date(),
        source: 'self-password-update',
        notes: '用户更新登录密码',
        metadata: toJsonValue({ selfService: true }),
      },
    });
  });
}

export async function resetUserPassword(
  ctx: UsersServiceContext,
  userId: string,
  dto: ResetUserPasswordDto,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const trimmed =
    typeof dto.password === 'string' && dto.password.trim().length > 0
      ? dto.password.trim()
      : null;
  const nextPassword = trimmed ?? generateRandomString(20, 'a-z', 'A-Z', '0-9');
  const hashed = await hashPassword(nextPassword);
  const accountIdentifier = generateRandomString(32, 'a-z', 'A-Z', '0-9');

  await ctx.prisma.$transaction(async (tx) => {
    const credential = await tx.account.findFirst({
      where: {
        userId,
        OR: [
          { provider: 'credential' },
          { providerId: 'credential' },
          { providerAccountId: 'credential' },
        ],
      },
    });

    if (credential) {
      await tx.account.update({
        where: { id: credential.id },
        data: { password: hashed },
      });
    } else {
      await tx.account.create({
        data: {
          userId,
          accountId: accountIdentifier,
          type: 'credential',
          provider: 'credential',
          providerId: 'credential',
          providerAccountId: accountIdentifier,
          password: hashed,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        passwordNeedsReset: !trimmed,
        passwordUpdatedAt: trimmed ? new Date() : null,
      } as Prisma.UserUpdateInput,
    });

    await tx.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.OTHER,
        occurredAt: new Date(),
        source: 'admin-reset-password',
        notes: '管理员重置密码',
        metadata: toJsonValue({ actorId }),
        createdById: actorId,
      },
    });
  });

  await ctx.adminAuditService.record({
    actorId,
    action: 'reset_password',
    targetType: 'user',
    targetId: userId,
    payload: { generated: !trimmed },
  });

  return {
    temporaryPassword: trimmed ? null : nextPassword,
  };
}

export async function ensureUser(ctx: UsersServiceContext, userId: string) {
  const exists = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) {
    throw new NotFoundException('User not found');
  }
}
