import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  ContactVerificationStatus,
  LifecycleEventType,
  MinecraftProfileSource,
  PIICStatus,
  PlayerStatus,
  Prisma,
  StatusSource,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLifecycleEventDto } from './dto/create-lifecycle-event.dto';
import { CreateMinecraftProfileDto } from './dto/create-minecraft-profile.dto';
import { CreateStatusEventDto } from './dto/create-status-event.dto';
import { CreateUserContactDto } from './dto/create-user-contact.dto';
import { RegeneratePiicDto } from './dto/regenerate-piic.dto';
import { UpdateMinecraftProfileDto } from './dto/update-minecraft-profile.dto';
import { UpdateUserContactDto } from './dto/update-user-contact.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UsersService {
  private readonly piicPrefix = 'HC';

  constructor(private readonly prisma: PrismaService) {}

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

      const latestStatus = await tx.userStatusSnapshot.findUnique({ where: { userId } });
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

      if (options.minecraftId) {
        const hasPrimary = await tx.userMinecraftProfile.findFirst({
          where: { userId, isPrimary: true },
        });
        const profile = await tx.userMinecraftProfile.create({
          data: {
            userId,
            minecraftId: options.minecraftId,
            nickname: options.minecraftNick,
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
  }) {
    const { keyword, page = 1, pageSize = 20 } = params;
    const where: Prisma.UserWhereInput = keyword
      ? {
          OR: [
            { email: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } },
            { profile: { piic: { contains: keyword, mode: 'insensitive' } } },
            { minecraftIds: { some: { minecraftId: { contains: keyword, mode: 'insensitive' } } } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          profile: true,
          statusSnapshot: true,
          roles: { include: { role: true } },
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

  async getSessionUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            id: true,
            userId: true,
            displayName: true,
            piic: true,
            piicAssignedAt: true,
            primaryMinecraftProfileId: true,
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

    return user;
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        minecraftIds: true,
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
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

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

    if (dto.playerUuid) {
      const duplicate = await this.prisma.userMinecraftProfile.findUnique({
        where: { playerUuid: dto.playerUuid },
      });
      if (duplicate && duplicate.userId !== userId) {
        throw new BadRequestException('playerUuid already associated with another user');
      }
    }

    const profile = await this.prisma.userMinecraftProfile.create({
      data: {
        userId,
        playerUuid: dto.playerUuid,
        minecraftId: dto.minecraftId,
        nickname: dto.nickname,
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

  async updateMinecraftProfile(userId: string, profileId: string, dto: UpdateMinecraftProfileDto) {
    await this.ensureUser(userId);
    const target = await this.prisma.userMinecraftProfile.findUnique({
      where: { id: profileId },
    });
    if (!target || target.userId !== userId) {
      throw new NotFoundException('Minecraft profile not found for user');
    }

    if (dto.playerUuid && dto.playerUuid !== target.playerUuid) {
      const duplicate = await this.prisma.userMinecraftProfile.findUnique({
        where: { playerUuid: dto.playerUuid },
      });
      if (duplicate && duplicate.userId !== userId) {
        throw new BadRequestException('playerUuid already associated with another user');
      }
    }

    const updated = await this.prisma.userMinecraftProfile.update({
      where: { id: profileId },
      data: {
        playerUuid: dto.playerUuid,
        minecraftId: dto.minecraftId,
        nickname: dto.nickname,
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
    const target = await this.prisma.userMinecraftProfile.findUnique({ where: { id: profileId } });
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

  async addStatusEvent(userId: string, dto: CreateStatusEventDto, createdById?: string) {
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
        metadata: this.toJsonValue({ status: event.status, reasonCode: event.reasonCode }),
        createdById,
      },
    });

    return event;
  }

  async addLifecycleEvent(userId: string, dto: CreateLifecycleEventDto, createdById?: string) {
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

  async updateContact(userId: string, contactId: string, dto: UpdateUserContactDto) {
    await this.ensureUser(userId);
    const existing = await this.prisma.userContact.findUnique({ include: { channel: true }, where: { id: contactId } });
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
        verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : existing.verifiedAt,
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
    const existing = await this.prisma.userContact.findUnique({ where: { id: contactId } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Contact not found');
    }
    await this.prisma.userContact.delete({ where: { id: contactId } });
  }

  async regeneratePiic(userId: string, dto: RegeneratePiicDto, actorId?: string) {
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
    const roles = await this.prisma.role.findMany({ where: { key: { in: roleKeys } } });
    if (roles.length !== roleKeys.length) {
      const missing = roleKeys.filter((key) => !roles.find((r) => r.key === key));
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

    return this.getUserDetail(userId);
  }

  async ensureUser(userId: string) {
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
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

  private toJson(input?: Record<string, unknown>) {
    return input as Prisma.InputJsonValue | undefined;
  }

  private toJsonValue(input: unknown) {
    return input as Prisma.InputJsonValue;
  }
}
