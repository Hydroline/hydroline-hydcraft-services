import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactVerificationStatus, Prisma } from '@prisma/client';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcryptjs';
import { generateRandomString } from 'better-auth/crypto';
import { UsersServiceContext } from './users.context';
import {
  clearPrimaryContact,
  normalizeOptionalString,
  toJson,
} from './users.helpers';
import { ensureUser } from './users-core.manager';
import { CreateUserContactDto } from '../../dto/create-user-contact.dto';
import { UpdateUserContactDto } from '../../dto/update-user-contact.dto';

export async function addContact(
  ctx: UsersServiceContext,
  userId: string,
  dto: CreateUserContactDto,
) {
  await ensureUser(ctx, userId);
  const channel = await ctx.prisma.contactChannel.findUnique({
    where: { key: dto.channelKey },
  });
  if (!channel) {
    throw new NotFoundException('Contact channel not found');
  }

  if (!channel.allowMultiple) {
    const exists = await ctx.prisma.userContact.findFirst({
      where: { userId, channelId: channel.id },
    });
    if (exists) {
      throw new BadRequestException('Channel does not allow multiple values');
    }
  }

  const existingCount = await ctx.prisma.userContact.count({
    where: { userId, channelId: channel.id },
  });
  const shouldBePrimary = existingCount === 0 || Boolean(dto.isPrimary);

  const existingSame = await ctx.prisma.userContact.findFirst({
    where: { userId, channelId: channel.id, value: dto.value },
  });
  if (existingSame) {
    if (shouldBePrimary) {
      await clearPrimaryContact(ctx, userId, channel.id);
    }
    if (shouldBePrimary && !existingSame.isPrimary) {
      await ctx.prisma.userContact.update({
        where: { id: existingSame.id },
        data: { isPrimary: true },
      });
    }
    if (dto.metadata !== undefined) {
      await ctx.prisma.userContact.update({
        where: { id: existingSame.id },
        data: { metadata: toJson(dto.metadata) },
      });
    }
    const refreshed = await ctx.prisma.userContact.findUnique({
      where: { id: existingSame.id },
      include: { channel: true },
    });
    if (
      refreshed &&
      channel.key === 'email' &&
      refreshed.verification !== ContactVerificationStatus.VERIFIED
    ) {
      try {
        await sendEmailVerificationCode(ctx, userId, refreshed.value);
      } catch {
        ctx.logger.warn('发送邮箱验证邮件失败（已忽略）');
      }
    }
    return refreshed;
  }

  if (shouldBePrimary) {
    await clearPrimaryContact(ctx, userId, channel.id);
  }

  const contact = await ctx.prisma.userContact.create({
    data: {
      userId,
      channelId: channel.id,
      value: dto.value,
      isPrimary: shouldBePrimary,
      verification: ContactVerificationStatus.UNVERIFIED,
      verifiedAt: null,
      metadata: toJson(dto.metadata),
    },
    include: { channel: true },
  });

  if (channel.key === 'email') {
    try {
      await sendEmailVerificationCode(ctx, userId, contact.value);
    } catch {
      ctx.logger.warn('发送邮箱验证邮件失败，已忽略');
    }
  }
  return contact;
}

export async function addContactAdmin(
  ctx: UsersServiceContext,
  userId: string,
  dto: CreateUserContactDto,
) {
  await ensureUser(ctx, userId);
  const channel = await ctx.prisma.contactChannel.findUnique({
    where: { key: dto.channelKey },
  });
  if (!channel) {
    throw new NotFoundException('Contact channel not found');
  }
  if (!channel.allowMultiple) {
    const exists = await ctx.prisma.userContact.findFirst({
      where: { userId, channelId: channel.id },
    });
    if (exists) {
      throw new BadRequestException('Channel does not allow multiple values');
    }
  }
  const existingCount = await ctx.prisma.userContact.count({
    where: { userId, channelId: channel.id },
  });
  const shouldBePrimary = existingCount === 0 || Boolean(dto.isPrimary);

  const existingSame = await ctx.prisma.userContact.findFirst({
    where: { userId, channelId: channel.id, value: dto.value },
  });
  if (existingSame) {
    if (shouldBePrimary) {
      await clearPrimaryContact(ctx, userId, channel.id);
    }
    if (shouldBePrimary && !existingSame.isPrimary) {
      await ctx.prisma.userContact.update({
        where: { id: existingSame.id },
        data: { isPrimary: true },
      });
    }
    if (dto.metadata !== undefined) {
      await ctx.prisma.userContact.update({
        where: { id: existingSame.id },
        data: { metadata: toJson(dto.metadata) },
      });
    }
    return ctx.prisma.userContact.findUnique({
      where: { id: existingSame.id },
      include: { channel: true },
    });
  }

  if (shouldBePrimary) {
    await clearPrimaryContact(ctx, userId, channel.id);
  }

  return ctx.prisma.userContact.create({
    data: {
      userId,
      channelId: channel.id,
      value: dto.value,
      isPrimary: shouldBePrimary,
      verification: ContactVerificationStatus.UNVERIFIED,
      verifiedAt: null,
      metadata: toJson(dto.metadata),
    },
    include: { channel: true },
  });
}

