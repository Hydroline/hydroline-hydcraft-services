import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { UpdateCurrentUserProfileExtraDto } from '../../dto/update-current-user.dto';
import type { LuckpermsPlayer } from '../../luckperms/luckperms.interfaces';
import type { UsersServiceContext, PrismaClientOrTx } from './users.context';

export type AuthmeBindingSnapshot = {
  id: string | null;
  authmeUsername: string;
  authmeRealname: string | null;
  authmeUuid: string | null;
  boundAt: Date | string | null;
  ip: string | null;
  regip: string | null;
  lastlogin: number | null;
  regdate: number | null;
  ipLocation?: string | null;
  ipLocationRaw?: string | null;
  regipLocation?: string | null;
  regipLocationRaw?: string | null;
  status?: string | null;
  notes?: string | null;
};

export type LuckpermsSnapshotGroup = LuckpermsPlayer['groups'][number] & {
  displayName: string | null;
};

export type LuckpermsSnapshot = {
  authmeUsername: string;
  username: string | null;
  uuid: string | null;
  primaryGroup: string | null;
  primaryGroupDisplayName: string | null;
  groups: LuckpermsSnapshotGroup[];
  synced: boolean;
};

export function normalizeEmptyToNull(value?: string) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeOptionalString(value?: string) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeProfileExtra(
  extra?: UpdateCurrentUserProfileExtraDto,
) {
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

export function toJson(input?: Record<string, unknown>) {
  return input as Prisma.InputJsonValue | undefined;
}

export function toJsonValue(input: unknown) {
  return input as Prisma.InputJsonValue;
}

export async function generatePiic(
  ctx: UsersServiceContext,
  client: PrismaClientOrTx,
) {
  let attempt = 0;
  while (attempt < 5) {
    const piic = `${ctx.piicPrefix}${randomUUID()
      .replace(/-/g, '')
      .slice(0, 10)
      .toUpperCase()}`;
    const count = await client.userPiicHistory.count({ where: { piic } });
    if (count === 0) {
      return piic;
    }
    attempt += 1;
  }
  throw new Error('Failed to generate unique PIIC');
}

export async function setPrimaryMinecraftProfile(
  ctx: UsersServiceContext,
  userId: string,
  profileId: string,
) {
  await ctx.prisma.$transaction([
    ctx.prisma.userMinecraftProfile.updateMany({
      where: { userId, NOT: { id: profileId } },
      data: { isPrimary: false },
    }),
    ctx.prisma.userMinecraftProfile.update({
      where: { id: profileId },
      data: { isPrimary: true },
    }),
    ctx.prisma.userProfile.updateMany({
      where: { userId },
      data: { primaryMinecraftProfileId: profileId },
    }),
  ]);
}

export async function clearPrimaryContact(
  ctx: UsersServiceContext,
  userId: string,
  channelId: string,
) {
  await ctx.prisma.userContact.updateMany({
    where: { userId, channelId, isPrimary: true },
    data: { isPrimary: false },
  });
}

export async function composeAuthmeBindingSnapshots(
  ctx: UsersServiceContext,
  entries:
    | ReadonlyArray<{
        id?: string;
        authmeUsername: string;
        authmeRealname: string | null;
        authmeUuid?: string | null;
        boundAt: Date | string | null;
        status?: string | null;
        notes?: string | null;
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

      let status: string | null = null;
      let notes: string | null = null;
      if (typeof (payload as { status?: unknown }).status === 'string') {
        status = (payload as { status?: string }).status ?? null;
      }
      if (typeof (payload as { notes?: unknown }).notes === 'string') {
        const rawNotes = (payload as { notes?: string }).notes?.trim() ?? '';
        notes = rawNotes.length > 0 ? rawNotes : null;
      }
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
        status,
        notes,
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
          status: binding.status ?? null,
          notes: binding.notes ?? null,
        } as AuthmeBindingSnapshot,
        luckperms: buildLuckpermsSnapshot(
          ctx,
          binding.authmeUsername,
          binding.authmeRealname,
          null,
          binding.authmeUuid,
        ),
      };

      try {
        const [account, luckperms] = await Promise.all([
          ctx.authmeService
            .getAccount(binding.authmeUsername)
            .catch(() => null),
          binding.authmeUuid
            ? ctx.luckpermsService
                .getPlayerByUuid(binding.authmeUuid)
                .catch(() => null)
            : ctx.luckpermsService
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
          await ctx.prisma.userAuthmeBinding
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
            status: binding.status ?? null,
            notes: binding.notes ?? null,
          } as AuthmeBindingSnapshot,
          luckperms: buildLuckpermsSnapshot(
            ctx,
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

export function buildLuckpermsSnapshot(
  ctx: UsersServiceContext,
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
    displayName: ctx.luckpermsService.getGroupDisplayName(membership.group),
  }));
  const primaryGroup = player?.primaryGroup ?? null;
  return {
    authmeUsername,
    username: resolvedUsername,
    uuid: resolvedUuid,
    primaryGroup,
    primaryGroupDisplayName:
      ctx.luckpermsService.getGroupDisplayName(primaryGroup),
    groups,
    synced: Boolean(player),
  };
}
