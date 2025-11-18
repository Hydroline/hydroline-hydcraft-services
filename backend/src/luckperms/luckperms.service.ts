import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  LUCKPERMS_CONFIG_POLL_INTERVAL_MS,
  LUCKPERMS_DB_NAMESPACE,
  LUCKPERMS_DEFAULT_SAFE_MESSAGE,
  LUCKPERMS_DISPLAY_NAMESPACE,
  LUCKPERMS_GROUP_LABELS_KEY,
} from './luckperms.constants';
import { LuckpermsDbConfig } from './luckperms.config';
import type {
  LuckpermsLib,
  LuckpermsPlayer,
  LuckpermsHealth,
} from './luckperms.interfaces';
import { MysqlLuckpermsLib } from '../lib/luckperms/luckperms.lib';
import { PromLuckpermsMetricsRecorder } from './luckperms.metrics';
import { externalError, LuckpermsError } from './luckperms.errors';

interface ConfigEntry {
  id?: string;
  key: string;
  value: unknown;
  version: number;
  updatedAt?: string | Date;
}

interface ConfigEntryMeta {
  id?: string;
  version: number;
  updatedAt: string;
}

interface GroupLabelsState {
  signature: string;
  record: Record<string, string>;
  meta: ConfigEntryMeta | null;
}

