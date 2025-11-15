import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactVerificationStatus, Prisma } from '@prisma/client';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcryptjs';
import { generateRandomString } from 'better-auth/crypto';
import { UsersServiceContext } from './users.context';
import { formatDateTimeCn } from '../../../lib/shared/datetime';
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
        dto.metadata !== undefined
          ? toJson(dto.metadata)
          : (existing.metadata ?? Prisma.JsonNull),
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
  if (existing.channel.key === 'email') {
    const remainingCount = await ctx.prisma.userContact.count({
      where: { userId, channelId: existing.channelId },
    });
    if (remainingCount <= 1) {
      throw new BadRequestException('At least one email contact must be retained');
    }
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
    throw new BadRequestException('Invalid email address');
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
  const datetime = formatDateTimeCn(now);
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
    const plainText = `您好 ${displayName}，\n\n您的邮箱验证验证码为 ${code}，有效期 10 分钟。如非本人操作，请忽略本邮件。\n\nHydroline（氢气工艺）敬上`;
    await ctx.mailService.sendMail({
      to: email,
      subject: 'Hydroline 邮箱验证',
      text: plainText,
      template: 'password-code',
      context: {
        displayName,
        code,
        ipHint: '',
        datetime,
        currentYear: String(year),
        plaintext: plainText,
        operation: '邮箱验证',
      },
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    ctx.logger.warn(`Failed to send email verification: ${reason}`);
    throw new BadRequestException('Verification code sent failed, please try again later');
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
    throw new BadRequestException('Invalid email address');
  }
  const identifier = `${ctx.emailVerificationIdentifierPrefix}${email.toLowerCase()}`;
  const record = await ctx.prisma.verification.findFirst({
    where: { identifier, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  if (!record) {
    throw new BadRequestException('Verification code expired or invalid');
  }
  const isMatch = await bcryptCompare(code, record.value);
  if (!isMatch) {
    throw new BadRequestException('Verification code incorrect');
  }
  const contacts = await ctx.prisma.userContact.findMany({
    where: { userId, value: email, channel: { key: 'email' } },
  });
  if (contacts.length === 0) {
    throw new NotFoundException('Email contact not found');
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
    throw new BadRequestException('Can only set email as primary contact');
  }
  if (contact.verification !== ContactVerificationStatus.VERIFIED) {
    throw new BadRequestException('Email must be verified before setting as primary');
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

type PhoneContactPayload = {
  dialCode: string;
  phone: string;
  isPrimary?: boolean;
};

type PhoneContactUpdatePayload = {
  dialCode?: string;
  phone?: string;
  isPrimary?: boolean;
};

const DEFAULT_PHONE_DIAL_CODES = ['+86', '+852', '+853', '+886'] as const;

const KNOWN_DIAL_REGIONS: Record<string, string> = {
  '+86': 'CN',
  '+852': 'HK',
  '+853': 'MO',
  '+886': 'TW',
};

const COUNTRY_TO_DIAL_CODE: Record<string, string> = {
  CN: '+86',
  HK: '+852',
  MO: '+853',
  TW: '+886',
};

function normalizeDialCode(dialRaw: string, allowed: string[]) {
  const dial = normalizeOptionalString(dialRaw) ?? '';
  if (!/^\+\d{2,6}$/.test(dial)) {
    throw new BadRequestException('Invalid dial code format');
  }
  if (!allowed.includes(dial)) {
    throw new BadRequestException('Unsupported dial code region');
  }
  return dial;
}

function normalizePhoneNumber(input: string) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length < 5 || digits.length > 16) {
    throw new BadRequestException('Phone number length out of range');
  }
  return digits;
}

function composePhoneValue(dialCode: string, number: string) {
  return `${dialCode}${number}`;
}

function deriveRegionByDial(dialCode: string) {
  return KNOWN_DIAL_REGIONS[dialCode] ?? null;
}

function resolveDialCodeByCountry(
  country: string | null | undefined,
  allowed: string[],
) {
  const normalized =
    typeof country === 'string' && country.trim().length > 0
      ? country.trim().toUpperCase()
      : '';
  const preferred = normalized ? COUNTRY_TO_DIAL_CODE[normalized] : undefined;
  if (preferred && allowed.includes(preferred)) {
    return preferred;
  }
  const fallback = allowed.length > 0 ? allowed : [...DEFAULT_PHONE_DIAL_CODES];
  if (preferred && fallback.includes(preferred)) {
    return preferred;
  }
  return fallback[0] ?? '+86';
}

async function ensurePhoneChannel(ctx: UsersServiceContext) {
  return ctx.prisma.contactChannel.upsert({
    where: { key: 'phone' },
    update: {},
    create: {
      key: 'phone',
      displayName: '手机号码',
      description: '账号安全手机号',
      allowMultiple: true,
      isRequired: false,
      isVerifiable: true,
    },
  });
}

async function isPhoneVerificationEnabled(ctx: UsersServiceContext) {
  const entry = await ctx.configService.getEntry(
    'security.verification',
    'enablePhoneVerification',
  );
  const value = entry?.value;
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
    if (!Number.isNaN(Number(normalized))) {
      return Number(normalized) !== 0;
    }
  }
  return false;
}

async function getSupportedPhoneDialCodes(ctx: UsersServiceContext) {
  const entry = await ctx.configService.getEntry(
    'security.verification',
    'supportedPhoneRegions',
  );
  const value = entry?.value;
  if (Array.isArray(value)) {
    const list = value
      .map((item) => (typeof item === 'string' ? item.trim() : null))
      .filter((item): item is string => Boolean(item));
    if (list.length > 0) {
      return list;
    }
  }
  return [...DEFAULT_PHONE_DIAL_CODES];
}

async function migrateLegacyProfilePhoneContact(
  ctx: UsersServiceContext,
  userId: string,
) {
  const profile = await ctx.prisma.userProfile.findUnique({
    where: { userId },
    select: { extra: true },
  });
  if (!profile?.extra || typeof profile.extra !== 'object') {
    return;
  }

  const extra = profile.extra as Record<string, unknown>;
  const rawPhone =
    typeof extra.phone === 'string' ? extra.phone.trim() : '';
  const rawCountry =
    typeof extra.phoneCountry === 'string'
      ? extra.phoneCountry.trim().toUpperCase()
      : '';

  if (!rawPhone && !('phone' in extra || 'phoneCountry' in extra)) {
    return;
  }

  const allowedDialCodes = await getSupportedPhoneDialCodes(ctx);
  const dialCode = resolveDialCodeByCountry(rawCountry, allowedDialCodes);

  let normalizedValue: string | null = null;
  if (rawPhone) {
    try {
      const normalizedNumber = normalizePhoneNumber(rawPhone);
      normalizedValue = composePhoneValue(dialCode, normalizedNumber);
    } catch (error) {
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      ctx.logger.warn(`跳过迁移历史手机号 ${rawPhone}: ${reason}`);
    }
  }

  const channel = await ensurePhoneChannel(ctx);

  if (normalizedValue) {
    const existing = await ctx.prisma.userContact.findFirst({
      where: { userId, channel: { key: 'phone' }, value: normalizedValue },
    });

    if (!existing) {
      const existingCount = await ctx.prisma.userContact.count({
        where: { userId, channelId: channel.id },
      });
      const shouldBePrimary = existingCount === 0;
      if (shouldBePrimary) {
        await clearPrimaryContact(ctx, userId, channel.id);
      }

      const verificationEnabled = await isPhoneVerificationEnabled(ctx);
      const metadata = {
        dialCode,
        region: deriveRegionByDial(dialCode),
        legacySource: 'profile.extra.phone',
      } as Record<string, unknown>;

      await ctx.prisma.userContact.create({
        data: {
          userId,
          channelId: channel.id,
          value: normalizedValue,
          isPrimary: shouldBePrimary,
          verification: verificationEnabled
            ? ContactVerificationStatus.PENDING
            : ContactVerificationStatus.VERIFIED,
          verifiedAt: verificationEnabled ? null : new Date(),
          metadata: toJson(metadata),
        },
      });
    }
  }

  if ('phone' in extra || 'phoneCountry' in extra) {
    const updatedExtra = { ...extra };
    delete updatedExtra.phone;
    delete updatedExtra.phoneCountry;

    const cleanedExtra = Object.fromEntries(
      Object.entries(updatedExtra).filter(([, value]) => value !== undefined),
    );

    await ctx.prisma.userProfile.update({
      where: { userId },
      data: {
        extra:
          Object.keys(cleanedExtra).length > 0
            ? toJson(cleanedExtra)
            : Prisma.JsonNull,
      },
    });
  }
}

function extractDialFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const dial = (metadata as Record<string, unknown>)['dialCode'];
  return typeof dial === 'string' ? dial : null;
}

async function deliverPhoneVerificationCode(
  ctx: UsersServiceContext,
  userId: string,
  phoneValue: string,
  code: string,
) {
  const userInfo = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      profile: { select: { displayName: true } },
    },
  });
  const email = userInfo?.email?.trim();
  if (!email) {
    throw new BadRequestException('Cannot send verification code, please bind email first');
  }
  const displayName =
    userInfo?.profile?.displayName?.trim() ?? userInfo?.name?.trim() ?? email;
  const now = new Date();
  const year = now.getFullYear();
  const datetime = `${year}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(
    now.getDate(),
  ).padStart(2, '0')}日`;
  const text = `用于验证手机号 ${phoneValue} 的验证码为 ${code}，10 分钟内有效。`;
  try {
    await ctx.mailService.sendMail({
      to: email,
      subject: 'Hydroline 手机验证',
      text: `${displayName}，您好：\n${text}\n如非本人操作，请忽略本邮件。`,
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    ctx.logger.warn(`Failed to send phone verification email: ${reason}`);
    throw new BadRequestException('Verification code sent failed, please try again later');
  }
  return { success: true, datetime, currentYear: String(year) } as const;
}

export async function listPhoneContacts(
  ctx: UsersServiceContext,
  userId: string,
) {
  await ensureUser(ctx, userId);
  await ensurePhoneChannel(ctx);
  await migrateLegacyProfilePhoneContact(ctx, userId);
  return ctx.prisma.userContact.findMany({
    where: { userId, channel: { key: 'phone' } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      value: true,
      isPrimary: true,
      verification: true,
      verifiedAt: true,
      metadata: true,
    },
  });
}

export async function addPhoneContact(
  ctx: UsersServiceContext,
  userId: string,
  payload: PhoneContactPayload,
) {
  await ensureUser(ctx, userId);
  const channel = await ensurePhoneChannel(ctx);
  const allowedDialCodes = await getSupportedPhoneDialCodes(ctx);
  const dialCode = normalizeDialCode(payload.dialCode, allowedDialCodes);
  const number = normalizePhoneNumber(payload.phone);
  const normalizedValue = composePhoneValue(dialCode, number);

  const existingCount = await ctx.prisma.userContact.count({
    where: { userId, channelId: channel.id },
  });
  const shouldBePrimary = existingCount === 0 || Boolean(payload.isPrimary);

  const existingSame = await ctx.prisma.userContact.findFirst({
    where: { userId, channelId: channel.id, value: normalizedValue },
  });

  const metadata = {
    dialCode,
    region: deriveRegionByDial(dialCode),
  } as Record<string, unknown>;

  const verificationEnabled = await isPhoneVerificationEnabled(ctx);
  const targetVerification = verificationEnabled
    ? ContactVerificationStatus.PENDING
    : ContactVerificationStatus.VERIFIED;

  if (existingSame) {
    if (shouldBePrimary) {
      await clearPrimaryContact(ctx, userId, channel.id);
    }
    const updated = await ctx.prisma.userContact.update({
      where: { id: existingSame.id },
      data: {
        isPrimary: shouldBePrimary ? true : existingSame.isPrimary,
        metadata: toJson(metadata),
        verification: targetVerification,
        verifiedAt:
          targetVerification === ContactVerificationStatus.VERIFIED
            ? (existingSame.verifiedAt ?? new Date())
            : null,
      },
      include: { channel: true },
    });
    if (verificationEnabled) {
      try {
        await sendPhoneVerificationCode(ctx, userId, normalizedValue);
      } catch (error) {
        ctx.logger.warn(`发送手机验证码失败（已忽略）: ${String(error)}`);
      }
    }
    return updated;
  }

  if (shouldBePrimary) {
    await clearPrimaryContact(ctx, userId, channel.id);
  }

  const contact = await ctx.prisma.userContact.create({
    data: {
      userId,
      channelId: channel.id,
      value: normalizedValue,
      isPrimary: shouldBePrimary,
      verification: targetVerification,
      verifiedAt:
        targetVerification === ContactVerificationStatus.VERIFIED
          ? new Date()
          : null,
      metadata: toJson(metadata),
    },
    include: { channel: true },
  });

  if (verificationEnabled) {
    try {
      await sendPhoneVerificationCode(ctx, userId, normalizedValue);
    } catch (error) {
      ctx.logger.warn(`发送手机验证码失败（已忽略）: ${String(error)}`);
    }
  }

  return contact;
}

export async function updatePhoneContact(
  ctx: UsersServiceContext,
  userId: string,
  contactId: string,
  payload: PhoneContactUpdatePayload,
) {
  await ensureUser(ctx, userId);
  const contact = await ctx.prisma.userContact.findUnique({
    where: { id: contactId },
    include: { channel: true },
  });
  if (!contact || contact.userId !== userId) {
    throw new NotFoundException('Contact not found');
  }
  if (contact.channel.key !== 'phone') {
    throw new BadRequestException('Only phone contacts can be updated');
  }

  const verificationEnabled = await isPhoneVerificationEnabled(ctx);
  const allowedDialCodes = await getSupportedPhoneDialCodes(ctx);

  const currentDial =
    extractDialFromMetadata(contact.metadata) ?? allowedDialCodes[0] ?? '+86';
  const currentNumber = contact.value.startsWith(currentDial)
    ? contact.value.slice(currentDial.length)
    : contact.value;

  const nextDial = payload.dialCode
    ? normalizeDialCode(payload.dialCode, allowedDialCodes)
    : currentDial;
  const nextNumber = payload.phone
    ? normalizePhoneNumber(payload.phone)
    : currentNumber;
  const nextValue = composePhoneValue(nextDial, nextNumber);
  const valueChanged = nextValue !== contact.value;

  if (valueChanged) {
    const duplicate = await ctx.prisma.userContact.findFirst({
      where: {
        userId,
        channel: { key: 'phone' },
        value: nextValue,
        id: { not: contactId },
      },
    });
    if (duplicate) {
      throw new BadRequestException('Phone number already exists');
    }
  }

  if (payload.isPrimary) {
    await clearPrimaryContact(ctx, userId, contact.channelId);
  }

  const metadata = {
    dialCode: nextDial,
    region: deriveRegionByDial(nextDial),
  } as Record<string, unknown>;

  const updated = await ctx.prisma.userContact.update({
    where: { id: contactId },
    data: {
      value: nextValue,
      isPrimary: payload.isPrimary ?? contact.isPrimary,
      metadata: toJson(metadata),
      verification: valueChanged
        ? verificationEnabled
          ? ContactVerificationStatus.PENDING
          : ContactVerificationStatus.VERIFIED
        : verificationEnabled
          ? contact.verification
          : ContactVerificationStatus.VERIFIED,
      verifiedAt: valueChanged
        ? verificationEnabled
          ? null
          : new Date()
        : verificationEnabled
          ? contact.verifiedAt
          : (contact.verifiedAt ?? new Date()),
    },
    include: { channel: true },
  });

  if (valueChanged && verificationEnabled) {
    try {
      await sendPhoneVerificationCode(ctx, userId, nextValue);
    } catch (error) {
      ctx.logger.warn(`发送手机验证码失败（已忽略）: ${String(error)}`);
    }
  }

  return updated;
}

export async function sendPhoneVerificationCode(
  ctx: UsersServiceContext,
  userId: string,
  phoneRaw: string,
) {
  const normalized = normalizeOptionalString(phoneRaw);
  if (!normalized) {
    throw new BadRequestException('Invalid phone number');
  }
  const verificationEnabled = await isPhoneVerificationEnabled(ctx);
  const identifier = `${ctx.phoneVerificationIdentifierPrefix}${normalized}`;
  const contacts = await ctx.prisma.userContact.findMany({
    where: { userId, value: normalized, channel: { key: 'phone' } },
  });
  if (contacts.length === 0) {
    throw new NotFoundException('Phone number not found');
  }

  if (!verificationEnabled) {
    await ctx.prisma.userContact.updateMany({
      where: { userId, value: normalized, channel: { key: 'phone' } },
      data: {
        verification: ContactVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });
    return { success: true, disabled: true } as const;
  }

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
    await tx.userContact.updateMany({
      where: { userId, value: normalized, channel: { key: 'phone' } },
      data: {
        verification: ContactVerificationStatus.PENDING,
        verifiedAt: null,
      },
    });
  });

  await deliverPhoneVerificationCode(ctx, userId, normalized, code);
  return { success: true } as const;
}

