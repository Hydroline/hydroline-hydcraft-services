import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MinecraftProfileSource, Prisma } from '@prisma/client';
import { UsersServiceContext } from './users.context';
import { ensureUser } from './users-core.manager';
import { setPrimaryMinecraftProfile, toJson } from './users.helpers';
import { CreateMinecraftProfileDto } from '../../dto/create-minecraft-profile.dto';
import { UpdateMinecraftProfileDto } from '../../dto/update-minecraft-profile.dto';

export async function addMinecraftProfile(
  ctx: UsersServiceContext,
  userId: string,
  dto: CreateMinecraftProfileDto,
) {
  await ensureUser(ctx, userId);

  const binding = dto.authmeBindingId
    ? await ctx.prisma.userAuthmeBinding.findUnique({
        where: { id: dto.authmeBindingId },
      })
    : null;
  if (binding && binding.userId !== userId) {
    throw new BadRequestException(
      'AuthMe binding does not belong to this user',
    );
  }

  if (!binding && !dto.nickname) {
    throw new BadRequestException(
      'Must provide either a nickname or an AuthMe binding',
    );
  }

  const authmeUuid = dto.authmeUuid ?? binding?.authmeUuid ?? null;
  const nickname = dto.nickname ?? binding?.authmeRealname ?? null;
  const profile = await ctx.prisma.userMinecraftProfile.create({
    data: {
      userId,
      authmeBindingId: binding?.id ?? null,
      authmeUuid,
      nickname,
      isPrimary: dto.isPrimary ?? false,
      source: dto.source ?? MinecraftProfileSource.MANUAL,
      verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : undefined,
      verificationNote: dto.verificationNote,
      metadata: toJson(dto.metadata),
    },
  });

  if (profile.isPrimary) {
    await setPrimaryMinecraftProfile(ctx, userId, profile.id);
  }

  return profile;
}

export async function updateMinecraftProfile(
  ctx: UsersServiceContext,
  userId: string,
  profileId: string,
  dto: UpdateMinecraftProfileDto,
) {
  await ensureUser(ctx, userId);
  const target = await ctx.prisma.userMinecraftProfile.findUnique({
    where: { id: profileId },
  });
  if (!target || target.userId !== userId) {
    throw new NotFoundException('Minecraft profile not found for user');
  }

  const binding = dto.authmeBindingId
    ? await ctx.prisma.userAuthmeBinding.findUnique({
        where: { id: dto.authmeBindingId },
      })
    : null;
  if (binding && binding.userId !== userId) {
    throw new BadRequestException(
      'AuthMe binding does not belong to this user',
    );
  }

  if (!binding && dto.authmeBindingId) {
    throw new NotFoundException('Specified AuthMe binding not found');
  }

  if (!binding && !dto.nickname && !target.nickname) {
    throw new BadRequestException(
      'Must provide either a nickname or an AuthMe binding',
    );
  }

  const updated = await ctx.prisma.userMinecraftProfile.update({
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
          ? toJson(dto.metadata)
          : (target.metadata ?? Prisma.JsonNull),
    },
  });

  if (dto.isPrimary) {
    await setPrimaryMinecraftProfile(ctx, userId, profileId);
  }

  return updated;
}

export async function removeMinecraftProfile(
  ctx: UsersServiceContext,
  userId: string,
  profileId: string,
) {
  await ensureUser(ctx, userId);
  const target = await ctx.prisma.userMinecraftProfile.findUnique({
    where: { id: profileId },
  });
  if (!target || target.userId !== userId) {
    throw new NotFoundException('Minecraft profile not found for user');
  }

  await ctx.prisma.$transaction(async (tx) => {
    await tx.userMinecraftProfile.delete({ where: { id: profileId } });

    if (target.isPrimary) {
      const next = await tx.userMinecraftProfile.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await tx.userMinecraftProfile.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
        await tx.userProfile.updateMany({
          where: { userId },
          data: { primaryMinecraftProfileId: next.id },
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