@Injectable()
export class LuckpermsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LuckpermsService.name);
  private readonly metrics = new PromLuckpermsMetricsRecorder();
  private lib: LuckpermsLib | null = null;
  private currentConfig: LuckpermsDbConfig | null = null;
  private configSignature: string | null = null;
  private poller?: NodeJS.Timeout;
  private groupLabelSignature: string | null = null;
  private groupLabelRecord: Record<string, string> = {};
  private groupLabelLowercase: Record<string, string> = {};
  private groupLabelMeta: ConfigEntryMeta | null = null;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.bootstrapConfigStorage();
    await this.refreshState(true);
    this.poller = setInterval(() => {
      void this.refreshState().catch((error) =>
        this.logger.error(
          `Failed to refresh LuckPerms config: ${String(error)}`,
        ),
      );
    }, LUCKPERMS_CONFIG_POLL_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.poller) {
      clearInterval(this.poller);
    }
    await this.lib?.close();
    this.lib = null;
  }

  async health(): Promise<LuckpermsHealth> {
    if (!this.currentConfig || !this.currentConfig.enabled || !this.lib) {
      return {
        ok: false,
        stage: 'CONNECT',
        message: 'LuckPerms integration disabled',
      };
    }
    return this.lib.health();
  }

  async getPlayerByUsername(username: string): Promise<LuckpermsPlayer | null> {
    const lib = this.ensureLib();
    try {
      return await lib.getPlayerByUsername(username);
    } catch (error) {
      if (error instanceof LuckpermsError) {
        throw error;
      }
      throw externalError('QUERY', String(error));
    }
  }

  async getPlayerByUuid(uuid: string): Promise<LuckpermsPlayer | null> {
    const lib = this.ensureLib();
    try {
      return await lib.getPlayerByUuid(uuid);
    } catch (error) {
      if (error instanceof LuckpermsError) {
        throw error;
      }
      throw externalError('QUERY', String(error));
    }
  }

  async listPlayers(offset = 0, limit = 100): Promise<LuckpermsPlayer[]> {
    const lib = this.ensureLib();
    try {
      return await lib.listPlayers(offset, limit);
    } catch (error) {
      if (error instanceof LuckpermsError) {
        throw error;
      }
      throw externalError('QUERY', String(error));
    }
  }

  isEnabled() {
    return Boolean(this.currentConfig?.enabled && this.lib);
  }

  async getConfigSnapshot() {
    const entry = await this.configService.getEntry(
      LUCKPERMS_DB_NAMESPACE,
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

  async upsertConfig(config: LuckpermsDbConfig, userId?: string) {
    const namespace = await this.configService.ensureNamespaceByKey(
      LUCKPERMS_DB_NAMESPACE,
      {
        name: 'LuckPerms Database',
        description: 'LuckPerms MySQL connection configuration',
      },
    );
    const entry = await this.configService.getEntry(
      LUCKPERMS_DB_NAMESPACE,
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
    await this.refreshState(true);
  }

  async getGroupLabelSnapshot() {
    if (!this.groupLabelSignature) {
      await this.refreshState();
    }
    const meta = this.groupLabelMeta
      ? {
          id: this.groupLabelMeta.id,
          version: this.groupLabelMeta.version,
          updatedAt: this.groupLabelMeta.updatedAt,
        }
      : null;
    return {
      entries: this.getGroupLabelEntries(),
      meta,
    };
  }

  async upsertGroupLabels(
    entries: Array<{ group: string; label: string }>,
    userId?: string,
  ) {
    const namespace = await this.configService.ensureNamespaceByKey(
      LUCKPERMS_DISPLAY_NAMESPACE,
      {
        name: 'LuckPerms Group Display',
        description: 'Rendered display text for LuckPerms permission groups',
      },
    );
    const normalized = this.normalizeGroupLabelEntries(entries);
    const entry = await this.configService.getEntry(
      LUCKPERMS_DISPLAY_NAMESPACE,
      LUCKPERMS_GROUP_LABELS_KEY,
    );
    if (entry) {
      await this.configService.updateEntry(
        entry.id,
        { value: normalized },
        userId,
      );
    } else {
      await this.configService.createEntry(
        namespace.id,
        {
          key: LUCKPERMS_GROUP_LABELS_KEY,
          value: normalized,
          description: 'LuckPerms group display text mapping',
        },
        userId,
      );
    }
    await this.refreshState(false);
  }

  getGroupDisplayName(group: string | null | undefined): string | null {
    if (!group) {
      return null;
    }
    const direct = this.groupLabelRecord[group];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }
    const fallback = this.groupLabelLowercase[group.toLowerCase()];
    return typeof fallback === 'string' && fallback.length > 0
      ? fallback
      : null;
  }

  private async bootstrapConfigStorage() {
    const dbNamespace = await this.configService.ensureNamespaceByKey(
      LUCKPERMS_DB_NAMESPACE,
      {
        name: 'LuckPerms Database',
        description: 'LuckPerms MySQL connection configuration',
      },
    );
    const dbConfigEntry = await this.configService.getEntry(
      LUCKPERMS_DB_NAMESPACE,
      'config',
    );
    if (!dbConfigEntry) {
      await this.configService.createEntry(dbNamespace.id, {
        key: 'config',
        value: {},
        description: 'LuckPerms MySQL connection configuration',
      });
    }
    const displayNamespace = await this.configService.ensureNamespaceByKey(
      LUCKPERMS_DISPLAY_NAMESPACE,
      {
        name: 'LuckPerms Group Display',
        description: 'Display text mapping for LuckPerms permission groups',
      },
    );
    const labelEntry = await this.configService.getEntry(
      LUCKPERMS_DISPLAY_NAMESPACE,
      LUCKPERMS_GROUP_LABELS_KEY,
    );
    if (!labelEntry) {
      await this.configService.createEntry(displayNamespace.id, {
        key: LUCKPERMS_GROUP_LABELS_KEY,
        value: {},
        description: 'LuckPerms group display text mapping',
      });
    }
  }

  private ensureLib(): LuckpermsLib {
    if (this.lib && this.currentConfig?.enabled) {
      return this.lib;
    }
    throw externalError('CONNECT', LUCKPERMS_DEFAULT_SAFE_MESSAGE);
  }

  private async refreshState(force = false) {
    const [configState, groupLabelsState] = await Promise.all([
      this.loadConfig(),
      this.loadGroupLabels(),
    ]);
    await this.applyConfigState(configState, force);
    this.applyGroupLabelState(groupLabelsState, force);
  }

  private async applyConfigState(
    state: { signature: string; config: LuckpermsDbConfig | null },
    force: boolean,
  ) {
    const { signature, config } = state;
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

    const nextLib = new MysqlLuckpermsLib({
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
    this.logger.log('LuckPerms connection pool refreshed');
  }

  private applyGroupLabelState(state: GroupLabelsState, force: boolean) {
    const { signature, record, meta } = state;
    const changed = force || signature !== this.groupLabelSignature;
    this.groupLabelSignature = signature;
    this.groupLabelMeta = meta;
    if (!changed) {
      return;
    }
    this.groupLabelRecord = record;
    this.groupLabelLowercase = buildLowercaseRecord(record);
  }

  private async loadConfig(): Promise<{
    signature: string;
    config: LuckpermsDbConfig | null;
  }> {
    const entries = (await this.configService.getEntriesByNamespaceKey(
      LUCKPERMS_DB_NAMESPACE,
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
        'LuckPerms config missing required fields, skipping pool creation',
      );
      return { signature, config: null };
    }
    return { signature, config };
  }

  private async loadGroupLabels(): Promise<GroupLabelsState> {
    const entry = await this.configService.getEntry(
      LUCKPERMS_DISPLAY_NAMESPACE,
      LUCKPERMS_GROUP_LABELS_KEY,
    );
    if (!entry) {
      return { signature: 'missing', record: {}, meta: null };
    }
    const record = this.parseGroupLabelRecord(entry.value);
    const updatedAt =
      entry.updatedAt instanceof Date
        ? entry.updatedAt.toISOString()
        : String(entry.updatedAt ?? '');
    const meta: ConfigEntryMeta = {
      id: entry.id,
      version: entry.version,
      updatedAt,
    };
    return {
      signature: `${entry.key}:${entry.version}`,
      record,
      meta,
    };
  }

  private parseGroupLabelRecord(value: unknown): Record<string, string> {
    if (!value) {
      return {};
    }
    if (Array.isArray(value)) {
      const result: Record<string, string> = {};
      for (const item of value) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const object = item as Record<string, unknown>;
        const groupValue = toNonEmptyString(object.group);
        const labelValue = toNonEmptyString(object.label);
        if (!groupValue || !labelValue) {
          continue;
        }
        result[groupValue] = labelValue;
      }
      return result;
    }
    if (isRecord(value)) {
      const result: Record<string, string> = {};
      for (const [key, raw] of Object.entries(value)) {
        const groupValue = toNonEmptyString(key);
        const labelValue = toNonEmptyString(raw);
        if (!groupValue || !labelValue) {
          continue;
        }
        result[groupValue] = labelValue;
      }
      return result;
    }
    return {};
  }

  private normalizeGroupLabelEntries(
    entries: Array<{ group: string; label: string }>,
  ): Record<string, string> {
    if (!Array.isArray(entries)) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const entry of entries) {
      const groupValue = toNonEmptyString(entry.group);
      const labelValue = toNonEmptyString(entry.label);
      if (!groupValue || !labelValue) {
        continue;
      }
      result[groupValue] = labelValue;
    }
    return result;
  }

  private getGroupLabelEntries() {
    return Object.entries(this.groupLabelRecord)
      .map(([group, label]) => ({ group, label }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }

  private normalizeConfig(
    payload: Record<string, unknown>,
  ): LuckpermsDbConfig | null {
    try {
      const poolRaw = isRecord(payload.pool) ? payload.pool : {};
      const pool = {
        min: toNumber(poolRaw.min, 0),
        max: toNumber(poolRaw.max, 10),
        idleMillis: toNumber(poolRaw.idleMillis, 30_000),
        acquireTimeoutMillis: toNumber(poolRaw.acquireTimeoutMillis, 10_000),
      };
      const host = toTrimmedString(payload.host);
      const database = toTrimmedString(payload.database);
      const user = toTrimmedString(payload.user);
      const password = toTrimmedString(payload.password);
      const charset = toTrimmedString(payload.charset) || 'utf8mb4';
      const config: LuckpermsDbConfig = {
        host,
        port: toNumber(payload.port, 3306),
        database,
        user,
        password,
        charset,
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
      this.logger.error(`Failed to parse LuckPerms config: ${String(error)}`);
      return null;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function looksLikeLuckpermsConfig(value: Record<string, unknown>): boolean {
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
      (entry) => isRecord(entry.value) && looksLikeLuckpermsConfig(entry.value),
    ) ?? null
  );
}

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function toNonEmptyString(value: unknown): string | null {
  const trimmed = toTrimmedString(value);
  return trimmed.length > 0 ? trimmed : null;
}

function buildLowercaseRecord(record: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    lower[key.toLowerCase()] = value;
  }
  return lower;
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
