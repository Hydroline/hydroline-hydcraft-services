import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  AuthmeBindingAction,
  ContactVerificationStatus,
  LifecycleEventType,
  MinecraftProfileSource,
  PIICStatus,
  PlayerStatus,
  Prisma,
  StatusSource,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { generateRandomString, hashPassword } from 'better-auth/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthmeBindingService } from '../authme/authme-binding.service';
import { AuthmeService } from '../authme/authme.service';
import { LuckpermsService } from '../luckperms/luckperms.service';
import type { LuckpermsPlayer } from '../luckperms/luckperms.interfaces';
import { CreateLifecycleEventDto } from './dto/create-lifecycle-event.dto';
import { CreateMinecraftProfileDto } from './dto/create-minecraft-profile.dto';
import { CreateStatusEventDto } from './dto/create-status-event.dto';
import { CreateUserContactDto } from './dto/create-user-contact.dto';
import { RegeneratePiicDto } from './dto/regenerate-piic.dto';
import { UpdateMinecraftProfileDto } from './dto/update-minecraft-profile.dto';
import { UpdateUserContactDto } from './dto/update-user-contact.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import {
  UpdateCurrentUserDto,
  UpdateCurrentUserProfileExtraDto,
} from './dto/update-current-user.dto';
import { IpLocationService } from '../lib/ip2region/ip-location.service';
import { normalizeIpAddress } from '../lib/ip2region/ip-normalizer';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAuthmeBindingAdminDto } from './dto/update-authme-binding-admin.dto';
import { AssignPermissionLabelsDto } from './dto/assign-permission-labels.dto';
import { AdminAuditService } from './admin-audit.service';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

type AuthmeBindingSnapshot = {
  id: string | null;
  authmeUsername: string;
  authmeRealname: string | null;
  authmeUuid: string | null;
  boundAt: Date | string | null;
  ip: string | null;
  regip: string | null;
  lastlogin: number | null;
  regdate: number | null;
};

type LuckpermsSnapshotGroup = LuckpermsPlayer['groups'][number] & {
  displayName: string | null;
};

type LuckpermsSnapshot = {
  authmeUsername: string;
  username: string | null;
  uuid: string | null;
  primaryGroup: string | null;
  primaryGroupDisplayName: string | null;
  groups: LuckpermsSnapshotGroup[];
  synced: boolean;
};

@Injectable()
export class UsersService {
  private readonly piicPrefix = 'HC';

