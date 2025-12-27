import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { auth } from '../../lib/shared/auth';
import { sign as jwtSign, verify as jwtVerify, JwtPayload } from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesService, DEFAULT_ROLES } from './roles.service';
import { SignInDto } from '../dto/sign-in.dto';
import { SignUpDto } from '../dto/sign-up.dto';
import { UsersService } from './users/users.service';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { generateRandomString } from 'better-auth/crypto';
import { hashPassword } from 'better-auth/crypto';
import { AuthRegisterDto } from '../dto/auth-register.dto';
import { AuthLoginDto } from '../dto/auth-login.dto';
import { AuthmeBindDto } from '../dto/authme-bind.dto';
import { AuthmeUnbindDto } from '../dto/authme-unbind.dto';
import { AuthmeService } from '../../authme/authme.service';
import { AuthmeBindingService } from '../../authme/authme-binding.service';
import {
  AuthFeatureService,
  AuthFeatureFlags,
} from '../../authme/auth-feature.service';
import { businessError } from '../../authme/authme.errors';
import { MailService } from '../../mail/mail.service';
import { ChangePasswordWithCodeDto } from '../dto/change-password-with-code.dto';
import { OAuthProvidersService } from '../../oauth/services/oauth-providers.service';
import { formatDateTimeCn } from '../../lib/shared/datetime';
import { RedisService } from '../../lib/redis/redis.service';
import { InviteService } from './invite.service';

interface AuthResponse {
  token: string | null;
  user: {
    id: string;
    email: string;
    name: string | null | undefined;
    image: string | null | undefined;
  };
  refreshToken?: string | null;
}

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

interface AuthOperationResult {
  tokens: { accessToken: string | null; refreshToken: string | null };
  user: Awaited<ReturnType<UsersService['getSessionUser']>>;
  cookies: string[];
}

interface SignUpInternalInput {
  email: string;
  password: string;
  name: string;
  rememberMe: boolean;
  minecraftId?: string;
  minecraftNick?: string;
  emailVerified?: boolean;
}

interface AccessTokenPayload extends JwtPayload {
  sub: string;
  sid: string;
  type: 'access';
}

