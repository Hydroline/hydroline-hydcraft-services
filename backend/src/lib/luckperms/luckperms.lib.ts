import * as mysql from 'mysql2/promise';
import type {
  Pool,
  PoolConnection,
  PoolOptions,
  RowDataPacket,
} from 'mysql2/promise';
import { performance } from 'node:perf_hooks';
import { LuckpermsDbConfig } from '../../luckperms/luckperms.config';
import type {
  LuckpermsGroupMembership,
  LuckpermsLib,
  LuckpermsPlayer,
} from '../../luckperms/luckperms.interfaces';
import { LuckpermsMetricsRecorder } from '../../luckperms/luckperms.metrics';
import { externalError } from '../../luckperms/luckperms.errors';

export interface LoggerLike {
  debug?(message: string, meta?: Record<string, unknown>): void;
  log?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export interface LuckpermsLibOptions {
  config: LuckpermsDbConfig;
  logger?: LoggerLike;
  metrics?: LuckpermsMetricsRecorder;
  poolOverride?: Pool;
}

const DEFAULT_LIMIT = 100;

export class MysqlLuckpermsLib implements LuckpermsLib {
  readonly pool: Pool;
  private readonly logger?: LoggerLike;
  private readonly metrics?: LuckpermsMetricsRecorder;

  constructor(options: LuckpermsLibOptions) {
    this.logger = options.logger;
    this.metrics = options.metrics;
    const poolOptions: PoolOptions = {
      host: options.config.host,
      port: options.config.port,
      user: options.config.user,
      password: options.config.password,
      database: options.config.database,
      charset: options.config.charset,
      waitForConnections: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      queueLimit: 0,
      connectionLimit: options.config.pool.max,
      connectTimeout: options.config.connectTimeoutMillis,
    };
    this.pool = options.poolOverride ?? mysql.createPool(poolOptions);
  }

  async health() {
    const start = performance.now();
    try {
      const connection = await this.pool.getConnection();
      try {
        await connection.query('SELECT 1');
      } finally {
        connection.release();
      }
      const latencyMs = Math.round(performance.now() - start);
      this.metrics?.setConnected(true);
      return { ok: true as const, latencyMs };
    } catch (error) {
      const stage = resolveStage(error);
      this.metrics?.setConnected(false);
      return {
        ok: false as const,
        stage,
        message: (error as Error).message,
        cause: getErrorCode(error),
      };
    }
  }

  async close(): Promise<void> {
    this.metrics?.setConnected(false);
    await this.pool.end().catch(() => undefined);
  }

  async getPlayerByUsername(username: string): Promise<LuckpermsPlayer | null> {
    const row = await this.querySingle<LuckpermsPlayerRow>(
      `SELECT * FROM luckperms_players WHERE LOWER(username) = LOWER(?) LIMIT 1`,
      [username],
      'getPlayerByUsername',
    );
    if (!row) {
      return null;
    }
    return this.hydratePlayer(row);
  }

  async getPlayerByUuid(uuid: string): Promise<LuckpermsPlayer | null> {
    const row = await this.querySingle<LuckpermsPlayerRow>(
      `SELECT * FROM luckperms_players WHERE uuid = ? LIMIT 1`,
      [uuid],
      'getPlayerByUuid',
    );
    if (!row) {
      return null;
    }
    return this.hydratePlayer(row);
  }

  async listPlayers(
    offset = 0,
    limit = DEFAULT_LIMIT,
  ): Promise<LuckpermsPlayer[]> {
    const rows = await this.query<LuckpermsPlayerRow[]>(
      `SELECT * FROM luckperms_players ORDER BY username LIMIT ? OFFSET ?`,
      [limit, offset],
      'listPlayers',
    );
    return Promise.all(rows.map((row) => this.hydratePlayer(row)));
  }

  private async hydratePlayer(
    row: LuckpermsPlayerRow,
  ): Promise<LuckpermsPlayer> {
    const [memberships] = await Promise.all([
      this.getGroupMemberships(row.uuid),
    ]);
    return {
      uuid: String(row.uuid),
      username: row.username,
      primaryGroup: row.primary_group ?? null,
      groups: memberships,
    };
  }

  private async getGroupMemberships(
    uuid: string,
  ): Promise<LuckpermsGroupMembership[]> {
    const rows = await this.query<LuckpermsPermissionRow[]>(
      `SELECT permission, value, server, world, expiry, contexts
       FROM luckperms_user_permissions
       WHERE uuid = ?
         AND permission LIKE 'group.%'`,
      [uuid],
      'getGroupMemberships',
    );
    const memberships: LuckpermsGroupMembership[] = [];
    for (const row of rows) {
      const group = extractGroup(row.permission);
      if (!group) {
        continue;
      }
      if (!toBoolean(row.value)) {
        continue;
      }
      memberships.push({
        group,
        server: normalizeNullable(row.server),
        world: normalizeNullable(row.world),
        expiry: toNullableNumber(row.expiry),
        contexts: parseContexts(row.contexts),
      });
    }
    return deduplicateMemberships(memberships);
  }