export async function verifyPhoneContact(
  ctx: UsersServiceContext,
  userId: string,
  phoneRaw: string,
  code: string,
) {
  const normalizedPhone = normalizeOptionalString(phoneRaw);
  if (!normalizedPhone) {
    throw new BadRequestException('Invalid phone number');
  }
  const identifier = `${ctx.phoneVerificationIdentifierPrefix}${normalizedPhone}`;
  const record = await ctx.prisma.verification.findFirst({
    where: { identifier, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  if (!record) {
    throw new BadRequestException('Verification code expired or invalid');
  }
  const isMatch = await bcryptCompare(code, record.value);
  if (!isMatch) {
    throw new BadRequestException('Verification code incorrect');
  }

  const contacts = await ctx.prisma.userContact.findMany({
    where: { userId, value: normalizedPhone, channel: { key: 'phone' } },
  });
  if (contacts.length === 0) {
    throw new NotFoundException('Phone contact not found');
  }

  await ctx.prisma.$transaction(async (tx) => {
    await tx.verification
      .delete({ where: { id: record.id } })
      .catch(() => undefined);
    await tx.userContact.updateMany({
      where: { userId, value: normalizedPhone, channel: { key: 'phone' } },
      data: {
        verification: ContactVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });
  });

  return { success: true } as const;
}

export async function setPrimaryPhoneContact(
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
  if (contact.channel.key !== 'phone') {
    throw new BadRequestException('Can only set phone as primary contact');
  }

  const verificationEnabled = await isPhoneVerificationEnabled(ctx);
  if (
    verificationEnabled &&
    contact.verification !== ContactVerificationStatus.VERIFIED
  ) {
    throw new BadRequestException('Phone must be verified before setting as primary');
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
  });

  return { success: true } as const;
}
