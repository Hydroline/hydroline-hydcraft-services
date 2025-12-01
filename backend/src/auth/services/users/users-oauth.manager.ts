import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersServiceContext } from './users.context';

export async function listUserOauthAccounts(
  ctx: UsersServiceContext,
  userId: string,
) {
  await ensureUserExists(ctx, userId);
  const accounts = await ctx.prisma.account.findMany({
    where: { userId, provider: { not: 'credential' } },
    orderBy: { createdAt: 'desc' },
  });

  const providerKeys = Array.from(new Set(accounts.map((a) => a.provider)));
  const providers = providerKeys.length
    ? await ctx.prisma.oAuthProvider.findMany({
        where: { key: { in: providerKeys } },
      })
    : [];
  const providerMap = new Map(providers.map((p) => [p.key, p]));

  return accounts.map((account) => {
    const provider = providerMap.get(account.provider) ?? null;
    return {
      id: account.id,
      provider: account.provider,
      providerId: account.providerId,
      providerAccountId: account.providerAccountId,
      type: account.type,
      profile: account.profile ?? null,
      createdAt: account.createdAt,
      providerName: provider?.name ?? null,
      providerType: provider?.type ?? null,
    };
  });
}

export async function unlinkUserOauthAccount(
  ctx: UsersServiceContext,
  userId: string,
  accountId: string,
  actorId?: string,
) {
  await ensureUserExists(ctx, userId);
  const account = await ctx.prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    throw new NotFoundException('OAuth binding does not exist');
  }
  if (account.userId !== userId) {
    throw new BadRequestException(
      'Binding record does not belong to this user',
    );
  }

  await ctx.prisma.account.delete({ where: { id: accountId } });
  await ctx.adminAuditService.record({
    actorId,
    action: 'unlink_oauth_account',
    targetType: 'user',
    targetId: userId,
    payload: {
      accountId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    },
  });
  return { success: true } as const;
}

async function ensureUserExists(ctx: UsersServiceContext, userId: string) {
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }
}
