import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthmeCacheService } from '../cache/authme-cache.service';
import { AuthmeService } from './authme.service';
import type { AuthmeUser } from './authme.interfaces';

type AuthmeAccountCacheRecord = Prisma.AuthmeAccountCacheGetPayload<{}>;

@Injectable()
export class AuthmeLookupService {
  constructor(
    private readonly authmeService: AuthmeService,
    private readonly cache: AuthmeCacheService,
  ) {}

  async getAccount(
    username: string | undefined | null,
    options: { allowFallback?: boolean } = {},
  ): Promise<AuthmeUser | null> {
    const normalized = this.normalize(username);
    if (!normalized) {
      return null;
    }
    const cached = await this.cache.getAccountByUsername(normalized);
    if (cached) {
      return this.mapCached(cached);
    }
    if (options.allowFallback ?? true) {
      try {
        return await this.authmeService.getAccount(normalized);
      } catch {
        return null;
      }
    }
    return null;
  }

  async getCachedAccounts(
    usernames: Array<string | undefined | null>,
  ): Promise<Record<string, AuthmeUser | null>> {
    const normalized = Array.from(
      new Set(
        usernames
          .map((value) => this.normalize(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (!normalized.length) {
      return {};
    }
    const entries = await this.cache.getAccountsByUsernames(normalized);
    const result: Record<string, AuthmeUser | null> = {};
    for (const entry of entries) {
      result[entry.usernameLower] = this.mapCached(entry);
    }
    return result;
  }

  private mapCached(entry: AuthmeAccountCacheRecord): AuthmeUser {
    return {
      id: 0,
      username: entry.username,
      realname: entry.realname ?? entry.username,
      password: '',
      ip: entry.ip ?? null,
      lastlogin: Number(entry.lastlogin ?? 0),
      x: 0,
      y: 0,
      z: 0,
      world: entry.world ?? 'world',
      regdate: Number(entry.regdate ?? 0),
      regip: entry.regip ?? null,
      yaw: null,
      pitch: null,
      email: entry.email ?? null,
      isLogged: entry.isLogged,
      hasSession: entry.hasSession,
      totp: null,
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
