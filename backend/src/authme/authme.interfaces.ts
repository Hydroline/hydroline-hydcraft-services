import type { Pool } from 'mysql2/promise';

export interface AuthmeUser {
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
}

export type AuthmeHealth =
  | { ok: true; latencyMs: number }
  | {
      ok: false;
      stage: 'DNS' | 'CONNECT' | 'AUTH' | 'QUERY';
      message: string;
      cause?: string;
    };

export interface AuthmeLib {
  readonly pool: Pool;
  health(): Promise<AuthmeHealth>;
  close(): Promise<void>;
  getByUsername(username: string): Promise<AuthmeUser | null>;
  getByRealname(realname: string): Promise<AuthmeUser | null>;
  getByUsernameOrRealname(identifier: string): Promise<AuthmeUser | null>;
  listAll(offset?: number, limit?: number): Promise<AuthmeUser[]>;
  listPaged(params: {
    keyword?: string | null;
    offset?: number;
    limit?: number;
  }): Promise<{ rows: AuthmeUser[]; total: number }>;
  listAllByIp(
    ip: string,
    offset?: number,
    limit?: number,
  ): Promise<AuthmeUser[]>;
  listIpsByUsername(username: string): Promise<string[]>;
  exists(usernameOrRealname: string): Promise<boolean>;
  verifyPassword(storedPassword: string, plain: string): Promise<boolean>;
}
