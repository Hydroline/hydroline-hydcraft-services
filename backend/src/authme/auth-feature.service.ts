import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  AUTH_FEATURE_CACHE_TTL_MS,
  AUTH_FEATURE_NAMESPACE,
} from './authme.constants';

export interface OAuthProviderFeature {
  key: string;
  name: string;
  type: string;
  hasClientSecret?: boolean;
}

export interface AuthmeFeatureFlags {
  emailVerificationEnabled: boolean;
  authmeRegisterEnabled: boolean;
  authmeLoginEnabled: boolean;
  authmeBindingEnabled: boolean;
}

export interface SecurityFeatureFlags {
  emailVerificationEnabled: boolean;
  phoneVerificationEnabled: boolean;
  passwordResetEnabled: boolean;
}

export type AuthFeatureFlags = AuthmeFeatureFlags &
  SecurityFeatureFlags & {
    oauthProviders?: OAuthProviderFeature[];
    inviteRequired: boolean;
  };

export interface FeatureSnapshot {
  flags: AuthmeFeatureFlags;
  meta: {
    id: string;
    version: number;
    updatedAt: string;
  } | null;
}

const DEFAULT_AUTHME_FLAGS: AuthmeFeatureFlags = {
  emailVerificationEnabled: false,
  authmeRegisterEnabled: false,
  authmeLoginEnabled: false,
  authmeBindingEnabled: true,
};

const DEFAULT_SECURITY_FLAGS: SecurityFeatureFlags = {
  emailVerificationEnabled: true,
  phoneVerificationEnabled: false,
  passwordResetEnabled: true,
};

const DEFAULT_FLAGS: AuthFeatureFlags = {
  ...DEFAULT_AUTHME_FLAGS,
  ...DEFAULT_SECURITY_FLAGS,
  oauthProviders: [],
  inviteRequired: false,
};

@Injectable()
export class AuthFeatureService implements OnModuleInit {
  private readonly logger = new Logger(AuthFeatureService.name);
  private cache: { expiresAt: number; value: AuthFeatureFlags } | null = null;
  private ensureStoragePromise: Promise<void> | null = null;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureFeatureStorage();
  }

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
      const [authmeFlags, securityFlags] = await Promise.all([
        this.loadAuthmeFeatureFlags(),
        this.loadSecurityVerificationFlags(),
      ]);

      return {
        ...DEFAULT_FLAGS,
        ...authmeFlags,
        ...securityFlags,
      } satisfies AuthFeatureFlags;
    } catch (error) {
      this.logger.warn(
        `Failed to load auth/security feature flags: ${String(error)}`,
      );
      return DEFAULT_FLAGS;
    }
  }

  async getFeatureSnapshot(): Promise<FeatureSnapshot> {
    const flags = await this.loadAuthmeFeatureFlags();
    const entry = await this.configService.getEntry(
      AUTH_FEATURE_NAMESPACE,
      'feature',
    );
    if (!entry) {
      return { flags, meta: null };
    }
    return {
      flags,
      meta: {
        id: entry.id,
        version: entry.version,
        updatedAt:
          entry.updatedAt instanceof Date
            ? entry.updatedAt.toISOString()
            : String(entry.updatedAt ?? ''),
      },
    };
  }

  async setFlags(flags: AuthmeFeatureFlags, userId?: string) {
    const namespace = await this.configService.ensureNamespaceByKey(
      AUTH_FEATURE_NAMESPACE,
      {
        name: 'Auth Feature Flags',
        description: 'Toggle auth subsystem behaviours',
      },
    );
    const entry = await this.configService.getEntry(
      AUTH_FEATURE_NAMESPACE,
      'feature',
    );
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

  private async ensureFeatureStorage() {
    if (!this.ensureStoragePromise) {
      this.ensureStoragePromise = (async () => {
        const namespace = await this.configService.ensureNamespaceByKey(
          AUTH_FEATURE_NAMESPACE,
          {
            name: 'Auth Feature Flags',
            description: 'Toggle auth subsystem behaviours',
          },
        );
        const entry = await this.configService.getEntry(
          AUTH_FEATURE_NAMESPACE,
          'feature',
        );
        if (!entry) {
          await this.configService.createEntry(namespace.id, {
            key: 'feature',
            value: DEFAULT_AUTHME_FLAGS,
            description: 'Auth subsystem feature toggles',
          });
        }
      })().catch((error) => {
        this.ensureStoragePromise = null;
        throw error;
      });
    }
    await this.ensureStoragePromise;
  }

  private async loadAuthmeFeatureFlags(): Promise<AuthmeFeatureFlags> {
    try {
      await this.ensureFeatureStorage();
      const entries = await this.configService.getEntriesByNamespaceKey(
        AUTH_FEATURE_NAMESPACE,
      );
      if (!entries.length) {
        return DEFAULT_AUTHME_FLAGS;
      }
      const resolved = pickFeatureConfig(entries);
      return {
        emailVerificationEnabled: toBoolean(
          resolved.emailVerificationEnabled,
          DEFAULT_AUTHME_FLAGS.emailVerificationEnabled,
        ),
        authmeRegisterEnabled: toBoolean(
          resolved.authmeRegisterEnabled ?? resolved.authmeRegister,
          DEFAULT_AUTHME_FLAGS.authmeRegisterEnabled,
        ),
        authmeLoginEnabled: toBoolean(
          resolved.authmeLoginEnabled ?? resolved.authmeLogin,
          DEFAULT_AUTHME_FLAGS.authmeLoginEnabled,
        ),
        authmeBindingEnabled: toBoolean(
          resolved.authmeBindingEnabled,
          DEFAULT_AUTHME_FLAGS.authmeBindingEnabled,
        ),
      } satisfies AuthmeFeatureFlags;
    } catch (error) {
      this.logger.warn(`Failed to load auth feature flags: ${String(error)}`);
      return DEFAULT_AUTHME_FLAGS;
    }
  }

  private async loadSecurityVerificationFlags(): Promise<SecurityFeatureFlags> {
    try {
      const entries = await this.configService.getEntriesByNamespaceKey(
        'security.verification',
      );
      const map = new Map(entries.map((e) => [e.key, e.value]));
      const getFlag = (key: string, fallback: boolean) =>
        toBoolean(map.get(key), fallback);

      return {
        emailVerificationEnabled: getFlag(
          'enableEmailVerification',
          DEFAULT_SECURITY_FLAGS.emailVerificationEnabled,
        ),
        phoneVerificationEnabled: getFlag(
          'enablePhoneVerification',
          DEFAULT_SECURITY_FLAGS.phoneVerificationEnabled,
        ),
        passwordResetEnabled: getFlag(
          'enablePasswordReset',
          DEFAULT_SECURITY_FLAGS.passwordResetEnabled,
        ),
      } satisfies SecurityFeatureFlags;
    } catch (error) {
      this.logger.warn(
        `Failed to load security verification flags: ${String(error)}`,
      );
      return DEFAULT_SECURITY_FLAGS;
    }
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

function pickFeatureConfig(
  entries: Array<{ key: string; value: unknown }>,
): Record<string, unknown> {
  const target = entries.find(
    (entry) => entry.key === 'feature' && isRecord(entry.value),
  );
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
