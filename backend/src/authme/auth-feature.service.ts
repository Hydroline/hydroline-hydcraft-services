import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { AUTH_FEATURE_CACHE_TTL_MS, AUTH_FEATURE_NAMESPACE } from './authme.constants';

export interface AuthFeatureFlags {
  emailVerificationEnabled: boolean;
  authmeRegisterEnabled: boolean;
  authmeLoginEnabled: boolean;
  authmeBindingEnabled: boolean;
}

export interface FeatureSnapshot {
  flags: AuthFeatureFlags;
  meta: {
    id: string;
    version: number;
    updatedAt: string;
  } | null;
}

const DEFAULT_FLAGS: AuthFeatureFlags = {
  emailVerificationEnabled: false,
  authmeRegisterEnabled: false,
  authmeLoginEnabled: false,
  authmeBindingEnabled: true,
};

@Injectable()
export class AuthFeatureService {
  private readonly logger = new Logger(AuthFeatureService.name);
  private cache: { expiresAt: number; value: AuthFeatureFlags } | null = null;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  async getFlags(forceRefresh = false): Promise<AuthFeatureFlags> {
    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }
    const flags = await this.loadFlags();
    this.cache = {
      value: flags,
      expiresAt: Date.now() + AUTH_FEATURE_CACHE_TTL_MS,
    };
    return flags;
  }

  private async loadFlags(): Promise<AuthFeatureFlags> {
    try {
      const entries = await this.configService.getEntriesByNamespaceKey(AUTH_FEATURE_NAMESPACE);
      if (!entries.length) {
        return DEFAULT_FLAGS;
      }
      const resolved = pickFeatureConfig(entries);
      return {
        emailVerificationEnabled: toBoolean(resolved.emailVerificationEnabled, DEFAULT_FLAGS.emailVerificationEnabled),
        authmeRegisterEnabled: toBoolean(resolved.authmeRegisterEnabled ?? resolved.authmeRegister, DEFAULT_FLAGS.authmeRegisterEnabled),
        authmeLoginEnabled: toBoolean(resolved.authmeLoginEnabled ?? resolved.authmeLogin, DEFAULT_FLAGS.authmeLoginEnabled),
        authmeBindingEnabled: toBoolean(resolved.authmeBindingEnabled, DEFAULT_FLAGS.authmeBindingEnabled),
      } satisfies AuthFeatureFlags;
    } catch (error) {
      this.logger.warn(`Failed to load auth feature flags: ${String(error)}`);
      return DEFAULT_FLAGS;
    }
  }

  async getFeatureSnapshot(): Promise<FeatureSnapshot> {
    const flags = await this.getFlags(true);
    const entry = await this.configService.getEntry(AUTH_FEATURE_NAMESPACE, 'feature');
    if (!entry) {
      return { flags, meta: null };
    }
    return {
      flags,
      meta: {
        id: entry.id,
        version: entry.version,
        updatedAt:
          entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : String(entry.updatedAt ?? ''),
      },
    };
  }

  async setFlags(flags: AuthFeatureFlags, userId?: string) {
    const namespace = await this.configService.ensureNamespaceByKey(AUTH_FEATURE_NAMESPACE, {
      name: 'Auth Feature Flags',
      description: 'Toggle auth subsystem behaviours',
    });
    const entry = await this.configService.getEntry(AUTH_FEATURE_NAMESPACE, 'feature');
    if (entry) {
      await this.configService.updateEntry(entry.id, { value: flags }, userId);
    } else {
      await this.configService.createEntry(
        namespace.id,
        {
          key: 'feature',
          value: flags,
        },
        userId,
      );
    }
    this.cache = null;
  }
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return fallback;
}

function pickFeatureConfig(entries: Array<{ key: string; value: unknown }>): Record<string, unknown> {
  const target = entries.find((entry) => entry.key === 'feature' && isRecord(entry.value));
  if (target) {
    return target.value as Record<string, unknown>;
  }
  const candidates = entries.filter((entry) => isRecord(entry.value)) as Array<{
    key: string;
    value: Record<string, unknown>;
  }>;
  if (candidates.length === 0) {
    return {};
  }
  return candidates[0].value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasFeatureKeys(value: Record<string, unknown>): boolean {
  return (
    'authmeLoginEnabled' in value ||
    'authmeRegisterEnabled' in value ||
    'authmeBindingEnabled' in value ||
    'emailVerificationEnabled' in value
  );
}
