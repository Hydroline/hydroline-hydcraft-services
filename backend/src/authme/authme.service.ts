import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  AUTHME_DB_NAMESPACE,
  AUTHME_CONFIG_POLL_INTERVAL_MS,
  AUTHME_DEFAULT_SAFE_MESSAGE,
} from './authme.constants';
import { AuthmeDbConfig } from './authme.config';
import { MysqlAuthmeLib } from '../lib/authme/authme-lib';
import type { AuthmeLib, AuthmeUser } from './authme.interfaces';
import { PromAuthmeMetricsRecorder } from './authme.metrics';
import {
  AuthmeError,
  businessError,
  externalError,
  unexpectedError,
} from './authme.errors';
import type { AuthmeHealth } from './authme.interfaces';

interface ConfigEntry {
  id?: string;
  key: string;
  value: unknown;
  version: number;
  updatedAt?: string | Date;
}

@Injectable()
export class AuthmeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthmeService.name);
  private readonly metrics = new PromAuthmeMetricsRecorder();
  private lib: AuthmeLib | null = null;
  private currentConfig: AuthmeDbConfig | null = null;
  private configSignature: string | null = null;
  private poller?: NodeJS.Timeout;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureConfigStorage();
    await this.refreshConfig(true);
    this.poller = setInterval(() => {
      void this.refreshConfig().catch((error) =>
        this.logger.error(`Failed to refresh AuthMe config: ${String(error)}`),
      );
    }, AUTHME_CONFIG_POLL_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.poller) {
      clearInterval(this.poller);
    }
    await this.lib?.close();
    this.lib = null;
  }

  async health(): Promise<AuthmeHealth> {
    if (!this.currentConfig || !this.currentConfig.enabled || !this.lib) {
      return {
        ok: false,
        stage: 'CONNECT',
        message: 'AuthMe integration disabled',
      };
    }
    return this.lib.health();
  }

  async verifyCredentials(
    identifier: string,
    password: string,
  ): Promise<AuthmeUser> {
    const lib = await this.ensureLib();
    try {
      const user = await lib.getByUsernameOrRealname(identifier);
      if (!user) {
        throw businessError({
          type: 'BUSINESS_VALIDATION_FAILED',
          code: 'AUTHME_ACCOUNT_NOT_FOUND',
          safeMessage: 'AuthMe 账号不存在，请确认后再试',
        });
      }
      const ok = await lib.verifyPassword(user.password, password);
      if (!ok) {
        throw businessError({
          type: 'BUSINESS_VALIDATION_FAILED',
          code: 'AUTHME_PASSWORD_MISMATCH',
          safeMessage: 'AuthMe 密码不正确，请重新输入',
        });
      }
      return user;
    } catch (error) {
      if (error instanceof AuthmeError) {
        throw error;
      }
      throw unexpectedError('AuthMe 认证失败，请稍后再试', error);
    }
  }

  async getAccount(identifier: string): Promise<AuthmeUser | null> {
    const lib = await this.ensureLib();
    return lib.getByUsernameOrRealname(identifier);
  }

  isEnabled() {
    return Boolean(this.currentConfig?.enabled && this.lib);
  }

  private async ensureLib(): Promise<AuthmeLib> {
    if (this.lib && this.currentConfig?.enabled) {
      return this.lib;
    }
    throw externalError('CONNECT', AUTHME_DEFAULT_SAFE_MESSAGE);
  }

  private async refreshConfig(force = false) {
    const { signature, config } = await this.loadConfig();
    if (!config || !config.enabled) {
      if (this.lib) {
        await this.lib.close();
        this.lib = null;
      }
      this.currentConfig = config ?? null;
      this.configSignature = signature;
      return;
    }

    if (!force && signature === this.configSignature && this.lib) {
      return;
    }

    const nextLib = new MysqlAuthmeLib({
      config,
      logger: this.logger,
      metrics: this.metrics,
    });
    const previous = this.lib;
    this.lib = nextLib;
    this.currentConfig = config;
    this.configSignature = signature;
    if (previous) {
      await previous.close().catch(() => undefined);
    }
    this.logger.log('AuthMe connection pool refreshed');
  }

  private async loadConfig(): Promise<{
    signature: string;
    config: AuthmeDbConfig | null;
  }> {
    await this.ensureConfigStorage();
    const entries = (await this.configService.getEntriesByNamespaceKey(
      AUTHME_DB_NAMESPACE,
    )) as ConfigEntry[];
    const primary = pickConfigEntry(entries);
    if (!primary) {
      return { signature: 'empty', config: null };
    }
    const signature = `${primary.key}:${primary.version}`;
    const payload = isRecord(primary.value) ? primary.value : {};
    const config = this.normalizeConfig(payload);
    if (!config) {
      this.logger.warn(
        'AuthMe config missing required fields, skipping pool creation',
      );
      return { signature, config: null };
    }
    return { signature, config };
  }

  async getConfigSnapshot() {
    const entry = await this.configService.getEntry(
      AUTHME_DB_NAMESPACE,
      'config',
    );
    if (!entry) {
      return { config: null, meta: null };
    }
    const payload = isRecord(entry.value)
      ? (entry.value as Record<string, unknown>)
      : {};
    const normalized = this.normalizeConfig(payload);
    return {
      config: normalized,
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

  async upsertConfig(config: AuthmeDbConfig, userId?: string) {
    const namespace = await this.configService.ensureNamespaceByKey(
      AUTHME_DB_NAMESPACE,
      {
        name: 'AuthMe Database',
        description: 'AuthMe MySQL connection configuration',
      },
    );
    const entry = await this.configService.getEntry(
      AUTHME_DB_NAMESPACE,
      'config',
    );
    if (entry) {
      await this.configService.updateEntry(entry.id, { value: config }, userId);
    } else {
      await this.configService.createEntry(
        namespace.id,
        { key: 'config', value: config },
        userId,
      );
    }
    await this.refreshConfig(true);
  }

  private async ensureConfigStorage() {
    const namespace = await this.configService.ensureNamespaceByKey(
      AUTHME_DB_NAMESPACE,
      {
        name: 'AuthMe Database',
        description: 'AuthMe MySQL connection configuration',
      },
    );
    const entry = await this.configService.getEntry(
      AUTHME_DB_NAMESPACE,
      'config',
    );
    if (!entry) {
      await this.configService.createEntry(namespace.id, {
        key: 'config',
        value: {},
        description: 'AuthMe MySQL connection configuration',
      });
    }
  }

  private normalizeConfig(
    payload: Record<string, unknown>,
  ): AuthmeDbConfig | null {
    try {
      const poolRaw = isRecord(payload.pool) ? payload.pool : {};
      const pool = {
        min: toNumber(poolRaw.min, 0),
        max: toNumber(poolRaw.max, 10),
        idleMillis: toNumber(poolRaw.idleMillis, 30_000),
        acquireTimeoutMillis: toNumber(poolRaw.acquireTimeoutMillis, 10_000),
      };
      const config: AuthmeDbConfig = {
        host: String(payload.host ?? '').trim(),
        port: toNumber(payload.port, 3306),
        database: String(payload.database ?? '').trim(),
        user: String(payload.user ?? '').trim(),
        password: String(payload.password ?? ''),
        charset: String(payload.charset ?? 'utf8mb4'),
        connectTimeoutMillis: toNumber(payload.connectTimeoutMillis, 5000),
        readonly: toBoolean(payload.readonly, false),
        enabled: toBoolean(payload.enabled, false),
        pool,
      };
      if (
        !config.host ||
        !config.database ||
        !config.user ||
        !config.password
      ) {
        return null;
      }
      return config;
    } catch (error) {
      this.logger.error(`Failed to parse AuthMe config: ${String(error)}`);
      return null;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function looksLikeAuthmeConfig(value: Record<string, unknown>): boolean {
  const required = ['host', 'database', 'user', 'password'];
  return required.every((key) => key in value);
}

function pickConfigEntry(entries: ConfigEntry[]) {
  if (!entries.length) {
    return null;
  }
  const preferred = entries.find(
    (entry) => entry.key === 'config' && isRecord(entry.value),
  );
  if (preferred) {
    return preferred;
  }
  return (
    entries.find(
      (entry) => isRecord(entry.value) && looksLikeAuthmeConfig(entry.value),
    ) ?? null
  );
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
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
