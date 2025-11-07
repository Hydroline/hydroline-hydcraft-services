import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditPayload = Record<string, unknown> | undefined;

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    actorId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    payload?: AuditPayload;
  }) {
    await this.prisma.adminAuditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        payload:
          entry.payload !== undefined
            ? (entry.payload as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
  }
}
