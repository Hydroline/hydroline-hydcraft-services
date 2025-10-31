import type { User } from '@prisma/client';

type UserWithRelations = User & Record<string, unknown>;

declare global {
  namespace Express {
    interface Request {
      user?: UserWithRelations;
      sessionToken?: string;
    }
  }
}

export {};