  private async querySingle<R extends RowDataPacket>(
    sql: string,
    params: unknown[],
    label: string,
  ): Promise<R | null> {
    const rows = await this.query<R[]>(sql, params, label);
    if (!rows.length) {
      return null;
    }
    return rows[0];
  }

  private async query<T = RowDataPacket[]>(
    sql: string,
    params: unknown[],
    label: string,
  ): Promise<T> {
    const start = performance.now();
    const maxAttempts = 5;
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        let connection: PoolConnection | null = null;
        try {
          connection = await this.pool.getConnection();
          await this.ensureHealthyConnection(connection);
          const [rows] = await connection.query(sql, params);
          this.metrics?.setConnected(true);
          return rows as T;
        } catch (error) {
          const code = getErrorCode(error)?.toUpperCase();
          const stage = resolveStage(error);
          const retryable = stage === 'CONNECT' && isRetryableConnectCode(code);

          if (retryable && attempt + 1 < maxAttempts) {
            this.logger?.warn?.(
              `LuckPerms query failed (${label}) with ${code ?? 'UNKNOWN'}, retry ${attempt + 1}/${maxAttempts}`,
              { code, label, attempt: attempt + 1, maxAttempts },
            );
            this.metrics?.setConnected(false);
            await delay(backoffMs(attempt));
            continue;
          }

          this.metrics?.setConnected(false);
          this.logger?.error?.(`LuckPerms query failed (${label})`, {
            error,
            code,
            label,
          });
          throw externalError(
            stage,
            (error as Error).message,
            getErrorCode(error),
          );
        } finally {
          if (connection) {
            try {
              connection.release();
            } catch {
              // ignore release errors for dead connections
            }
          }
        }
      }
      throw externalError(
        'CONNECT',
        'LuckPerms query retry limit reached',
        'RETRY_EXHAUSTED',
      );
    } finally {
      const duration = performance.now() - start;
      this.metrics?.observeQuery(label, duration);
    }
  }

  private async ensureHealthyConnection(connection: PoolConnection) {
    const timeoutMs = 2000;
    let timer: NodeJS.Timeout | null = null;
    try {
      const pingPromise = connection.ping();
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(createPingTimeoutError(timeoutMs));
        }, timeoutMs);
        timer.unref?.();
      });
      await Promise.race([pingPromise, timeoutPromise]);
    } catch (error) {
      connection.destroy();
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}

type LuckpermsPlayerRow = RowDataPacket & {
  uuid: string;
  username: string;
  primary_group: string | null;
};

type LuckpermsPermissionRow = RowDataPacket & {
  permission: string;
  value: number | string | null;
  server?: string | null;
  world?: string | null;
  expiry?: number | string | null;
  contexts?: string | null;
};

function resolveStage(error: unknown): 'DNS' | 'CONNECT' | 'AUTH' | 'QUERY' {
  const code = getErrorCode(error);
  if (!code) {
    return 'QUERY';
  }
  const normalized = code.toUpperCase();
  if (normalized === 'ENOTFOUND' || normalized === 'EAI_AGAIN') {
    return 'DNS';
  }
  if (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'PROTOCOL_CONNECTION_LOST',
      'EHOSTUNREACH',
      'PING_TIMEOUT',
    ].includes(normalized)
  ) {
    return 'CONNECT';
  }
  if (
    ['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR'].includes(normalized)
  ) {
    return 'AUTH';
  }
  return 'QUERY';
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  if (
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

function isRetryableConnectCode(code?: string): boolean {
  if (!code) return false;
  const c = code.toUpperCase();
  return [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'PROTOCOL_CONNECTION_LOST',
    'PING_TIMEOUT',
  ].includes(c);
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return 150 * (attempt + 1);
}

function createPingTimeoutError(timeoutMs: number) {
  const error = new Error(
    `LuckPerms connection ping timed out after ${timeoutMs}ms`,
  ) as Error & { code?: string };
  error.code = 'PING_TIMEOUT';
  return error;
}

function extractGroup(permission: string | null | undefined): string | null {
  if (!permission || typeof permission !== 'string') {
    return null;
  }
  if (!permission.startsWith('group.')) {
    return null;
  }
  const group = permission.slice('group.'.length).trim();
  return group || null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber !== 0;
    }
  }
  return false;
}

function normalizeNullable(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value || null;
  }
  return String(value);
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseContexts(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result[key] = value;
      } else if (value !== null && value !== undefined) {
        result[key] = String(value);
      }
    }
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

function deduplicateMemberships(
  memberships: LuckpermsGroupMembership[],
): LuckpermsGroupMembership[] {
  const seen = new Map<string, LuckpermsGroupMembership>();
  for (const membership of memberships) {
    const key = [
      membership.group,
      membership.server ?? '',
      membership.world ?? '',
      membership.expiry ?? '',
      JSON.stringify(membership.contexts ?? {}),
    ].join('|');
    if (!seen.has(key)) {
      seen.set(key, membership);
    }
  }
  return Array.from(seen.values());
}