export async function updateContact(
  ctx: UsersServiceContext,
  userId: string,
  contactId: string,
  dto: UpdateUserContactDto,
) {
  await ensureUser(ctx, userId);
  const existing = await ctx.prisma.userContact.findUnique({
    include: { channel: true },
    where: { id: contactId },
  });
  if (!existing || existing.userId !== userId) {
    throw new NotFoundException('Contact not found');
  }

  if (dto.isPrimary) {
    await clearPrimaryContact(ctx, userId, existing.channelId);
  }

  return ctx.prisma.userContact.update({
    where: { id: contactId },
    data: {
      value: dto.value ?? existing.value,
      isPrimary: dto.isPrimary ?? existing.isPrimary,
      metadata:
        dto.metadata !== undefined ? toJson(dto.metadata) : existing.metadata,
    },
    include: { channel: true },
  });
}

export async function removeContact(
  ctx: UsersServiceContext,
  userId: string,
  contactId: string,
) {
  await ensureUser(ctx, userId);
  const existing = await ctx.prisma.userContact.findUnique({
    where: { id: contactId },
    include: {
      channel: {
        select: {
          id: true,
          key: true,
        },
      },
    },
  });
  if (!existing || existing.userId !== userId) {
    throw new NotFoundException('Contact not found');
  }
  await ctx.prisma.$transaction(async (tx) => {
    await tx.userContact.delete({ where: { id: contactId } });

    const remaining = await tx.userContact.findMany({
      where: { userId, channelId: existing.channelId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    let nextPrimary = remaining.find((contact) => contact.isPrimary) ?? null;

    if (!nextPrimary && remaining.length > 0) {
      const preferred =
        remaining.find(
          (contact) =>
            contact.verification === ContactVerificationStatus.VERIFIED,
        ) ?? remaining[0];
      if (preferred) {
        await tx.userContact.update({
          where: { id: preferred.id },
          data: { isPrimary: true },
        });
        nextPrimary = preferred;
      }
    }

    if (
      nextPrimary &&
      existing.channel.key === 'email' &&
      nextPrimary.verification === ContactVerificationStatus.VERIFIED
    ) {
      await tx.user.update({
        where: { id: userId },
        data: { email: nextPrimary.value, emailVerified: true },
      });
    }
  });
}

export async function sendEmailVerificationCode(
  ctx: UsersServiceContext,
  userId: string,
  emailRaw: string,
) {
  const email = normalizeOptionalString(emailRaw);
  if (!email) {
    throw new BadRequestException('邮箱地址无效');
  }
  const userInfo = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      profile: { select: { displayName: true } },
    },
  });
  const displayName =
    userInfo?.profile?.displayName?.trim() ??
    userInfo?.name?.trim() ??
    userInfo?.email ??
    email;
  const now = new Date();
  const year = now.getFullYear();
  const datetime = `${year}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(
    now.getDate(),
  ).padStart(2, '0')}日`;
  const identifier = `${ctx.emailVerificationIdentifierPrefix}${email.toLowerCase()}`;
  const code = generateRandomString(6, '0-9');
  const hashed = await bcryptHash(code, 10);
  await ctx.prisma.$transaction(async (tx) => {
    await tx.verification.deleteMany({ where: { identifier } });
    await tx.verification.create({
      data: {
        identifier,
        value: hashed,
        expiresAt: new Date(Date.now() + ctx.verificationTtlMs),
      },
    });
  });
  try {
    await ctx.mailService.sendMail({
      to: email,
      subject: 'Hydroline 邮箱验证',
      text: `验证码: ${code}，10 分钟内有效。`,
      template: 'password-code',
      context: {
        displayName,
        code,
        ipHint: '',
        datetime,
        currentYear: String(year),
      },
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    ctx.logger.warn(`发送邮箱验证邮件失败: ${reason}`);
    throw new BadRequestException('验证码发送失败，请稍后重试');
  }
  return { success: true } as const;
}

export async function verifyEmailContact(
  ctx: UsersServiceContext,
  userId: string,
  emailRaw: string,
  code: string,
) {
  const email = normalizeOptionalString(emailRaw);
  if (!email) {
    throw new BadRequestException('邮箱地址无效');
  }
  const identifier = `${ctx.emailVerificationIdentifierPrefix}${email.toLowerCase()}`;
  const record = await ctx.prisma.verification.findFirst({
    where: { identifier, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  if (!record) {
    throw new BadRequestException('验证码无效或已过期');
  }
  const isMatch = await bcryptCompare(code, record.value);
  if (!isMatch) {
    throw new BadRequestException('验证码错误');
  }
  const contacts = await ctx.prisma.userContact.findMany({
    where: { userId, value: email, channel: { key: 'email' } },
  });
  if (contacts.length === 0) {
    throw new NotFoundException('未找到对应的邮箱联系人');
  }
  await ctx.prisma.$transaction(async (tx) => {
    await tx.verification
      .delete({ where: { id: record.id } })
      .catch(() => undefined);
    await tx.userContact.updateMany({
      where: { userId, value: email, channel: { key: 'email' } },
      data: {
        verification: ContactVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });
    const primary = contacts.find((c) => c.isPrimary);
    if (primary) {
      await tx.user.update({
        where: { id: userId },
        data: { email, emailVerified: true },
      });
    }
  });
  return { success: true } as const;
}

export async function listEmailContacts(
  ctx: UsersServiceContext,
  userId: string,
) {
  await ensureUser(ctx, userId);
  await ensurePrimaryEmailContactRecord(ctx, userId);
  return ctx.prisma.userContact.findMany({
    where: { userId, channel: { key: 'email' } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      value: true,
      isPrimary: true,
      verification: true,
      verifiedAt: true,
    },
  });
}

async function ensurePrimaryEmailContactRecord(
  ctx: UsersServiceContext,
  userId: string,
) {
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
  if (!user?.email) {
    return;
  }

  const channel = await ctx.prisma.contactChannel.upsert({
    where: { key: 'email' },
    update: {},
    create: {
      key: 'email',
      displayName: '邮箱',
      description: '账号安全与通知邮箱',
      allowMultiple: true,
      isRequired: false,
      isVerifiable: true,
    },
    select: { id: true },
  });

  const existing = await ctx.prisma.userContact.findFirst({
    where: { userId, channelId: channel.id, value: user.email },
    select: {
      id: true,
      isPrimary: true,
      verification: true,
      verifiedAt: true,
    },
  });

  const promoteVerification =
    user.emailVerified &&
    existing?.verification !== ContactVerificationStatus.VERIFIED;

  if (!existing) {
    await ctx.prisma.$transaction(async (tx) => {
      await tx.userContact.updateMany({
        where: { userId, channelId: channel.id, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.userContact.create({
        data: {
          userId,
          channelId: channel.id,
          value: user.email,
          isPrimary: true,
          verification: promoteVerification
            ? ContactVerificationStatus.VERIFIED
            : ContactVerificationStatus.UNVERIFIED,
          verifiedAt: promoteVerification ? new Date() : null,
        },
      });
    });
    return;
  }

  if (existing.isPrimary && !promoteVerification) {
    return;
  }

  await ctx.prisma.$transaction(async (tx) => {
    if (!existing.isPrimary) {
      await tx.userContact.updateMany({
        where: {
          userId,
          channelId: channel.id,
          isPrimary: true,
          id: { not: existing.id },
        },
        data: { isPrimary: false },
      });
    }
    await tx.userContact.update({
      where: { id: existing.id },
      data: {
        isPrimary: true,
        verification: promoteVerification
          ? ContactVerificationStatus.VERIFIED
          : existing.verification,
        verifiedAt: promoteVerification
          ? (existing.verifiedAt ?? new Date())
          : existing.verifiedAt,
      },
    });
  });
}

export async function setPrimaryEmailContact(
  ctx: UsersServiceContext,
  userId: string,
  contactId: string,
) {
  await ensureUser(ctx, userId);
  const contact = await ctx.prisma.userContact.findUnique({
    where: { id: contactId },
    include: { channel: true },
  });
  if (!contact || contact.userId !== userId) {
    throw new NotFoundException('Contact not found');
  }
  if (contact.channel.key !== 'email') {
    throw new BadRequestException('只能设置邮箱为主联系信息');
  }
  if (contact.verification !== ContactVerificationStatus.VERIFIED) {
    throw new BadRequestException('请先完成邮箱验证后再设为主邮箱');
  }
  await ctx.prisma.$transaction(async (tx) => {
    await tx.userContact.updateMany({
      where: { userId, channelId: contact.channelId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.userContact.update({
      where: { id: contactId },
      data: { isPrimary: true },
    });
    await tx.user.update({
      where: { id: userId },
      data: { email: contact.value, emailVerified: true },
    });
  });
  return { success: true } as const;
}
