export const AUTHME_DB_NAMESPACE = 'authme.db';
export const AUTH_FEATURE_NAMESPACE = AUTHME_DB_NAMESPACE;

export const AUTHME_CONFIG_POLL_INTERVAL_MS = 15_000;
export const AUTH_FEATURE_CACHE_TTL_MS = 10_000;

export const AUTHME_DEFAULT_SAFE_MESSAGE =
  'AuthMe 数据库暂时不可用，请联系管理员或选择其他方式登录';

export const AUTHME_BIND_RATE_LIMIT_WINDOW_MS = 60_000;
export const AUTHME_BIND_RATE_LIMITS = {
  ip: 10,
  user: 20,
};
