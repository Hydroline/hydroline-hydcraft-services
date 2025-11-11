import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const betterAuthLogger = new Logger('BetterAuth');

function formatLogItem(item: unknown): string {
  if (item instanceof Error) {
    return item.stack ?? item.message;
  }
  if (item && typeof item === 'object') {
    try {
      return JSON.stringify(item);
    } catch {
      return Object.prototype.toString.call(item) as string;
    }
  }
  if (typeof item === 'string') {
    return item;
  }
  if (
    typeof item === 'number' ||
    typeof item === 'boolean' ||
    typeof item === 'bigint'
  ) {
    return String(item);
  }
  if (typeof item === 'symbol') {
    return item.description ?? item.toString();
  }
  if (typeof item === 'function') {
    return item.name ? `[function ${item.name}]` : '[function]';
  }
  return '';
}

function serializeLogArgs(args: unknown[]): string | undefined {
  if (!args || args.length === 0) return undefined;
  return args
    .map((item) => formatLogItem(item))
    .filter(Boolean)
    .join(' ');
}
const prismaForAdapter = prisma.$extends({
  query: {
    account: {
      async create({ args, query }) {
        if (args?.data) {
          const data = { ...(args.data as Record<string, unknown>) };
          const ensureString = (key: string, fallback: string) => {
            const value = data[key];
            if (typeof value !== 'string' || value.length === 0) {
              data[key] = fallback;
            }
          };

          ensureString('type', 'credential');
          const fallbackId =
            (typeof data.userId === 'string' && data.userId) ||
            (typeof data.accountId === 'string' && data.accountId) ||
            'credential';
          ensureString('providerAccountId', fallbackId);
          ensureString('providerId', fallbackId);
          const providerValue =
            (typeof data.providerId === 'string' && data.providerId) ||
            (typeof data.provider === 'string' && data.provider) ||
            'credential';
          data.provider = providerValue;
          ensureString('provider', 'credential');

          const nextArgs = {
            ...args,
            data,
          };
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - Prisma type infers stricter input here, but runtime accepts sanitized data
          return query(nextArgs);
        }
        return query(args);
      },
    },
  },
});
const baseAdapterFactory = prismaAdapter(prismaForAdapter, {
  provider: 'postgresql',
});

export const auth = betterAuth({
  database: (options) => {
    const adapter = baseAdapterFactory(options) as any;
    const originalCreate = adapter.create?.bind(adapter);
    if (typeof originalCreate === 'function') {
      adapter.create = async (args: any) => {
        if (
          args?.model === 'Account' &&
          args.data &&
          typeof args.data.type !== 'string'
        ) {
          args = {
            ...args,
            data: {
              ...args.data,
              type: 'credential',
            },
          };
        }
        return originalCreate(args);
      };
    }
    return adapter;
  },
  emailAndPassword: {
    enabled: true,
  },
  logger: {
    level: 'error',
    log(level, message, ...args) {
      const normalizedMessage =
        typeof message === 'string'
          ? message.toLowerCase()
          : String(message).toLowerCase();
      if (normalizedMessage.includes('invalid password')) {
        return;
      }

      const extras = serializeLogArgs(args);
      const payload = extras ? `${String(message)} ${extras}` : String(message);
      const firstError = args.find(
        (item): item is Error => item instanceof Error,
      );

      switch (level) {
        case 'warn':
          betterAuthLogger.warn(payload);
          break;
        case 'debug':
          betterAuthLogger.debug(payload);
          break;
        case 'info':
          betterAuthLogger.log(payload);
          break;
        default:
          if (firstError) {
            betterAuthLogger.error(payload, firstError.stack);
          } else {
            betterAuthLogger.error(payload);
          }
      }
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  secret: process.env.BETTER_AUTH_SECRET || 'your-secret-key',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
});

export type Session = typeof auth.$Infer.Session;
