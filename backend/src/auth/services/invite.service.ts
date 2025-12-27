import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '../../config/config.service';

const INVITE_NAMESPACE = 'auth.invite';
const INVITE_FLAG_KEY = 'requireInvite';
const INVITE_CODE_LENGTH = 32;
const INVITE_CODE_RE = /^[A-F0-9]{32}$/;

@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  normalizeInviteCode(input: string) {
    return input.replace(/-/g, '').trim().toUpperCase();
  }

  async getInviteRequired() {
    const entry = await this.configService.getEntry(
      INVITE_NAMESPACE,
      INVITE_FLAG_KEY,
    );
    return toBoolean(entry?.value, false);
  }

  async setInviteRequired(enabled: boolean, actorId?: string) {
    const namespace = await this.configService.ensureNamespaceByKey(
      INVITE_NAMESPACE,
      {
        name: 'Invite Codes',
        description: 'Invitation code registration policy',
      },
    );
    const entry = await this.configService.getEntry(
      INVITE_NAMESPACE,
      INVITE_FLAG_KEY,
    );
    if (entry) {
      await this.configService.updateEntry(
        entry.id,
        { value: enabled },
        actorId,
      );
    } else {
      await this.configService.createEntry(
        namespace.id,
        { key: INVITE_FLAG_KEY, value: enabled },
        actorId,
      );
    }
    return { inviteRequired: enabled } as const;
  }

  async listInvites(options: {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) {
    const page = Math.max(Number(options.page ?? 1) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number(options.pageSize ?? 20) || 20, 1),
      100,
    );
    const keyword = (options.keyword ?? '').trim();
    const where = keyword
      ? {
          OR: [
            {
              code: {
                contains: keyword.toUpperCase(),
                mode: 'insensitive' as const,
              },
            },
            {
              createdBy: {
                is: {
                  email: { contains: keyword, mode: 'insensitive' as const },
                },
              },
            },
            {
              createdBy: {
                is: {
                  name: { contains: keyword, mode: 'insensitive' as const },
                },
              },
            },
            {
              usedBy: {
                is: {
                  email: { contains: keyword, mode: 'insensitive' as const },
                },
              },
            },
            {
              usedBy: {
                is: {
                  name: { contains: keyword, mode: 'insensitive' as const },
                },
              },
            },
          ],
        }
      : undefined;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.inviteCode.count({ where }),
      this.prisma.inviteCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              name: true,
              profile: { select: { displayName: true } },
            },
          },
          usedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async createInvite(actorId?: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomUUID().replace(/-/g, '').toUpperCase();
      try {
        return await this.prisma.inviteCode.create({
          data: {
            code,
            createdById: actorId ?? null,
          },
          include: {
            createdBy: {
              select: {
                id: true,
                email: true,
                name: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        });
      } catch (error: any) {
        if (error?.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('Failed to generate invite code');
  }

  async deleteInvite(inviteId: string) {
    await this.prisma.inviteCode.delete({ where: { id: inviteId } });
    return { success: true } as const;
  }

  async assertInviteAvailable(rawCode: string) {
    const normalized = this.normalizeInviteCode(rawCode);
    if (
      normalized.length !== INVITE_CODE_LENGTH ||
      !INVITE_CODE_RE.test(normalized)
    ) {
      throw new BadRequestException('Invitation code is invalid');
    }
    const invite = await this.prisma.inviteCode.findUnique({
      where: { code: normalized },
    });
    if (!invite) {
      throw new BadRequestException('Invitation code is invalid');
    }
    if (invite.usedById) {
      throw new BadRequestException('Invitation code has been used');
    }
    return invite;
  }

  async consumeInvite(rawCode: string, userId: string) {
    const normalized = this.normalizeInviteCode(rawCode);
    const updated = await this.prisma.inviteCode.updateMany({
      where: { code: normalized, usedById: null },
      data: {
        usedById: userId,
        usedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Invitation code has been used');
    }
    return { success: true } as const;
  }
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
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
