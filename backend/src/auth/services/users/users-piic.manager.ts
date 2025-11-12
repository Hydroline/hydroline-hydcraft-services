import { PIICStatus } from '@prisma/client';
import { UsersServiceContext } from './users.context';
import { ensureUser } from './users-core.manager';
import { generatePiic, toJsonValue } from './users.helpers';
import { RegeneratePiicDto } from '../../dto/regenerate-piic.dto';

export async function regeneratePiic(
  ctx: UsersServiceContext,
  userId: string,
  dto: RegeneratePiicDto,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const newPiic = await generatePiic(ctx, ctx.prisma);
  const now = new Date();

  const result = await ctx.prisma.$transaction(async (tx) => {
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
        metadata: toJsonValue({ actorId }),
        generatedById: actorId,
      },
    });

    return profile;
  });

  return result;
}
