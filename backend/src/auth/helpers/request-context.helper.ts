import type { Request } from 'express';
import type { RequestContext } from '../auth.service';

const forwardedHeaderKeys = [
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
  'x-forwarded',
  'forwarded-for',
  'forwarded',
  'x-cluster-client-ip',
];

function extractIps(headerValue: string | string[] | undefined): string[] {
  if (!headerValue) {
    return [];
  }
  if (Array.isArray(headerValue)) {
    return headerValue.flatMap((entry) => extractIps(entry));
  }
  return headerValue
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
}

export function buildRequestContext(req: Request): RequestContext {
  const headerIps = forwardedHeaderKeys.flatMap((key) =>
    extractIps(req.headers[key]),
  );
  const primaryHeaderIp = headerIps.find((ip) => ip.length > 0);
  const expressIps = Array.isArray(req.ips) ? req.ips : [];
  const fallbackIp = expressIps.find((ip) => ip.length > 0);
  const remoteIp =
    typeof req.socket?.remoteAddress === 'string'
      ? req.socket.remoteAddress
      : undefined;
  const rawIp = primaryHeaderIp ?? fallbackIp ?? remoteIp ?? req.ip ?? null;
  const ip = typeof rawIp === 'string' ? rawIp.trim() || null : null;
  const uaHeader = req.headers['user-agent'];
  const resolvedUserAgent =
    typeof uaHeader === 'string'
      ? uaHeader
      : Array.isArray(uaHeader)
        ? uaHeader[0]
        : undefined;
  const userAgent = resolvedUserAgent ?? null;

  return {
    ip,
    userAgent,
  };
}
