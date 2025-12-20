import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LuckpermsService } from './luckperms.service';
import { LuckpermsCacheService } from '../cache/luckperms-cache.service';
import type {
  LuckpermsPlayer,
  LuckpermsGroupMembership,
} from './luckperms.interfaces';

type LuckpermsPlayerCacheRecord = Prisma.LuckpermsPlayerCacheGetPayload<{}>;

@Injectable()
export class LuckpermsLookupService {
  constructor(
    private readonly luckpermsService: LuckpermsService,
    private readonly cache: LuckpermsCacheService,
  ) {}

  async getPlayerByUuid(
    uuid: string | undefined | null,
    options: { allowFallback?: boolean } = {},
  ): Promise<LuckpermsPlayer | null> {
    if (!uuid) {
      return null;
    }
    const cached = await this.cache.getPlayerByUuid(uuid);
    if (cached) {
      return this.mapCached(cached);
    }
    if (options.allowFallback ?? true) {
      try {
        return await this.luckpermsService.getPlayerByUuid(uuid);
      } catch {
        return null;
      }
    }
    return null;
  }

  async getPlayerByUsername(
    username: string | undefined | null,
    options: { allowFallback?: boolean } = {},
  ): Promise<LuckpermsPlayer | null> {
    const normalized = this.normalize(username);
    if (!normalized) {
      return null;
    }
    const cached = await this.cache.getPlayerByUsername(normalized);
    if (cached) {
      return this.mapCached(cached);
    }
    if (options.allowFallback ?? true) {
      try {
        return await this.luckpermsService.getPlayerByUsername(normalized);
      } catch {
        return null;
      }
    }
    return null;
  }

  private mapCached(entry: LuckpermsPlayerCacheRecord): LuckpermsPlayer {
    const groups: LuckpermsGroupMembership[] = [];
    if (Array.isArray(entry.groups)) {
      for (const maybeMembership of entry.groups) {
        if (maybeMembership && typeof maybeMembership === 'object') {
          const normalized = maybeMembership as unknown;
          groups.push(normalized as LuckpermsGroupMembership);
        }
      }
    }
    return {
      uuid: entry.uuid,
      username: entry.username,
      primaryGroup: entry.primaryGroup,
      groups,
    };
  }

  private normalize(value: string | undefined | null) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
