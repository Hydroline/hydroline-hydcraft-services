import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { auth } from '../../lib/shared/auth';
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
import { AuthmeService } from '../authme/authme.service';
import { AuthmeBindingService } from '../authme/authme-binding.service';
import {
  AuthFeatureService,
  AuthFeatureFlags,
} from '../authme/auth-feature.service';
import { businessError } from '../authme/authme.errors';
import { MailService } from '../../mail/mail.service';
import { ChangePasswordWithCodeDto } from '../dto/change-password-with-code.dto';

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
}

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
  ) {}

  private readonly passwordCodeTtlMs = 10 * 60 * 1000;
  private readonly publicPasswordCodeIdentifierPrefix = 'password:';
  private readonly emailVerificationIdentifierPrefix = 'email-verify:';
  private readonly maxPublicPasswordRequestsPerHour = 5; // 可后续从 config 读取

  async initializeDefaults() {
    await this.rolesService.ensureDefaultRolesAndPermissions();
    await this.ensureDefaultAdmin();
  }

  async register(
    dto: AuthRegisterDto,
    context: RequestContext = {},
  ): Promise<AuthOperationResult> {
    if (dto.mode === 'AUTHME') {
      return this.registerWithAuthme(dto, context);
    }
    if (!dto.email) {
      throw new BadRequestException('邮箱地址不能为空');
    }
    return this.registerWithEmail(dto, context);
  }

  async login(
    dto: AuthLoginDto,
    context: RequestContext = {},
  ): Promise<AuthOperationResult> {
    if (dto.mode === 'AUTHME') {
      return this.loginWithAuthme(dto, context);
    }
    if (!dto.email) {
      throw new BadRequestException('邮箱地址不能为空');
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

    const newExpires = new Date(Date.now() + this.sessionTtlMs);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpires },
    });

    const user = await this.usersService.getSessionUser(session.userId);
    const tokens = {
      accessToken: dto.refreshToken,
      refreshToken: dto.refreshToken,
      cookies: [] as string[],
    };

    return {
      tokens,
      user,
      cookies: tokens.cookies,
    };
  }

  async signOut(token: string) {
    await this.prisma.session
      .delete({ where: { token } })
      .catch(() => undefined);
    return { success: true };
  }

  async getSession(token: string) {
    const session = await this.prisma.session.findUnique({ where: { token } });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      if (session) {
        await this.prisma.session
          .delete({ where: { id: session.id } })
          .catch(() => undefined);
      }
      throw new UnauthorizedException('Invalid session');
    }

    const user = await this.usersService.getSessionUser(session.userId);
    return { user, sessionToken: token };
  }

  async bindAuthme(
    userId: string,
    dto: AuthmeBindDto,
    context: RequestContext = {},
  ) {
    const flags = await this.authFeatureService.getFlags();
    if (!flags.authmeBindingEnabled) {
      throw new BadRequestException('当前环境未启用 AuthMe 绑定');
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
      throw new BadRequestException('当前环境未启用 AuthMe 绑定');
    }
    const bindings =
      await this.authmeBindingService.listBindingsByUserId(userId);
    if (!bindings || bindings.length === 0) {
      throw new BadRequestException('当前账户没有可以解除的 AuthMe 绑定');
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
      throw new BadRequestException('指定的 AuthMe 账号未绑定到当前用户');
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
    return this.authFeatureService.getFlags();
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
      throw new BadRequestException('当前账户尚未配置邮箱');
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
    const plainText = `您好 ${displayName}，\n\n您的密码安全验证码为 ${code}，有效期 10 分钟${ipHint}。如非本人操作，请忽略本邮件。\n\nHydroline 安全中心`;
    const htmlContent = `
      <p>您好 ${displayName}：</p>
      <p>您的密码安全验证码为 <strong>${code}</strong>，有效期 10 分钟${ipHint ? `，${ipHint}` : ''}。</p>
      <p>如非本人操作，请忽略本邮件。</p>
      <p>Hydroline 安全中心</p>
    `;

    await this.mailService.sendMail({
      to: user.email,
      subject,
      text: plainText,
      html: htmlContent,
    });

    return { success: true } as const;
  }

  async updatePasswordWithCode(userId: string, dto: ChangePasswordWithCodeDto) {
    if (dto.password.length < 8) {
      throw new BadRequestException('密码长度至少 8 位');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user || !user.email) {
      throw new BadRequestException('当前账户尚未配置邮箱');
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
      throw new BadRequestException('验证码无效或已过期');
    }

    const isMatch = await bcryptCompare(dto.code, record.value);
    if (!isMatch) {
      throw new BadRequestException('验证码不正确');
    }

    await this.prisma.verification
      .delete({ where: { id: record.id } })
      .catch(() => undefined);

    await this.usersService.updateOwnPassword(userId, dto.password);
    const userPayload = await this.usersService.getSessionUser(userId);
    return { user: userPayload };
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
    const plainText = `您好 ${displayName}，\n\n您的密码重置验证码为 ${code}，有效期 10 分钟${ipHint}。如非本人操作，请忽略。\n\nHydroline 安全中心`;
    const htmlContent = `\n      <p>您好 ${displayName}：</p>\n      <p>您的密码重置验证码为 <strong>${code}</strong>，有效期 10 分钟${ipHint ? `，${ipHint}` : ''}。</p>\n      <p>如非本人操作，请忽略本邮件。</p>\n      <p>Hydroline 安全中心</p>\n    `;
    try {
      await this.mailService.sendMail({
        to: email,
        subject,
        text: plainText,
        html: htmlContent,
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
      throw new BadRequestException('密码长度至少 8 位');
    }
    const email = this.normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('邮箱地址不能为空');
    }
    const result = await this.signUpInternal(
      {
        email,
        password: dto.password,
        name: dto.name ?? email,
        rememberMe: dto.rememberMe ?? false,
        minecraftId: dto.minecraftId,
        minecraftNick: dto.minecraftNick,
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
      throw new BadRequestException('AuthMe 注册暂未开放');
    }
    if (!dto.authmeId) {
      throw new BadRequestException('缺少 AuthMe 账号');
    }
    const authmeId = dto.authmeId.trim();
    if (!authmeId) {
      throw new BadRequestException('缺少 AuthMe 账号');
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

  private async loginWithEmail(dto: AuthLoginDto, context: RequestContext) {
    if (dto.password.length < 8) {
      throw new BadRequestException('密码长度至少 8 位');
    }
    const result = await this.signInInternal({
      email: dto.email!,
      password: dto.password,
      rememberMe: dto.rememberMe ?? false,
    });

    const userId = result.user.id;
    await this.updateSessionMetadata(result.tokens.accessToken, context);
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
      throw new BadRequestException('AuthMe 登录暂未开放');
    }
    if (!dto.authmeId) {
      throw new BadRequestException('缺少 AuthMe 账号');
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

    const tokens = this.extractTokens(result);
    await this.updateSessionMetadata(tokens.accessToken, context);
    await this.prisma.user.update({
      where: { id: payload.user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: context.ip ?? null,
      },
    });
    const fullUser = await this.usersService.getSessionUser(payload.user.id);

    return {
      tokens,
      user: fullUser,
      cookies: tokens.cookies,
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
    if (!payload.user?.id || !payload.token) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = this.extractTokens(result);
    const user = await this.usersService.getSessionUser(payload.user.id);

    return {
      tokens,
      user,
      cookies: tokens.cookies,
    };
  }

  private async createSessionForUser(
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
    return {
      tokens: { accessToken: token, refreshToken: token },
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

  private extractTokens(result: { headers: Headers; response: AuthResponse }) {
    const cookies = this.collectCookies(result.headers);
    const cookieMap = this.parseCookieMap(cookies);
    const sessionToken = result.response.token;
    const refreshToken =
      cookieMap.get('refresh_token') ??
      cookieMap.get('session_token') ??
      sessionToken ??
      null;

    return {
      accessToken: sessionToken,
      refreshToken,
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
    throw new BadRequestException('请指定要解绑的 AuthMe 账号');
  }
}