  constructor(
    private readonly prisma: PrismaService,
    private readonly authmeService: AuthmeService,
    private readonly authmeBindingService: AuthmeBindingService,
    private readonly luckpermsService: LuckpermsService,
    private readonly ipLocationService: IpLocationService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async initializeUserRecords(
    userId: string,
    options: {
      displayName?: string;
      minecraftId?: string;
      minecraftNick?: string;
      source?: MinecraftProfileSource;
      createdById?: string;
    } = {},
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.findUnique({ where: { userId } });
      if (!profile) {
        const piic = await this.generatePiic(tx);
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
            metadata: this.toJsonValue({ createdBy: 'auth-service' }),
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

      // Initialize joinDate if not set
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

  async listUsers(params: {
    keyword?: string;
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
  }) {
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
                  OR: [
                    { nickname: { contains: keyword, mode: 'insensitive' } },
                    {
                      authmeBinding: {
                        authmeUsername: {
                          contains: keyword,
                          mode: 'insensitive',
                        },
                      },
                    },
                  ],
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
    const sort = this.resolveUserSort(sortField, sortOrder);
    if (sort) {
      orderBy.push(sort);
    }
    orderBy.push({ createdAt: 'desc' });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          profile: true,
          statusSnapshot: true,
          roles: { include: { role: true } },
          minecraftIds: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
            take: 5,
            include: {
              authmeBinding: {
                select: {
                  id: true,
                  authmeUsername: true,
                  authmeRealname: true,
                  authmeUuid: true,
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
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  private resolveUserSort(
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

  async getSessionUser(userId: string) {
    const user = await this.prisma.user.findUnique({
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
            id: true,
            userId: true,
            roleId: true,
            assignedAt: true,
            metadata: true,
            role: {
              select: {
                id: true,
                key: true,
                name: true,
                description: true,
                isSystem: true,
                metadata: true,
                rolePermissions: {
                  select: {
                    id: true,
                    roleId: true,
                    permissionId: true,
                    permission: {
                      select: {
                        id: true,
                        key: true,
                        description: true,
                        metadata: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        permissionLabels: {
          select: {
            id: true,
            labelId: true,
            assignedAt: true,
            label: {
              select: {
                id: true,
                key: true,
                name: true,
                color: true,
                permissions: {
                  select: {
                    permission: {
                      select: {
                        id: true,
                        key: true,
                        description: true,
                        metadata: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        statusSnapshot: {
          select: {
            userId: true,
            status: true,
            updatedAt: true,
            statusEventId: true,
            event: {
              select: {
                id: true,
                status: true,
                reasonCode: true,
                source: true,
                createdAt: true,
                metadata: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Enrich AuthMe bindings with live metadata and expose LuckPerms snapshots alongside bindings
    const normalizedLastLoginIp = normalizeIpAddress(user.lastLoginIp);
    const [lastLoginLocation, bindingData] = await Promise.all([
      normalizedLastLoginIp
        ? this.ipLocationService.lookup(normalizedLastLoginIp)
        : Promise.resolve(null),
      this.composeAuthmeBindingSnapshots(user.authmeBindings),
    ]);

    return {
      ...user,
      lastLoginIp: normalizedLastLoginIp,
      lastLoginIpLocation: lastLoginLocation?.display ?? null,
      lastLoginIpLocationRaw: lastLoginLocation?.raw ?? null,
      authmeBindings: bindingData.bindings,
      luckperms: bindingData.luckperms,
    } as typeof user & {
      authmeBindings: typeof bindingData.bindings;
      luckperms: typeof bindingData.luckperms;
      lastLoginIp: typeof normalizedLastLoginIp;
      lastLoginIpLocation: string | null;
      lastLoginIpLocationRaw: string | null;
    };
  }

  async updateCurrentUser(userId: string, dto: UpdateCurrentUserDto) {
    await this.ensureUser(userId);
    const userUpdate: Prisma.UserUpdateInput = {};
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, nameChangedAt: true, email: true },
    });

    if (dto.name !== undefined) {
      const normalizedName = this.normalizeEmptyToNull(dto.name);
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
      const normalizedImage = this.normalizeEmptyToNull(dto.image);
      userUpdate.image = normalizedImage ?? null;
    }

    if (dto.email !== undefined) {
      const normalizedEmail = this.normalizeOptionalString(dto.email);
      if (normalizedEmail !== undefined && normalizedEmail !== current?.email) {
        // Ensure email uniqueness (DB has unique constraint as well)
        const exists = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });
        if (exists && exists.id !== userId) {
          throw new BadRequestException('该邮箱已被其他账户使用');
        }
        userUpdate.email = normalizedEmail;
        // Reset emailVerified when email changed
        userUpdate.emailVerified = false;
      }
    }

    if (Object.keys(userUpdate).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdate,
      });
    }

    const profilePayload: UpdateUserProfileDto = {};
    const normalizedDisplayName = this.normalizeOptionalString(dto.displayName);
    if (normalizedDisplayName !== undefined) {
      profilePayload.displayName = normalizedDisplayName;
    }
    if (dto.birthday !== undefined) {
      profilePayload.birthday = dto.birthday;
    }
    if (dto.gender !== undefined) {
      profilePayload.gender = dto.gender;
    }
    const normalizedMotto = this.normalizeOptionalString(dto.motto);
    if (normalizedMotto !== undefined) {
      profilePayload.motto = normalizedMotto;
    }
    const normalizedTimezone = this.normalizeOptionalString(dto.timezone);
    if (normalizedTimezone !== undefined) {
      profilePayload.timezone = normalizedTimezone;
    }
    const normalizedLocale = this.normalizeOptionalString(dto.locale);
    if (normalizedLocale !== undefined) {
      profilePayload.locale = normalizedLocale;
    }
    const extraPayload = this.normalizeProfileExtra(dto.extra);
    if (extraPayload !== undefined) {
      profilePayload.extra = extraPayload;
    }

    if (Object.keys(profilePayload).length > 0) {
      await this.updateProfile(userId, profilePayload);
    }

    return this.getSessionUser(userId);
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        minecraftIds: {
          include: {
            authmeBinding: {
              select: {
                id: true,
                authmeUsername: true,
                authmeRealname: true,
                authmeUuid: true,
              },
            },
          },
        },
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

    // Mirror compose logic from session user to expose LuckPerms snapshots for detail view
    const bindingData = await this.composeAuthmeBindingSnapshots(
      user.authmeBindings,
    );

    return {
      ...user,
      authmeBindings: bindingData.bindings,
      luckperms: bindingData.luckperms,
    } as typeof user & {
      authmeBindings: typeof bindingData.bindings;
      luckperms: typeof bindingData.luckperms;
    };
  }

  async deleteUser(userId: string) {
    await this.ensureUser(userId);
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true } as const;
  }

  async resetUserPassword(
    userId: string,
    dto: ResetUserPasswordDto,
    actorId?: string,
  ) {
    await this.ensureUser(userId);
    const trimmed =
      typeof dto.password === 'string' && dto.password.trim().length > 0
        ? dto.password.trim()
        : null;
    const nextPassword =
      trimmed ?? generateRandomString(20, 'a-z', 'A-Z', '0-9');
    const hashed = await hashPassword(nextPassword);
    const accountIdentifier = generateRandomString(32, 'a-z', 'A-Z', '0-9');

    await this.prisma.$transaction(async (tx) => {
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
        data: { password: hashed },
      });

      await tx.userLifecycleEvent.create({
        data: {
          userId,
          eventType: LifecycleEventType.OTHER,
          occurredAt: new Date(),
          source: 'admin-reset-password',
          notes: '管理员重置密码',
          metadata: this.toJsonValue({ actorId }),
          createdById: actorId,
        },
      });
    });

    await this.adminAuditService.record({
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

  async updateAuthmeBinding(
    userId: string,
    bindingId: string,
    dto: UpdateAuthmeBindingAdminDto,
    actorId?: string,
  ) {
    await this.ensureUser(userId);
    const binding = await this.prisma.userAuthmeBinding.findUnique({
      where: { id: bindingId },
    });
    if (!binding || binding.userId !== userId) {
      throw new NotFoundException('AuthMe 绑定不存在');
    }

    const normalizedRealname =
      dto.authmeRealname !== undefined
        ? this.normalizeOptionalString(dto.authmeRealname ?? undefined)
        : undefined;
    const normalizedNotes =
      dto.notes !== undefined
        ? this.normalizeOptionalString(dto.notes ?? undefined)
        : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      let destinationUserId = binding.userId;
      if (dto.targetUserId && dto.targetUserId !== binding.userId) {
        await this.ensureUser(dto.targetUserId);
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
          notes:
            normalizedNotes !== undefined ? normalizedNotes : binding.notes,
          metadata:
            dto.metadata !== undefined
              ? this.toJsonValue(dto.metadata)
              : (binding.metadata as Prisma.InputJsonValue | undefined),
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
        await this.authmeBindingService.recordHistoryEntry(
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
        await this.authmeBindingService.recordHistoryEntry(
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
      } else {
        await this.authmeBindingService.recordHistoryEntry(
          {
            bindingId: record.id,
            userId: record.userId,
            operatorId: actorId ?? null,
            authmeUsername: record.authmeUsername,
            authmeRealname: record.authmeRealname,
            authmeUuid: record.authmeUuid,
            action: AuthmeBindingAction.MANUAL_ENTRY,
            reason: 'binding-updated',
            payload: {
              status: dto.status,
              notes: dto.notes,
              metadata: dto.metadata,
            },
          },
          tx,
        );
      }

      return record;
    });

    if (dto.primary === true) {
      await this.setPrimaryAuthmeBinding(
        updated.userId,
        updated.id,
        actorId ?? userId,
      );
    }

    return updated;
  }

  async listAuthmeBindingHistoryByUser(
    userId: string,
    params: { page?: number; pageSize?: number } = {},
  ) {
    await this.ensureUser(userId);
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.authmeBindingHistory.findMany({
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
      this.prisma.authmeBindingHistory.count({ where }),
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

  async assignPermissionLabels(
    userId: string,
    dto: AssignPermissionLabelsDto,
    actorId?: string,
  ) {
    await this.ensureUser(userId);
    const labelKeys = dto.labelKeys ?? [];
    const labels = await this.prisma.permissionLabel.findMany({
      where: labelKeys.length ? { key: { in: labelKeys } } : undefined,
    });
    if (labelKeys.length && labels.length !== labelKeys.length) {
      const missing = labelKeys.filter(
        (key) => !labels.find((label) => label.key === key),
      );
      throw new NotFoundException(
        `Permission labels not found: ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionLabel.deleteMany({ where: { userId } });
      if (labels.length > 0) {
        await tx.userPermissionLabel.createMany({
          data: labels.map((label) => ({
            userId,
            labelId: label.id,
            assignedById: actorId,
          })),
        });
      }
    });

    await this.adminAuditService.record({
      actorId,
      action: 'assign_permission_labels',
      targetType: 'user',
      targetId: userId,
      payload: { labelKeys },
    });

    return this.getUserDetail(userId);
  }

  async updateJoinDate(userId: string, joinDateIso: string) {
    await this.ensureUser(userId);
    const date = new Date(joinDateIso);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('无效的入服日期');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { joinDate: date },
      select: { id: true, joinDate: true },
    });
    return user;
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto) {
    await this.ensureUser(userId);
    const data: Prisma.UserProfileUpdateInput = {
      ...(dto.displayName && { displayName: dto.displayName }),
      ...(dto.birthday && { birthday: new Date(dto.birthday) }),
      ...(dto.gender && { gender: dto.gender }),
      ...(dto.motto && { motto: dto.motto }),
      ...(dto.timezone && { timezone: dto.timezone }),
      ...(dto.locale && { locale: dto.locale }),
      ...(dto.extra && { extra: this.toJson(dto.extra) }),
    };

    const profile = await this.prisma.userProfile.upsert({
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
        extra: this.toJson(dto.extra),
        piic: await this.generatePiic(this.prisma),
        piicAssignedAt: new Date(),
      },
    });

    return profile;
  }

  async addMinecraftProfile(userId: string, dto: CreateMinecraftProfileDto) {
    await this.ensureUser(userId);

    const binding = dto.authmeBindingId
      ? await this.prisma.userAuthmeBinding.findUnique({
          where: { id: dto.authmeBindingId },
        })
      : null;
    if (binding && binding.userId !== userId) {
      throw new BadRequestException('AuthMe 绑定不属于该用户');
    }

    if (!binding && !dto.nickname) {
      throw new BadRequestException('请至少填写昵称或关联一个 AuthMe 账户');
    }

    const authmeUuid = dto.authmeUuid ?? binding?.authmeUuid ?? null;
    const nickname = dto.nickname ?? binding?.authmeRealname ?? null;
    const profile = await this.prisma.userMinecraftProfile.create({
      data: {
        userId,
        authmeBindingId: binding?.id ?? null,
        authmeUuid,
        nickname,
        isPrimary: dto.isPrimary ?? false,
        source: dto.source ?? MinecraftProfileSource.MANUAL,
        verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : undefined,
        verificationNote: dto.verificationNote,
        metadata: this.toJson(dto.metadata),
      },
    });

    if (profile.isPrimary) {
      await this.setPrimaryMinecraftProfile(userId, profile.id);
    }

    return profile;
  }

  async updateMinecraftProfile(
    userId: string,
    profileId: string,
    dto: UpdateMinecraftProfileDto,
  ) {
    await this.ensureUser(userId);
    const target = await this.prisma.userMinecraftProfile.findUnique({
      where: { id: profileId },
    });
    if (!target || target.userId !== userId) {
      throw new NotFoundException('Minecraft profile not found for user');
    }

    const binding = dto.authmeBindingId
      ? await this.prisma.userAuthmeBinding.findUnique({
          where: { id: dto.authmeBindingId },
        })
      : null;
    if (binding && binding.userId !== userId) {
      throw new BadRequestException('AuthMe 绑定不属于该用户');
    }

    if (!binding && dto.authmeBindingId) {
      throw new NotFoundException('指定的 AuthMe 绑定不存在');
    }

    if (!binding && !dto.nickname && !target.nickname) {
      throw new BadRequestException('请至少填写昵称或关联一个 AuthMe 账户');
    }

    const updated = await this.prisma.userMinecraftProfile.update({
      where: { id: profileId },
      data: {
        authmeBindingId:
          binding?.id ?? dto.authmeBindingId ?? target.authmeBindingId,
        authmeUuid: dto.authmeUuid ?? binding?.authmeUuid ?? target.authmeUuid,
        nickname: dto.nickname ?? target.nickname,
        source: dto.source,
        isPrimary: dto.isPrimary ?? target.isPrimary,
        verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : undefined,
        verificationNote: dto.verificationNote,
        metadata:
          dto.metadata !== undefined
            ? this.toJson(dto.metadata)
            : (target.metadata as Prisma.InputJsonValue | undefined),
      },
    });

    if (dto.isPrimary) {
      await this.setPrimaryMinecraftProfile(userId, profileId);
    }

    return updated;
  }

  async removeMinecraftProfile(userId: string, profileId: string) {
    await this.ensureUser(userId);
    const target = await this.prisma.userMinecraftProfile.findUnique({
      where: { id: profileId },
    });
    if (!target || target.userId !== userId) {
      throw new NotFoundException('Minecraft profile not found for user');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userMinecraftProfile.delete({ where: { id: profileId } });
      if (target.isPrimary) {
        const first = await tx.userMinecraftProfile.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        });
        if (first) {
          await tx.userMinecraftProfile.update({
            where: { id: first.id },
            data: { isPrimary: true },
          });
          await tx.userProfile.updateMany({
            where: { userId },
            data: { primaryMinecraftProfileId: first.id },
          });
        } else {
          await tx.userProfile.updateMany({
            where: { userId },
            data: { primaryMinecraftProfileId: null },
          });
        }
      }
    });
  }

  async addStatusEvent(
    userId: string,
    dto: CreateStatusEventDto,
    createdById?: string,
  ) {
    await this.ensureUser(userId);
    const event = await this.prisma.userStatusEvent.create({
      data: {
        userId,
        status: dto.status,
        reasonCode: dto.reasonCode,
        reasonDetail: dto.reasonDetail,
        source: dto.source ?? StatusSource.ADMIN,
        metadata: this.toJson(dto.metadata),
        createdById,
      },
    });

    await this.prisma.userStatusSnapshot.upsert({
      where: { userId },
      update: {
        statusEventId: event.id,
        status: event.status,
      },
      create: {
        userId,
        statusEventId: event.id,
        status: event.status,
      },
    });

    await this.prisma.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.STATUS_CHANGE,
        occurredAt: new Date(),
        source: dto.source ?? StatusSource.ADMIN,
        metadata: this.toJsonValue({
          status: event.status,
          reasonCode: event.reasonCode,
        }),
        createdById,
      },
    });

    return event;
  }

  async addLifecycleEvent(
    userId: string,
    dto: CreateLifecycleEventDto,
    createdById?: string,
  ) {
    await this.ensureUser(userId);
    const event = await this.prisma.userLifecycleEvent.create({
      data: {
        userId,
        eventType: dto.eventType,
        occurredAt: new Date(dto.occurredAt),
        source: dto.source,
        notes: dto.notes,
        metadata: this.toJson(dto.metadata),
        createdById,
      },
    });
    return event;
  }

  async addContact(userId: string, dto: CreateUserContactDto) {
    await this.ensureUser(userId);
    const channel = await this.prisma.contactChannel.findUnique({
      where: { key: dto.channelKey },
    });
    if (!channel) {
      throw new NotFoundException('Contact channel not found');
    }

    if (!channel.allowMultiple) {
      const exists = await this.prisma.userContact.findFirst({
        where: { userId, channelId: channel.id },
      });
      if (exists) {
        throw new BadRequestException('Channel does not allow multiple values');
      }
    }

    if (dto.isPrimary) {
      await this.clearPrimaryContact(userId, channel.id);
    }

    const contact = await this.prisma.userContact.create({
      data: {
        userId,
        channelId: channel.id,
        value: dto.value,
        isPrimary: dto.isPrimary ?? false,
        verification: dto.verification ?? ContactVerificationStatus.UNVERIFIED,
        verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : undefined,
        metadata: this.toJson(dto.metadata),
      },
      include: { channel: true },
    });

    return contact;
  }

  async updateContact(
    userId: string,
    contactId: string,
    dto: UpdateUserContactDto,
  ) {
    await this.ensureUser(userId);
    const existing = await this.prisma.userContact.findUnique({
      include: { channel: true },
      where: { id: contactId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Contact not found');
    }

    if (dto.isPrimary) {
      await this.clearPrimaryContact(userId, existing.channelId);
    }

    const contact = await this.prisma.userContact.update({
      where: { id: contactId },
      data: {
        value: dto.value,
        isPrimary: dto.isPrimary ?? existing.isPrimary,
        verification: dto.verification ?? existing.verification,
        verifiedAt: dto.verifiedAt
          ? new Date(dto.verifiedAt)
          : existing.verifiedAt,
        metadata:
          dto.metadata !== undefined
            ? this.toJson(dto.metadata)
            : (existing.metadata as Prisma.InputJsonValue | undefined),
      },
      include: { channel: true },
    });

    return contact;
  }

  async removeContact(userId: string, contactId: string) {
    await this.ensureUser(userId);
    const existing = await this.prisma.userContact.findUnique({
      where: { id: contactId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Contact not found');
    }
    await this.prisma.userContact.delete({ where: { id: contactId } });
  }

  async regeneratePiic(
    userId: string,
    dto: RegeneratePiicDto,
    actorId?: string,
  ) {
    await this.ensureUser(userId);
    const newPiic = await this.generatePiic(this.prisma);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        update: {
          piic: newPiic,
          piicAssignedAt: now,
        },
        create: {
          userId,
          piic: newPiic,
          piicAssignedAt: now,
        },
      });

      await tx.userPiicHistory.updateMany({
        where: { userId, status: PIICStatus.ACTIVE },
        data: {
          status: PIICStatus.REVOKED,
          revokedAt: now,
          revokedById: actorId,
        },
      });

      await tx.userPiicHistory.create({
        data: {
          userId,
          piic: newPiic,
          status: PIICStatus.ACTIVE,
          reason: dto.reason ?? 'regenerated',
          metadata: this.toJsonValue({ actorId }),
          generatedById: actorId,
        },
      });

      return profile;
    });

    return result;
  }

  async assignRoles(userId: string, roleKeys: string[], actorId?: string) {
    await this.ensureUser(userId);
    const roles = await this.prisma.role.findMany({
      where: { key: { in: roleKeys } },
    });
    if (roles.length !== roleKeys.length) {
      const missing = roleKeys.filter(
        (key) => !roles.find((r) => r.key === key),
      );
      throw new NotFoundException(`Roles not found: ${missing.join(', ')}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({
          userId,
          roleId: role.id,
          assignedById: actorId,
        })),
      });
    });

    await this.adminAuditService.record({
      actorId,
      action: 'assign_roles',
      targetType: 'user',
      targetId: userId,
      payload: { roleKeys },
    });

    return this.getUserDetail(userId);
  }

  async setPrimaryAuthmeBinding(
    userId: string,
    bindingId: string,
    actorId?: string,
  ) {
    await this.ensureUser(userId);
    const [binding, profile] = await Promise.all([
      this.prisma.userAuthmeBinding.findUnique({
        where: { id: bindingId },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: { primaryAuthmeBindingId: true },
      }),
    ]);
    if (!binding || binding.userId !== userId) {
      throw new NotFoundException('AuthMe 绑定不存在');
    }

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        primaryAuthmeBindingId: bindingId,
      },
      update: { primaryAuthmeBindingId: bindingId },
    });

    await this.authmeBindingService.recordHistoryEntry({
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
      const previous = await this.prisma.userAuthmeBinding.findUnique({
        where: { id: previousPrimaryId },
      });
      if (previous) {
        await this.authmeBindingService.recordHistoryEntry({
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

  async unbindAuthmeBinding(
    userId: string,
    bindingId: string,
    actorId?: string,
  ) {
    await this.ensureUser(userId);
    const binding = await this.prisma.userAuthmeBinding.findUnique({
      where: { id: bindingId },
    });
    if (!binding || binding.userId !== userId) {
      throw new NotFoundException('AuthMe 绑定不存在');
    }
    // 预获取当前主绑定，供自动流转判定
    const profileBefore = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { primaryAuthmeBindingId: true },
    });
    const wasPrimary = profileBefore?.primaryAuthmeBindingId === bindingId;
    await this.prisma.$transaction(async (tx) => {
      // 清理 profile 主绑定
      await tx.userProfile.updateMany({
        where: { userId, primaryAuthmeBindingId: bindingId },
        data: { primaryAuthmeBindingId: null },
      });
      // 清理 minecraft profile 引用
      await tx.userMinecraftProfile.updateMany({
        where: { userId, authmeBindingId: bindingId },
        data: { authmeBindingId: null },
      });
      // 记录历史
      await this.authmeBindingService.recordHistoryEntry(
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
      // 删除绑定记录
      await tx.userAuthmeBinding.delete({ where: { id: bindingId } });
      // 生命周期事件
      await tx.userLifecycleEvent.create({
        data: {
          userId,
          eventType: LifecycleEventType.ACCOUNT_UNBIND,
          occurredAt: new Date(),
          source: 'admin-unbind',
          metadata: this.toJsonValue({ bindingId }),
          createdById: actorId ?? userId,
        },
      });
      // 自动主绑定流转：若删除的是当前主绑定，则选择剩余最早绑定设为主
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
          await this.authmeBindingService.recordHistoryEntry(
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
    await this.adminAuditService.record({
      actorId,
      action: 'unbind_authme',
      targetType: 'authme_binding',
      targetId: bindingId,
      payload: { userId, authmeUsername: binding.authmeUsername },
    });
    return { success: true } as const;
  }

  async ensureUser(userId: string) {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }

  private async generatePiic(client: PrismaClientOrTx) {
    let attempt = 0;
    while (attempt < 5) {
      const piic = `${this.piicPrefix}${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const count = await client.userPiicHistory.count({ where: { piic } });
      if (count === 0) {
        return piic;
      }
      attempt += 1;
    }
    throw new Error('Failed to generate unique PIIC');
  }

  private async setPrimaryMinecraftProfile(userId: string, profileId: string) {
    await this.prisma.$transaction([
      this.prisma.userMinecraftProfile.updateMany({
        where: { userId, NOT: { id: profileId } },
        data: { isPrimary: false },
      }),
      this.prisma.userMinecraftProfile.update({
        where: { id: profileId },
        data: { isPrimary: true },
      }),
      this.prisma.userProfile.updateMany({
        where: { userId },
        data: { primaryMinecraftProfileId: profileId },
      }),
    ]);
  }

  private async clearPrimaryContact(userId: string, channelId: string) {
    await this.prisma.userContact.updateMany({
      where: { userId, channelId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  private async composeAuthmeBindingSnapshots(
    entries:
      | ReadonlyArray<{
          id?: string;
          authmeUsername: string;
          authmeRealname: string | null;
          authmeUuid?: string | null;
          boundAt: Date | string | null;
        }>
      | null
      | undefined,
  ) {
    const rawList = Array.isArray(entries) ? entries : [];
    const list = rawList
      .map((entry) => {
        const payload = entry as Record<string, unknown>;
        const rawUsername = payload.authmeUsername;
        let username = '';
        if (typeof rawUsername === 'string') {
          username = rawUsername.trim();
        } else if (typeof rawUsername === 'number') {
          username = String(rawUsername).trim();
        }

        const id =
          typeof payload.id === 'string' && payload.id.length > 0
            ? payload.id
            : null;
        const rawRealname = payload.authmeRealname;
        const realnameRaw =
          typeof rawRealname === 'string' ? rawRealname.trim() : null;

        const rawUuid = payload.authmeUuid;
        const authmeUuid =
          typeof rawUuid === 'string' && rawUuid.trim().length > 0
            ? rawUuid.trim()
            : null;

        const boundAtValue = (payload.boundAt ?? null) as Date | string | null;
        let boundAt: Date | string | null = null;
        if (boundAtValue instanceof Date || typeof boundAtValue === 'string') {
          boundAt = boundAtValue;
        }
        return {
          id,
          authmeUsername: username,
          authmeRealname:
            realnameRaw && realnameRaw.length > 0 ? realnameRaw : null,
          authmeUuid,
          boundAt,
        };
      })
      .filter((entry) => entry.authmeUsername.length > 0);

    if (list.length === 0) {
      return {
        bindings: [] as AuthmeBindingSnapshot[],
        luckperms: [] as LuckpermsSnapshot[],
      };
    }

    const results = await Promise.all(
      list.map(async (binding) => {
        const fallback = {
          binding: {
            id: binding.id,
            authmeUsername: binding.authmeUsername,
            authmeRealname: binding.authmeRealname,
            authmeUuid: binding.authmeUuid,
            boundAt: binding.boundAt,
            ip: null,
            regip: null,
            lastlogin: null,
            regdate: null,
          } as AuthmeBindingSnapshot,
          luckperms: this.buildLuckpermsSnapshot(
            binding.authmeUsername,
            binding.authmeRealname,
            null,
            binding.authmeUuid,
          ),
        };

        try {
          const [account, luckperms] = await Promise.all([
            this.authmeService
              .getAccount(binding.authmeUsername)
              .catch(() => null),
            binding.authmeUuid
              ? this.luckpermsService
                  .getPlayerByUuid(binding.authmeUuid)
                  .catch(() => null)
              : this.luckpermsService
                  .getPlayerByUsername(
                    binding.authmeRealname ?? binding.authmeUsername,
                  )
                  .catch(() => null),
          ]);

          if (
            binding.id &&
            !binding.authmeUuid &&
            luckperms?.uuid &&
            luckperms.uuid.length > 0
          ) {
            await this.prisma.userAuthmeBinding
              .update({
                where: { id: binding.id },
                data: { authmeUuid: luckperms.uuid },
              })
              .catch(() => undefined);
            binding.authmeUuid = luckperms.uuid;
          }

          return {
            binding: {
              id: binding.id,
              authmeUsername: binding.authmeUsername,
              authmeRealname: binding.authmeRealname,
              authmeUuid: binding.authmeUuid ?? luckperms?.uuid ?? null,
              boundAt: binding.boundAt,
              ip: account?.ip ?? null,
              regip: account?.regip ?? null,
              lastlogin: account?.lastlogin ?? null,
              regdate: account?.regdate ?? null,
            } as AuthmeBindingSnapshot,
            luckperms: this.buildLuckpermsSnapshot(
              binding.authmeUsername,
              binding.authmeRealname,
              luckperms,
              binding.authmeUuid ?? luckperms?.uuid ?? null,
            ),
          };
        } catch {
          return fallback;
        }
      }),
    );

    return {
      bindings: results.map((entry) => entry.binding),
      luckperms: results.map((entry) => entry.luckperms),
    };
  }

  private buildLuckpermsSnapshot(
    authmeUsername: string,
    authmeRealname: string | null,
    player: LuckpermsPlayer | null,
    resolvedUuid: string | null,
  ): LuckpermsSnapshot {
    const trimmedRealname =
      typeof authmeRealname === 'string' && authmeRealname.trim().length > 0
        ? authmeRealname.trim()
        : null;
    const resolvedUsername =
      typeof player?.username === 'string' && player.username.length > 0
        ? player.username
        : (trimmedRealname ?? authmeUsername);
    const memberships = player?.groups ?? [];
    const groups: LuckpermsSnapshotGroup[] = memberships.map((membership) => ({
      ...membership,
      displayName: this.luckpermsService.getGroupDisplayName(membership.group),
    }));
    const primaryGroup = player?.primaryGroup ?? null;
    return {
      authmeUsername,
      username: resolvedUsername,
      uuid: resolvedUuid,
      primaryGroup,
      primaryGroupDisplayName:
        this.luckpermsService.getGroupDisplayName(primaryGroup),
      groups,
      synced: Boolean(player),
    };
  }

  private normalizeEmptyToNull(value?: string) {
    if (value === undefined) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeOptionalString(value?: string) {
    if (value === undefined) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeProfileExtra(extra?: UpdateCurrentUserProfileExtraDto) {
    if (extra === undefined) {
      return undefined;
    }
    const allowedKeys = [
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
      'phone',
      'phoneCountry',
      // region fields (CN/HK/MO/TW)
      'regionCountry',
      'regionProvince',
      'regionCity',
      'regionDistrict',
    ];
    const normalized: Record<string, string> = {};
    for (const key of allowedKeys) {
      const value = (extra as Record<string, unknown>)[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          normalized[key] = trimmed;
        }
      }
    }
    if (Object.keys(normalized).length === 0) {
      return {};
    }
    return normalized;
  }

  private toJson(input?: Record<string, unknown>) {
    return input as Prisma.InputJsonValue | undefined;
  }

  private toJsonValue(input: unknown) {
    return input as Prisma.InputJsonValue;
  }
}