const SESSION_USER_CACHE_TTL_MS = 30 * 1000;
const SESSION_USER_CACHE_KEY_VERSION = 'v1';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly authmeService: AuthmeService,
    private readonly authmeBindingService: AuthmeBindingService,
    private readonly authFeatureService: AuthFeatureService,
    private readonly mailService: MailService,
    private readonly oauthProvidersService: OAuthProvidersService,
    private readonly redis: RedisService,
    private readonly inviteService: InviteService,
  ) {}

  private readonly passwordCodeTtlMs = 10 * 60 * 1000;
  private readonly publicPasswordCodeIdentifierPrefix = 'password:';
  private readonly emailLoginIdentifierPrefix = 'login:';
  private readonly emailRegisterIdentifierPrefix = 'register:';
  private readonly emailVerificationIdentifierPrefix = 'email-verify:';
  private readonly maxPublicPasswordRequestsPerHour = 5; // 可后续从 config 读取
  private readonly maxEmailCodeRequestsPerHour = 5;

  async initializeDefaults() {
    await this.rolesService.ensureDefaultRolesAndPermissions();
    await this.ensureDefaultAdmin();
  }

  async register(
    dto: AuthRegisterDto,
    context: RequestContext = {},
  ): Promise<AuthOperationResult> {
    const inviteCode = await this.prepareInviteCode(dto.inviteCode);
    if (dto.mode === 'AUTHME') {
      const result = await this.registerWithAuthme(dto, context);
      if (inviteCode) {
        await this.inviteService.consumeInvite(inviteCode, result.user.id);
      }
      return result;
    }
    if (!dto.email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    const result = await this.registerWithEmail(dto, context);
    if (inviteCode) {
      await this.inviteService.consumeInvite(inviteCode, result.user.id);
    }
    return result;
  }

  async login(
    dto: AuthLoginDto,
    context: RequestContext = {},
  ): Promise<AuthOperationResult> {
    if (dto.mode === 'EMAIL_CODE') {
      return this.loginWithEmailCode(dto, context);
    }
    if (dto.mode === 'AUTHME') {
      return this.loginWithAuthme(dto, context);
    }
    if (!dto.email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    return this.loginWithEmail(dto, context);
  }

  async signUp(dto: SignUpDto, context: RequestContext = {}) {
    return this.register(
      {
        mode: 'EMAIL',
        email: dto.email,
        password: dto.password,
        name: dto.name,
        minecraftId: dto.minecraftId,
        minecraftNick: dto.minecraftNick,
        rememberMe: dto.rememberMe,
      },
      context,
    );
  }

  async signIn(dto: SignInDto, context: RequestContext = {}) {
    return this.login(
      {
        mode: 'EMAIL',
        email: dto.email,
        password: dto.password,
        rememberMe: dto.rememberMe,
      },
      context,
    );
  }

  async refresh(dto: RefreshTokenDto) {
    const session = await this.prisma.session.findUnique({
      where: { token: dto.refreshToken },
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    await this.renewSessionExpiry(session);

    const user = await this.usersService.getSessionUser(session.userId);
    const tokens = this.buildTokenPair(session.token, session.userId);

    return {
      tokens,
      user,
      cookies: [],
    };
  }

  async signOut(token: string) {
    await this.prisma.session
      .delete({ where: { token } })
      .catch(() => undefined);
    return { success: true };
  }

  async getSession(accessToken: string, options: { skipTouch?: boolean } = {}) {
    const skipTouch = options.skipTouch ?? false;
    const payload = this.verifyAccessToken(accessToken);
    const session = await this.prisma.session.findUnique({
      where: { token: payload.sid },
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      if (session) {
        await this.prisma.session
          .delete({ where: { id: session.id } })
          .catch(() => undefined);
      }
      throw new UnauthorizedException('Invalid session');
    }

    if (!skipTouch) {
      await this.maybeExtendActiveSession(session);
    }

    const cacheKey = this.buildSessionUserCacheKey(session.token);
    const cached =
      await this.redis.get<Awaited<ReturnType<UsersService['getSessionUser']>>>(
        cacheKey,
      );
    if (cached) {
      return { user: cached, sessionToken: session.token };
    }
    const user = await this.usersService.getSessionUser(session.userId, {
      allowFallback: false,
    });
    await this.redis.set(cacheKey, user, SESSION_USER_CACHE_TTL_MS);
    return { user, sessionToken: session.token };
  }

  async bindAuthme(
    userId: string,
    dto: AuthmeBindDto,
    context: RequestContext = {},
  ) {
    const flags = await this.authFeatureService.getFlags();
    if (!flags.authmeBindingEnabled) {
      throw new BadRequestException(
        'AuthMe binding is not enabled in current environment',
      );
    }
    const account = await this.authmeService.verifyCredentials(
      dto.authmeId,
      dto.password,
    );
    await this.authmeBindingService.bindUser({
      userId,
      authmeUser: account,
      operatorUserId: userId,
      sourceIp: context.ip ?? null,
    });
    const user = await this.usersService.getSessionUser(userId);
    return { user };
  }

  async unbindAuthme(
    userId: string,
    dto: AuthmeUnbindDto,
    context: RequestContext = {},
  ) {
    const flags = await this.authFeatureService.getFlags();
    if (!flags.authmeBindingEnabled) {
      throw new BadRequestException(
        'AuthMe binding is not enabled in current environment',
      );
    }
    const bindings =
      await this.authmeBindingService.listBindingsByUserId(userId);
    if (!bindings || bindings.length === 0) {
      throw new BadRequestException('No AuthMe bindings available to unbind');
    }

    const requested = dto.username?.trim();
    const targetUsername = this.resolveTargetBindingUsername(
      bindings,
      requested,
    );

    const account = await this.authmeService.verifyCredentials(
      targetUsername,
      dto.password,
    );
    const usernameLower = account.username.toLowerCase();
    const binding = bindings.find(
      (entry) => entry.authmeUsernameLower === usernameLower,
    );
    if (!binding || binding.userId !== userId) {
      throw new BadRequestException(
        'The specified AuthMe account is not bound to current user',
      );
    }

    await this.authmeBindingService.unbindUser({
      userId,
      usernameLower,
      operatorUserId: userId,
      sourceIp: context.ip ?? null,
    });
    const user = await this.usersService.getSessionUser(userId);
    return { user };
  }

  async setPrimaryAuthmeBinding(
    userId: string,
    bindingId: string,
    actorId?: string,
  ) {
    await this.usersService.setPrimaryAuthmeBinding(
      userId,
      bindingId,
      actorId ?? userId,
    );
    const user = await this.usersService.getSessionUser(userId);
    return { user };
  }

  async getFeatureFlags(): Promise<AuthFeatureFlags> {
    const [flags, providers, inviteRequired] = await Promise.all([
      this.authFeatureService.getFlags(),
      this.oauthProvidersService.listProviders(),
      this.inviteService.getInviteRequired(),
    ]);
    return {
      ...flags,
      inviteRequired,
      oauthProviders: providers
        .filter((provider) => provider.enabled)
        .map((provider) => ({
          key: provider.key,
          name: provider.name,
          type: provider.type,
          hasClientSecret: provider.settings.hasClientSecret,
        })),
    };
  }

  async requestPasswordChangeCode(
    userId: string,
    context: RequestContext = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user || !user.email) {
      throw new BadRequestException('Current account has no email configured');
    }

    const identifier = this.buildPasswordCodeIdentifier(user.email);
    const code = generateRandomString(6, '0-9');
    const hashed = await bcryptHash(code, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.verification.deleteMany({ where: { identifier } });
      await tx.verification.create({
        data: {
          identifier,
          value: hashed,
          expiresAt: new Date(Date.now() + this.passwordCodeTtlMs),
        },
      });
    });

    const displayName = user.name ?? user.email;
    const ipHint = context.ip ? `（IP：${context.ip}）` : '';
    const subject = 'Hydroline 密码安全验证码';
    const plainText = `您好 ${displayName}，\n\n您的密码安全验证码为 ${code}，有效期 10 分钟${ipHint}。如非本人操作，请忽略本邮件。\n\nHydroline（氢气工艺）敬上`;
    const now = new Date();
    const datetime = formatDateTimeCn(now);
    const currentYear = now.getFullYear();

    await this.mailService.sendMail({
      to: user.email,
      subject,
      text: plainText,
      template: 'password-code',
      context: {
        displayName,
        code,
        ipHint,
        datetime,
        currentYear: String(currentYear),
        plaintext: plainText,
        operation: '密码修改验证',
      },
    });

    return { success: true } as const;
  }

  async updatePasswordWithCode(userId: string, dto: ChangePasswordWithCodeDto) {
    if (dto.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user || !user.email) {
      throw new BadRequestException('Current account has no email configured');
    }

    const identifier = this.buildPasswordCodeIdentifier(user.email);
    const record = await this.prisma.verification.findFirst({
      where: {
        identifier,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('Verification code expired or invalid');
    }

    const isMatch = await bcryptCompare(dto.code, record.value);
    if (!isMatch) {
      throw new BadRequestException('Verification code incorrect');
    }

    await this.prisma.verification
      .delete({ where: { id: record.id } })
      .catch(() => undefined);

    await this.usersService.updateOwnPassword(userId, dto.password);
    const userPayload = await this.usersService.getSessionUser(userId);
    return { user: userPayload };
  }

  // ================= 公共邮箱验证码（登录 / 注册） =================
  async requestEmailLoginCode(emailRaw: string, context: RequestContext = {}) {
    const email = this.normalizeEmail(emailRaw);
    if (!email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    const user = await this.findUserByAnyEmail(email);
    if (!user) {
      return { success: true } as const;
    }
    await this.createEmailVerificationCode({
      identifier: this.buildLoginCodeIdentifier(email),
      email,
      displayName: user.name ?? email,
      subject: 'Hydroline 登录验证码',
      operation: '邮箱登录验证',
      context,
    });
    return { success: true } as const;
  }

  async requestEmailRegisterCode(
    emailRaw: string,
    context: RequestContext = {},
  ) {
    const email = this.normalizeEmail(emailRaw);
    if (!email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    const existing = await this.findUserByAnyEmail(email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    await this.createEmailVerificationCode({
      identifier: this.buildRegisterCodeIdentifier(email),
      email,
      displayName: email,
      subject: 'Hydroline 注册验证码',
      operation: '注册邮箱验证',
      context,
    });
    return { success: true } as const;
  }

  private async verifyEmailCode(identifier: string, codeRaw: string) {
    const code = codeRaw.trim();
    if (!code) {
      throw new BadRequestException('Verification code is required');
    }
    const record = await this.prisma.verification.findFirst({
      where: { identifier, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    if (!record) {
      throw new UnauthorizedException('Verification code expired or invalid');
    }
    const isMatch = await bcryptCompare(code, record.value);
    if (!isMatch) {
      throw new UnauthorizedException('Verification code expired or invalid');
    }
    await this.prisma.verification
      .delete({ where: { id: record.id } })
      .catch(() => undefined);
  }

  private async createEmailVerificationCode(options: {
    identifier: string;
    email: string;
    displayName: string;
    subject: string;
    operation: string;
    context: RequestContext;
  }) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.prisma.verification.count({
      where: { identifier: options.identifier, createdAt: { gt: oneHourAgo } },
    });
    if (recentCount >= this.maxEmailCodeRequestsPerHour) {
      return false;
    }

    const code = generateRandomString(6, '0-9');
    const hashed = await bcryptHash(code, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.verification.deleteMany({
        where: { identifier: options.identifier },
      });
      await tx.verification.create({
        data: {
          identifier: options.identifier,
          value: hashed,
          expiresAt: new Date(Date.now() + this.passwordCodeTtlMs),
        },
      });
    });

    const ipHint = options.context.ip ? `（IP：${options.context.ip}）` : '';
    const now = new Date();
    const datetime = formatDateTimeCn(now);
    const currentYear = now.getFullYear();
    const plainText = `您好 ${options.displayName}，\n\n您的${options.operation}验证码为 ${code}，有效期 10 分钟${ipHint}。如非本人操作，请忽略本邮件。\n\nHydroline（氢气工艺）敬上`;

    try {
      await this.mailService.sendMail({
        to: options.email,
        subject: options.subject,
        text: plainText,
        template: 'password-code',
        context: {
          displayName: options.displayName,
          code,
          ipHint,
          datetime,
          currentYear: String(currentYear),
          plaintext: plainText,
          operation: options.operation,
        },
      });
    } catch {
      // 忽略邮件发送失败，前端统一提示
    }

    return true;
  }

  // ================= 未登录场景：找回密码（统一 success 防止枚举） =================
  async requestPublicPasswordCode(
    emailRaw: string,
    context: RequestContext = {},
  ) {
    const email = this.normalizeEmail(emailRaw);
    if (!email) {
      // 统一返回成功，防止枚举邮箱
      return { success: true } as const;
    }

    const user = await this.findUserByAnyEmail(email);
    if (!user) {
      return { success: true } as const; // 不泄露是否存在
    }

    // 简单频控：近一小时内生成次数
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const identifier = this.buildPasswordCodeIdentifier(email);
    const recentCount = await this.prisma.verification.count({
      where: { identifier, createdAt: { gt: oneHourAgo } },
    });
    if (recentCount >= this.maxPublicPasswordRequestsPerHour) {
      // 仍返回 success，但不再发送邮件，可在日志中记录
      return { success: true } as const;
    }

    const code = generateRandomString(6, '0-9');
    const hashed = await bcryptHash(code, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.verification.deleteMany({ where: { identifier } });
      await tx.verification.create({
        data: {
          identifier,
          value: hashed,
          expiresAt: new Date(Date.now() + this.passwordCodeTtlMs),
        },
      });
    });

    const displayName = user.name ?? email;
    const ipHint = context.ip ? `（IP：${context.ip}）` : '';
    const subject = 'Hydroline 密码重置验证码';
    const plainText = `您好 ${displayName}，\n\n您的密码重置验证码为 ${code}，有效期 10 分钟${ipHint}。如非本人操作，请忽略。\n\nHydroline（氢气工艺）敬上`;
    const now = new Date();
    const datetime = formatDateTimeCn(now);
    const currentYear = now.getFullYear();

    try {
      await this.mailService.sendMail({
        to: email,
        subject,
        text: plainText,
        template: 'password-code',
        context: {
          displayName,
          code,
          ipHint,
          datetime,
          currentYear: String(currentYear),
          plaintext: plainText,
          operation: '密码重置',
        },
      });
    } catch {
      // 发送失败不影响统一返回 success
    }
    return { success: true } as const;
  }

  async confirmPublicPasswordReset(dto: {
    email: string;
    code: string;
    password: string;
  }) {
    const email = this.normalizeEmail(dto.email);
    if (!email) {
      return { success: false, error: 'INVALID_EMAIL' } as const;
    }
    if (dto.password.length < 8) {
      return { success: false, error: 'PASSWORD_TOO_SHORT' } as const;
    }
    const user = await this.findUserByAnyEmail(email);
    if (!user) {
      return { success: false, error: 'INVALID_CODE_OR_EMAIL' } as const;
    }
    const identifier = this.buildPasswordCodeIdentifier(email);
    const record = await this.prisma.verification.findFirst({
      where: { identifier, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    if (!record) {
      return { success: false, error: 'INVALID_CODE_OR_EMAIL' } as const;
    }
    const isMatch = await bcryptCompare(dto.code, record.value);
    if (!isMatch) {
      return { success: false, error: 'INVALID_CODE_OR_EMAIL' } as const;
    }
    await this.prisma.verification
      .delete({ where: { id: record.id } })
      .catch(() => undefined);
    await this.usersService.updateOwnPassword(user.id, dto.password);
    return { success: true } as const;
  }

  // ================= 多邮箱查找支持（主 + 副） =================
  private async findUserByAnyEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (user) return user;
    const contact = await this.prisma.userContact.findFirst({
      where: { value: email, channel: { key: 'email' } },
      select: {
        userId: true,
        value: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (contact && contact.user) {
      return {
        id: contact.user.id,
        email: contact.user.email ?? email,
        name: contact.user.name,
      };
    }
    return null;
  }

  private async registerWithEmail(
    dto: AuthRegisterDto,
    context: RequestContext,
  ) {
    if (dto.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }
    const email = this.normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    const code = (dto.code ?? '').trim();
    if (!code) {
      throw new BadRequestException('Verification code is required');
    }
    await this.verifyEmailCode(this.buildRegisterCodeIdentifier(email), code);
    const result = await this.signUpInternal(
      {
        email,
        password: dto.password,
        name: dto.name ?? email,
        rememberMe: dto.rememberMe ?? false,
        minecraftId: dto.minecraftId,
        minecraftNick: dto.minecraftNick,
        emailVerified: true,
      },
      context,
    );

    await this.prisma.user.update({
      where: { id: result.user.id },
      data: {
        passwordNeedsReset: false,
        passwordUpdatedAt: new Date(),
      } as Prisma.UserUpdateInput,
    });

    const user = await this.usersService.getSessionUser(result.user.id);
    return { ...result, user } satisfies AuthOperationResult;
  }

  private async registerWithAuthme(
    dto: AuthRegisterDto,
    context: RequestContext,
  ) {
    const flags = await this.authFeatureService.getFlags();
    if (!flags.authmeRegisterEnabled) {
      throw new BadRequestException('AuthMe registration is not enabled');
    }
    if (!dto.authmeId) {
      throw new BadRequestException('AuthMe account ID is required');
    }
    const authmeId = dto.authmeId.trim();
    if (!authmeId) {
      throw new BadRequestException('AuthMe account ID is required');
    }
    const authmeAccount = await this.authmeService.verifyCredentials(
      authmeId,
      dto.password,
    );
    const email = this.normalizeEmail(dto.email);
    if (!email) {
      throw businessError({
        type: 'BUSINESS_VALIDATION_FAILED',
        code: 'AUTHME_EMAIL_REQUIRED',
        safeMessage: '请填写邮箱地址',
      });
    }
    const code = (dto.code ?? '').trim();
    if (!code) {
      throw new BadRequestException('Verification code is required');
    }
    await this.verifyEmailCode(this.buildRegisterCodeIdentifier(email), code);
    const usernameLower = authmeAccount.username.toLowerCase();
    const existingBinding =
      await this.authmeBindingService.getBindingByUsernameLower(usernameLower);
    if (existingBinding) {
      throw businessError({
        type: 'BUSINESS_VALIDATION_FAILED',
        code: 'BINDING_CONFLICT',
        safeMessage: '该 AuthMe 账号已绑定其他用户，请先解绑',
      });
    }

    const result = await this.signUpInternal(
      {
        email,
        password: generateRandomString(48),
        name: authmeAccount.realname || authmeAccount.username,
        rememberMe: dto.rememberMe ?? false,
        emailVerified: true,
      },
      context,
    );

    await this.prisma.user.update({
      where: { id: result.user.id },
      data: {
        passwordNeedsReset: true,
        passwordUpdatedAt: null,
      } as Prisma.UserUpdateInput,
    });

    await this.authmeBindingService.bindUser({
      userId: result.user.id,
      authmeUser: authmeAccount,
      operatorUserId: result.user.id,
      sourceIp: context.ip ?? null,
    });

    const user = await this.usersService.getSessionUser(result.user.id);
    return { ...result, user } satisfies AuthOperationResult;
  }

  private async prepareInviteCode(rawInviteCode?: string) {
    const inviteRequired = await this.inviteService.getInviteRequired();
    const trimmed = (rawInviteCode ?? '').trim();
    if (!trimmed) {
      if (inviteRequired) {
        throw new BadRequestException('Invitation code is required');
      }
      return null;
    }
    await this.inviteService.assertInviteAvailable(trimmed);
    return this.inviteService.normalizeInviteCode(trimmed);
  }

  private normalizeEmail(email: string | null | undefined) {
    if (typeof email !== 'string') {
      return null;
    }
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      return null;
    }
    return trimmed;
  }

  private buildPasswordCodeIdentifier(email: string) {
    return `password:${email.toLowerCase()}`;
  }

  private buildLoginCodeIdentifier(email: string) {
    return `${this.emailLoginIdentifierPrefix}${email.toLowerCase()}`;
  }

  private buildRegisterCodeIdentifier(email: string) {
    return `${this.emailRegisterIdentifierPrefix}${email.toLowerCase()}`;
  }

  private async loginWithEmailCode(dto: AuthLoginDto, context: RequestContext) {
    const email = this.normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    const code = (dto.code ?? '').trim();
    if (!code) {
      throw new BadRequestException('Verification code is required');
    }

    const user = await this.findUserByAnyEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or verification code');
    }

    await this.verifyEmailCode(this.buildLoginCodeIdentifier(email), code);

    await this.prisma.user
      .update({
        where: { id: user.id },
        data: { emailVerified: true },
      })
      .catch(() => undefined);

    return this.createSessionForUser(user.id, dto.rememberMe ?? false, context);
  }

  private async loginWithEmail(dto: AuthLoginDto, context: RequestContext) {
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }
    const email = this.normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    const result = await this.signInInternal({
      email,
      password: dto.password,
      rememberMe: dto.rememberMe ?? false,
    });

    const userId = result.user.id;
    await this.updateSessionMetadata(result.tokens.refreshToken, context);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: context.ip ?? null,
      },
    });

    const user = await this.usersService.getSessionUser(userId);
    return {
      ...result,
      user,
    } satisfies AuthOperationResult;
  }

  private async loginWithAuthme(dto: AuthLoginDto, context: RequestContext) {
    const flags = await this.authFeatureService.getFlags();
    if (!flags.authmeLoginEnabled) {
      throw new BadRequestException('AuthMe login is not enabled');
    }
    if (!dto.authmeId) {
      throw new BadRequestException('AuthMe account ID is required');
    }
    if (!dto.password) {
      throw new BadRequestException('Password is required');
    }

    const authmeAccount = await this.authmeService.verifyCredentials(
      dto.authmeId,
      dto.password,
    );
    const binding = await this.authmeBindingService.getBindingByUsernameLower(
      authmeAccount.username.toLowerCase(),
    );
    if (!binding) {
      throw businessError({
        type: 'BUSINESS_VALIDATION_FAILED',
        code: 'AUTHME_NOT_BOUND',
        safeMessage: '该 AuthMe 账号尚未绑定 Hydroline 用户，请先完成绑定',
      });
    }
    return this.createSessionForUser(
      binding.userId,
      dto.rememberMe ?? false,
      context,
    );
  }

  private async signUpInternal(
    input: SignUpInternalInput,
    context: RequestContext,
  ): Promise<AuthOperationResult> {
    const headers = new Headers();
    const result = await auth.api
      .signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name,
          rememberMe: input.rememberMe,
        },
        headers,
        returnHeaders: true,
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Failed to sign up';
        throw new BadRequestException(message);
      });

    const payload = result.response as AuthResponse;
    if (!payload.user?.id) {
      throw new BadRequestException('Failed to create user');
    }

    await this.usersService.initializeUserRecords(payload.user.id, {
      displayName: input.name ?? input.email,
      minecraftId: input.minecraftId,
      minecraftNick: input.minecraftNick,
    });
    await this.assignDefaultRole(payload.user.id);

    const { tokens, cookies } = this.extractTokens(result, payload.user.id);
    await this.updateSessionMetadata(tokens.refreshToken, context);
    await this.prisma.user.update({
      where: { id: payload.user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: context.ip ?? null,
        ...(input.emailVerified !== undefined
          ? { emailVerified: input.emailVerified }
          : {}),
      },
    });
    const fullUser = await this.usersService.getSessionUser(payload.user.id);

    return {
      tokens,
      user: fullUser,
      cookies,
    };
  }

  private async signInInternal(input: {
    email: string;
    password: string;
    rememberMe: boolean;
  }): Promise<AuthOperationResult> {
    const headers = new Headers();
    const result = await auth.api
      .signInEmail({
        body: {
          email: input.email,
          password: input.password,
          rememberMe: input.rememberMe,
        },
        headers,
        returnHeaders: true,
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Invalid credentials';
        throw new UnauthorizedException(message);
      });

    const payload = result.response as AuthResponse;
    if (!payload.user?.id) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const { tokens, cookies } = this.extractTokens(result, payload.user.id);
    const user = await this.usersService.getSessionUser(payload.user.id);

    return {
      tokens,
      user,
      cookies,
    };
  }

  async createOauthUser(
    input: { email: string; name?: string; rememberMe?: boolean },
    context: RequestContext,
  ) {
    const email = this.normalizeEmail(input.email);
    if (!email) {
      throw new BadRequestException('Email address cannot be empty');
    }
    return this.signUpInternal(
      {
        email,
        password: generateRandomString(64),
        name: input.name ?? email,
        rememberMe: input.rememberMe ?? true,
        emailVerified: true,
      },
      context,
    );
  }

  public async createSessionForUser(
    userId: string,
    rememberMe: boolean,
    context: RequestContext,
  ): Promise<AuthOperationResult> {
    const token = generateRandomString(64, 'a-z', 'A-Z', '0-9');
    const ttl = rememberMe ? this.sessionTtlMs * 2 : this.sessionTtlMs;
    await this.prisma.session.create({
      data: {
        token,
        userId,
        expiresAt: new Date(Date.now() + ttl),
        ipAddress: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    // Update user's last login information
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: context.ip ?? null,
      },
    });
    const user = await this.usersService.getSessionUser(userId);
    const tokens = this.buildTokenPair(token, userId);
    return {
      tokens,
      user,
      cookies: [],
    };
  }

  private async updateSessionMetadata(
    token: string | null | undefined,
    context: RequestContext,
  ): Promise<void> {
    if (!token) {
      return;
    }
    await this.prisma.session.updateMany({
      where: { token },
      data: {
        ipAddress: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  }

  private extractTokens(
    result: { headers: Headers; response: AuthResponse },
    userId: string,
  ) {
    const cookies = this.collectCookies(result.headers);
    const cookieMap = this.parseCookieMap(cookies);
    const sessionToken =
      cookieMap.get('refresh_token') ??
      cookieMap.get('session_token') ??
      result.response.token ??
      null;

    if (!sessionToken) {
      throw new UnauthorizedException('Failed to obtain session token');
    }

    return {
      tokens: this.buildTokenPair(sessionToken, userId),
      cookies,
    };
  }

  private collectCookies(headers: Headers) {
    const setCookie = headers.get('set-cookie');
    if (!setCookie) {
      return [];
    }
    return this.splitSetCookie(setCookie);
  }

  private parseCookieMap(cookies: string[]) {
    const map = new Map<string, string>();
    for (const cookie of cookies) {
      const [rawName, ...rest] = cookie.split('=');
      if (!rawName || rest.length === 0) {
        continue;
      }
      const name = rawName.trim().toLowerCase();
      const value = rest.join('=').split(';')[0];
      const normalizedKey = this.normalizeCookieKey(name);
      if (normalizedKey) {
        map.set(normalizedKey, value);
      }
    }
    return map;
  }

  private normalizeCookieKey(name: string) {
    if (name.endsWith('.session_token')) {
      return 'session_token';
    }
    if (name.endsWith('.session_data')) {
      return 'session_data';
    }
    if (name.endsWith('.refresh_token')) {
      return 'refresh_token';
    }
    if (name.endsWith('.dont_remember')) {
      return 'dont_remember';
    }
    return undefined;
  }

  private splitSetCookie(header: string) {
    const cookies: string[] = [];
    let current = '';
    let insideExpires = false;

    for (let i = 0; i < header.length; i += 1) {
      const char = header[i];
      if (char === ',') {
        if (!insideExpires) {
          cookies.push(current.trim());
          current = '';
          continue;
        }
      }

      current += char;

      if (!insideExpires && current.trim().toLowerCase().endsWith('expires=')) {
        insideExpires = true;
      }

      if (insideExpires && char === ';') {
        insideExpires = false;
      }
    }

    if (current.trim()) {
      cookies.push(current.trim());
    }

    return cookies.filter(Boolean);
  }

  private get sessionTtlMs() {
    const expiresIn = auth.options.session?.expiresIn ?? 60 * 60 * 24 * 7;
    return expiresIn * 1000;
  }

  private get sessionUpdateAgeMs() {
    const updateAge = auth.options.session?.updateAge ?? 0;
    if (!updateAge || updateAge <= 0) {
      return 0;
    }
    return updateAge * 1000;
  }

  private getSessionLifetimeMs(session: { createdAt: Date; expiresAt: Date }) {
    const lifetime = session.expiresAt.getTime() - session.createdAt.getTime();
    if (Number.isFinite(lifetime) && lifetime > 0) {
      return lifetime;
    }
    return this.sessionTtlMs;
  }

  private async renewSessionExpiry(session: {
    id: string;
    createdAt: Date;
    expiresAt: Date;
  }) {
    const lifetime = this.getSessionLifetimeMs(session);
    const newExpires = new Date(Date.now() + lifetime);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpires },
    });
    return newExpires;
  }

  private async maybeExtendActiveSession(session: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
  }) {
    const updateAge = this.sessionUpdateAgeMs;
    if (updateAge <= 0) {
      return;
    }
    const lastUpdated = session.updatedAt ?? session.createdAt;
    if (Date.now() - lastUpdated.getTime() < updateAge) {
      return;
    }
    await this.renewSessionExpiry(session);
  }

  private get accessTokenSecret() {
    return (
      process.env.ACCESS_TOKEN_SECRET ||
      process.env.BETTER_AUTH_SECRET ||
      auth.options.secret ||
      'hydroline-access-secret'
    );
  }

  private get accessTokenExpiresInSeconds() {
    const raw = process.env.ACCESS_TOKEN_EXPIRES_IN;
    const parsed = raw ? Number(raw) : 15 * 60;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 15 * 60;
  }

  private signAccessToken(userId: string, sessionToken: string) {
    return jwtSign(
      {
        sub: userId,
        sid: sessionToken,
        type: 'access',
      },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiresInSeconds,
      },
    );
  }

  private buildTokenPair(sessionToken: string | null, userId: string) {
    if (!sessionToken) {
      return {
        accessToken: null,
        refreshToken: null,
      } as const;
    }
    return {
      accessToken: this.signAccessToken(userId, sessionToken),
      refreshToken: sessionToken,
    } as const;
  }

  private buildSessionUserCacheKey(sessionToken: string) {
    return `auth:session-user:${SESSION_USER_CACHE_KEY_VERSION}:${sessionToken}`;
  }

  private verifyAccessToken(accessToken: string): AccessTokenPayload {
    try {
      const payload = jwtVerify(
        accessToken,
        this.accessTokenSecret,
      ) as AccessTokenPayload;
      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }
      if (typeof payload.sid !== 'string' || payload.sid.length === 0) {
        throw new Error('Missing session reference');
      }
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('Missing subject');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
  }

  async listUserSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeUserSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    await this.prisma.session.delete({ where: { id: sessionId } });
    return session;
  }

  private async ensureDefaultAdmin() {
    // First check if Administrator role already has any users
    const adminRole = await this.prisma.role.findUnique({
      where: { key: DEFAULT_ROLES.ADMIN },
      include: { userRoles: { select: { id: true } } },
    });

    if (adminRole && adminRole.userRoles.length > 0) {
      // Administrator role already has users, no need to do anything
      return;
    }

    const adminEmail = 'admin@hydcraft.local';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123456';
    let admin = await this.prisma.user.findUnique({
      where: { email: adminEmail },
      include: { accounts: true },
    });

    if (!admin) {
      const headers = new Headers();
      const result = await auth.api.signUpEmail({
        body: {
          email: adminEmail,
          password,
          name: 'Administrator',
          rememberMe: false,
        },
        headers,
        returnHeaders: true,
      });

      const payload = result.response as AuthResponse;
      if (!payload.user?.id) {
        throw new BadRequestException('Failed to bootstrap admin user');
      }

      admin = await this.prisma.user.findUnique({
        where: { id: payload.user.id },
        include: { accounts: true },
      });

      if (!admin) {
        throw new BadRequestException('Failed to bootstrap admin user');
      }
    }

    const credentialAccount = admin.accounts.find(
      (account) =>
        account.provider === 'credential' ||
        account.providerId === 'credential',
    );

    if (!credentialAccount) {
      const hashedPassword = await hashPassword(password);
      const accountIdentifier = generateRandomString(32, 'a-z', 'A-Z', '0-9');
      await this.prisma.account.create({
        data: {
          userId: admin.id,
          accountId: accountIdentifier,
          type: 'credential',
          provider: 'credential',
          providerId: 'credential',
          providerAccountId: accountIdentifier,
          password: hashedPassword,
        },
      });
    } else if (!credentialAccount.password) {
      const hashedPassword = await hashPassword(password);
      await this.prisma.account.update({
        where: { id: credentialAccount.id },
        data: { password: hashedPassword },
      });
    }

    await this.usersService.initializeUserRecords(admin.id, {
      displayName: admin.name ?? 'Administrator',
    });
    await this.assignDefaultRole(admin.id, DEFAULT_ROLES.ADMIN);
  }

  // Persist latest IP/User-Agent for the session identified by token
  async touchSession(token: string, context: RequestContext): Promise<void> {
    if (!token) return;
    await this.prisma.session.updateMany({
      where: { token },
      data: {
        ipAddress: context.ip ?? undefined,
        userAgent: context.userAgent ?? undefined,
      },
    });
    // If user's last login info is missing, backfill it using this request
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (!session) return;
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { lastLoginAt: true },
    });
    if (!user?.lastLoginAt) {
      await this.prisma.user.update({
        where: { id: session.userId },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: context.ip ?? session.ipAddress ?? null,
        },
      });
    }
  }

  // Allow client to identify device; stores a friendly string into userAgent
  async identifySession(
    token: string,
    body: { deviceName?: string | null; devicePlatform?: string | null },
    context: RequestContext = {},
  ) {
    if (!token) return { success: false } as const;
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (!session) return { success: false } as const;
    const friendly = [body.deviceName, body.devicePlatform]
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .join(' / ');
    const mergedUA = friendly
      ? `${friendly}${context.userAgent ? ` | ${context.userAgent}` : ''}`
      : (context.userAgent ?? session.userAgent ?? null);
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        userAgent: mergedUA ?? undefined,
        ipAddress: context.ip ?? session.ipAddress ?? undefined,
      },
    });
    return { success: true } as const;
  }

  private async assignDefaultRole(
    userId: string,
    roleKey: string = DEFAULT_ROLES.PLAYER,
  ) {
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      return;
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId,
        roleId: role.id,
      },
    });
  }

  private resolveTargetBindingUsername(
    bindings: Array<{ authmeUsername: string; authmeUsernameLower: string }>,
    requested?: string | null,
  ): string {
    if (requested && requested.trim().length > 0) {
      return requested.trim();
    }
    if (bindings.length === 1) {
      return bindings[0].authmeUsername;
    }
    throw new BadRequestException(
      'Must specify which AuthMe account to unbind',
    );
  }
}
