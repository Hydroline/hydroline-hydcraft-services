import * as mysql from 'mysql2/promise';
import type {
  Pool,
  PoolConnection,
  PoolOptions,
  RowDataPacket,
} from 'mysql2/promise';
import { performance } from 'node:perf_hooks';
import { AuthmeDbConfig } from '../../authme/authme.config';
import {
  AuthmeLib,
  AuthmeUser,
  AuthmeHealth,
} from '../../authme/authme.interfaces';
import { AuthmeMetricsRecorder } from '../../authme/authme.metrics';
import { externalError } from '../../authme/authme.errors';
import { normalizePasswordSegments, verifyShaPassword } from './password';

export interface LoggerLike {
  debug?(message: string, meta?: Record<string, unknown>): void;
  log?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export interface AuthmeLibOptions {
  config: AuthmeDbConfig;
  logger?: LoggerLike;
  metrics?: AuthmeMetricsRecorder;
  poolOverride?: Pool;
}

const DEFAULT_LIMIT = 50;

export class MysqlAuthmeLib implements AuthmeLib {
  readonly pool: Pool;
  private readonly logger?: LoggerLike;
  private readonly metrics?: AuthmeMetricsRecorder;

  constructor(options: AuthmeLibOptions) {
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

  async health(): Promise<AuthmeHealth> {
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
      return { ok: true, latencyMs };
    } catch (error) {
      this.metrics?.setConnected(false);
      const stage = resolveStage(error);
      return {
        ok: false,
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

  async getByUsername(username: string): Promise<AuthmeUser | null> {
    const rows = await this.query<AuthmeUserRow[]>(
      `SELECT * FROM authme WHERE LOWER(username) = LOWER(?) LIMIT 1`,
      [username],
      'getByUsername',
    );
    if (!rows.length) {
      return null;
    }
    return mapUser(rows[0]);
  }

  async getByRealname(realname: string): Promise<AuthmeUser | null> {
    const rows = await this.query<AuthmeUserRow[]>(
      `SELECT * FROM authme WHERE LOWER(realname) = LOWER(?) LIMIT 1`,
      [realname],
      'getByRealname',
    );
    if (!rows.length) {
      return null;
    }
    return mapUser(rows[0]);
  }

  async getByUsernameOrRealname(
    identifier: string,
  ): Promise<AuthmeUser | null> {
    const byUsername = await this.getByUsername(identifier);
    if (byUsername) {
      return byUsername;
    }
    return this.getByRealname(identifier);
  }

  async listAll(offset = 0, limit = DEFAULT_LIMIT): Promise<AuthmeUser[]> {
    const rows = await this.query<AuthmeUserRow[]>(
      `SELECT * FROM authme ORDER BY id LIMIT ? OFFSET ?`,
      [limit, offset],
      'listAll',
    );
    return rows.map(mapUser);
  }

  async listAllByIp(
    ip: string,
    offset = 0,
    limit = DEFAULT_LIMIT,
  ): Promise<AuthmeUser[]> {
    const rows = await this.query<AuthmeUserRow[]>(
      `SELECT * FROM authme WHERE ip = ? ORDER BY id LIMIT ? OFFSET ?`,
      [ip, limit, offset],
      'listAllByIp',
    );
    return rows.map(mapUser);
  }

  async listIpsByUsername(username: string): Promise<string[]> {
    const rows = await this.query<RowDataPacket[]>(
      `SELECT ip, regip FROM authme WHERE LOWER(username) = LOWER(?) LIMIT 1`,
      [username],
      'listIpsByUsername',
    );
    if (!rows.length) {
      return [];
    }
    const row = rows[0];
    const set = new Set<string>();
    if (row.ip) {
      set.add(String(row.ip));
    }
    if (row.regip) {
      set.add(String(row.regip));
    }
    return Array.from(set);
  }

  async exists(usernameOrRealname: string): Promise<boolean> {
    const rows = await this.query<RowDataPacket[]>(
      `SELECT 1 FROM authme WHERE LOWER(username) = LOWER(?) OR LOWER(realname) = LOWER(?) LIMIT 1`,
      [usernameOrRealname, usernameOrRealname],
      'exists',
    );
    return rows.length > 0;
  }

  async verifyPassword(
    storedPassword: string,
    plain: string,
  ): Promise<boolean> {
    const segments = normalizePasswordSegments(storedPassword);
    if (!segments) {
      this.metrics?.incrementVerifyFailed('invalid_format');
      return false;
    }
    switch (segments.algorithm) {
      case 'SHA': {
        const match = await verifyShaPassword(storedPassword, plain);
        if (!match) {
          this.metrics?.incrementVerifyFailed('sha_mismatch');
        }
        return match;
      }
      default:
        this.logger?.warn?.(
          `Unsupported AuthMe password algorithm: ${segments.algorithm}`,
        );
        this.metrics?.incrementVerifyFailed('not_supported');
        return false;
    }
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
              `AuthMe query failed (${label}) with ${code ?? 'UNKNOWN'}, reconnecting and retry (${attempt + 1}/${maxAttempts})`,
              { code, label, attempt: attempt + 1, maxAttempts },
            );
            this.metrics?.setConnected(false);
            await delay(backoffMs(attempt));
            continue;
          }

          this.metrics?.setConnected(false);
          this.logger?.error?.(`AuthMe query failed (${label})`, {
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
              // ignore release errors for defunct connections
            }
          }
        }
      }

      // Exhausted retries
      throw externalError(
        'CONNECT',
        'AuthMe query retry limit reached',
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

type AuthmeUserRow = RowDataPacket & {
  id: number;
  username: string;
  realname: string;
  password: string;
  ip?: string | null;
  lastlogin?: number | null;
  x: number;
  y: number;
  z: number;
  world: string;
  regdate: number;
  regip?: string | null;
  yaw?: number | null;
  pitch?: number | null;
  email?: string | null;
  isLogged: number;
  hasSession: number;
  totp?: string | null;
};

function mapUser(row: AuthmeUserRow): AuthmeUser {
  return {
    id: Number(row.id),
    username: row.username,
    realname: row.realname,
    password: row.password,
    ip: row.ip ?? null,
    lastlogin: row.lastlogin ?? null,
    x: Number(row.x ?? 0),
    y: Number(row.y ?? 0),
    z: Number(row.z ?? 0),
    world: row.world,
    regdate: Number(row.regdate ?? 0),
    regip: row.regip ?? null,
    yaw: row.yaw ?? null,
    pitch: row.pitch ?? null,
    email: row.email ?? null,
    isLogged: Number(row.isLogged ?? 0),
    hasSession: Number(row.hasSession ?? 0),
    totp: row.totp ?? null,
  } satisfies AuthmeUser;
}

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
    `AuthMe connection ping timed out after ${timeoutMs}ms`,
  ) as Error & { code?: string };
  error.code = 'PING_TIMEOUT';
  return error;
}
