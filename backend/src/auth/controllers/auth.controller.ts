import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from '../services/auth.service';
import { UsersService } from '../services/users/users.service';
import { UpdateCurrentUserDto } from '../dto/update-current-user.dto';
import { SignUpDto } from '../dto/sign-up.dto';
import { SignInDto } from '../dto/sign-in.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { AuthGuard } from '../auth.guard';
import { buildRequestContext } from '../helpers/request-context.helper';
import { IpLocationService } from '../../lib/ip2region/ip-location.service';
import { AttachmentsService } from '../../attachments/attachments.service';
import { enrichUserAvatar } from '../helpers/user-avatar.helper';
import { parseSingleFileMultipart } from '../../lib/multipart/parse-single-file-multipart';
import { ChangePasswordWithCodeDto } from '../dto/change-password-with-code.dto';
import { CreateMinecraftProfileDto } from '../dto/create-minecraft-profile.dto';
import { UpdateMinecraftProfileDto } from '../dto/update-minecraft-profile.dto';
import { RedisService } from '../../lib/redis/redis.service';
import {
  AddPhoneContactDto,
  UpdatePhoneContactDto,
} from '../dto/phone-contact.dto';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

class PublicForgotPasswordDto {
  @IsEmail({}, { message: 'Email must be an email' })
  email!: string;
}

class PublicConfirmPasswordDto {
  @IsEmail({}, { message: 'Email must be an email' })
  email!: string;

  @IsString()
  code!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class AddEmailContactDto {
  @IsEmail({}, { message: 'Email must be an email' })
  email!: string;
}

class VerifyEmailContactDto {
  @IsEmail({}, { message: 'Email must be an email' })
  email!: string;

  @IsString()
  code!: string;
}

class SendPhoneVerificationDto {
  @IsString()
  @Matches(/^\+\d{2,6}[0-9\s-]{5,20}$/)
  phone!: string;
}

class VerifyPhoneContactDto {
  @IsString()
  @Matches(/^\+\d{2,6}[0-9\s-]{5,20}$/)
  phone!: string;

  @IsString()
  code!: string;
}

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly ipLocationService: IpLocationService,
    private readonly attachmentsService: AttachmentsService,
    private readonly redis: RedisService,
  ) {}

  private static readonly SESSION_RESPONSE_CACHE_TTL_MS = 30 * 1000;
  private static readonly SESSION_RESPONSE_CACHE_KEY_VERSION = 'v1';

  @Post('signup')
  @ApiOperation({ summary: '邮箱注册' })
  async signUp(
    @Body() dto: SignUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signUp(dto, buildRequestContext(req));
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('signin')
  @ApiOperation({ summary: '邮箱登录' })
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signIn(dto, buildRequestContext(req));
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: '刷新访问令牌' })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(dto);
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('signout')
  @ApiOperation({ summary: '退出登录' })
  async signOut(@Req() req: Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const token = authHeader.slice(7);
    const session = await this.authService.getSession(token);
    return this.authService.signOut(session.sessionToken);
  }

  @Post('password/code')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发送密码验证码到邮箱' })
  async requestPasswordCode(@Req() req: Request) {
    await this.authService.requestPasswordChangeCode(
      req.user!.id,
      buildRequestContext(req),
    );
    return { success: true };
  }

  @Post('password')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '使用验证码更新密码' })
  async updatePassword(
    @Req() req: Request,
    @Body() dto: ChangePasswordWithCodeDto,
  ) {
    const result = await this.authService.updatePasswordWithCode(
      req.user!.id,
      dto,
    );
    return result;
  }

  // 未登录：请求重置密码验证码（统一 success，不暴露账户存在性）
  @Post('password/forgot')
  @ApiOperation({ summary: '未登录找回密码：请求验证码（统一返回成功）' })
  async publicForgotPassword(
    @Body() dto: PublicForgotPasswordDto,
    @Req() req: Request,
  ) {
    const ctx = buildRequestContext(req);
    const result = await this.authService.requestPublicPasswordCode(
      dto.email,
      ctx,
    );
    return result;
  }

  // 未登录：提交验证码重置密码
  @Post('password/confirm')
  @ApiOperation({ summary: '未登录找回密码：提交验证码重置密码' })
  async publicConfirmPassword(@Body() dto: PublicConfirmPasswordDto) {
    const result = await this.authService.confirmPublicPasswordReset(dto);
    if (!result.success) {
      throw new UnauthorizedException('Verification code expired or invalid');
    }
    return { success: true } as const;
  }

  // ================= 自助邮箱联系人管理（需登录） =================
  @Get('me/contacts/email')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '列出我的邮箱联系人（主在前）' })
  async listMyEmailContacts(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    const items = await this.usersService.listEmailContacts(userId);
    return { items, contacts: items };
  }

  @Post('me/contacts/email')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '添加邮箱联系人（自动发送验证码）' })
  async addMyEmailContact(
    @Req() req: Request,
    @Body() dto: AddEmailContactDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    // 直接复用 addContact，channelKey 固定 email
    const contact = await this.usersService.addContact(userId, {
      channelKey: 'email',
      value: dto.email,
      isPrimary: false,
    });
    return { contact };
  }

  @Post('me/contacts/email/resend')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '重发邮箱验证验证码' })
  async resendEmailVerification(
    @Req() req: Request,
    @Body() dto: AddEmailContactDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    const result = await this.usersService.sendEmailVerificationCode(
      userId,
      dto.email,
    );
    return result;
  }

  @Post('me/contacts/email/verify')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证邮箱联系人' })
  async verifyEmailContact(
    @Req() req: Request,
    @Body() dto: VerifyEmailContactDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    const result = await this.usersService.verifyEmailContact(
      userId,
      dto.email,
      dto.code,
    );
    return result;
  }

  @Patch('me/contacts/email/:contactId/primary')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置主邮箱（需已验证）' })
  async setPrimaryEmail(
    @Req() req: Request,
    @Param('contactId') contactId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    return this.usersService.setPrimaryEmailContact(userId, contactId);
  }

  @Delete('me/contacts/email/:contactId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除邮箱联系人（自动重新指定主邮箱）' })
  async deleteEmailContact(
    @Req() req: Request,
    @Param('contactId') contactId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    await this.usersService.removeContact(userId, contactId);
    return { success: true };
  }

  // ================= 自助手机号联系人管理（需登录） =================
  @Get('me/contacts/phone')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '列出我的手机号联系人（主在前）' })
  async listMyPhoneContacts(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    const items = await this.usersService.listPhoneContacts(userId);
    return { items, contacts: items };
  }

  @Post('me/contacts/phone')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '新增手机号联系人（按需发送验证码）' })
  async addMyPhoneContact(
    @Req() req: Request,
    @Body() dto: AddPhoneContactDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    const contact = await this.usersService.addPhoneContact(userId, {
      dialCode: dto.dialCode,
      phone: dto.phone,
      isPrimary: dto.isPrimary,
    });
    return { contact };
  }

  @Patch('me/contacts/phone/:contactId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新手机号联系人（修改号码或主副状态）' })
  async updateMyPhoneContact(
    @Req() req: Request,
    @Param('contactId') contactId: string,
    @Body() dto: UpdatePhoneContactDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    const contact = await this.usersService.updatePhoneContact(
      userId,
      contactId,
      dto,
    );
    return { contact };
  }

  @Post('me/contacts/phone/resend')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发送或重发手机号验证码' })
  async resendPhoneVerification(
    @Req() req: Request,
    @Body() dto: SendPhoneVerificationDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    return this.usersService.sendPhoneVerificationCode(userId, dto.phone);
  }

  @Post('me/contacts/phone/verify')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证手机号联系人' })
  async verifyPhoneContact(
    @Req() req: Request,
    @Body() dto: VerifyPhoneContactDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    return this.usersService.verifyPhoneContact(userId, dto.phone, dto.code);
  }

  @Patch('me/contacts/phone/:contactId/primary')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置主手机号（按需需已验证）' })
  async setPrimaryPhone(
    @Req() req: Request,
    @Param('contactId') contactId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    return this.usersService.setPrimaryPhoneContact(userId, contactId);
  }

  @Delete('me/contacts/phone/:contactId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除手机号联系人' })
  async deletePhoneContact(
    @Req() req: Request,
    @Param('contactId') contactId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    await this.usersService.removeContact(userId, contactId);
    return { success: true };
  }

  @Get('me/bindings/history')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查看自己的绑定流转记录' })
  async listMyBindingHistory(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Invalid session');
    return this.usersService.listAuthmeBindingHistoryByUser(userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('session')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前会话用户' })
  async getSession(@Req() req: Request) {
    // 为会话端点补充 authmeBindings 的 IP 地理位置（展示字段）
    const userAny = req.user as unknown;
    if (!userAny || typeof userAny !== 'object') {
      return { user: null };
    }
    const sessionToken = req.sessionToken;
    const cacheKey = sessionToken
      ? this.buildSessionResponseCacheKey(sessionToken)
      : null;
    if (cacheKey) {
      const cached = await this.redis.get<{ user: unknown }>(cacheKey);
      if (cached) {
        return cached;
      }
    }
    const user = userAny as Record<string, unknown>;
    const enrichedBindings = this.mapAuthmeBindingsWithLocation(
      user.authmeBindings,
    );
    const withBindings = {
      ...user,
      authmeBindings: enrichedBindings ?? user.authmeBindings,
    };
    const enrichedUser = await enrichUserAvatar(
      this.attachmentsService,
      withBindings as any,
    );
    const payload = {
      user: enrichedUser,
    };
    if (cacheKey) {
      await this.redis.set(
        cacheKey,
        payload,
        AuthController.SESSION_RESPONSE_CACHE_TTL_MS,
      );
    }
    return payload;
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户资料' })
  async getCurrentUser(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = (req.user as Record<string, unknown>) ?? null;
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }
    const enrichedBindings = this.mapAuthmeBindingsWithLocation(
      user.authmeBindings,
    );
    const withBindings = enrichedBindings
      ? { ...(user as any), authmeBindings: enrichedBindings }
      : (user as any);
    const enrichedUser = await enrichUserAvatar(
      this.attachmentsService,
      withBindings,
    );
    return { user: enrichedUser };
  }

  // split: basic profile only
  @Get('me/basic')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户基础资料' })
  async getCurrentUserBasic(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = req.user as Record<string, unknown>;
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }
    const enrichedUser = await enrichUserAvatar(
      this.attachmentsService,
      user as any,
    );
    // pick basic fields only
    const usr = enrichedUser as Record<string, unknown>;
    const picked = {
      id: usr.id ?? null,
      name: usr.name ?? null,
      email: usr.email ?? null,
      avatarAttachmentId: usr.avatarAttachmentId ?? null,
      avatarUrl: usr.avatarUrl ?? null,
      profile: usr.profile ?? null,
      createdAt: usr.createdAt ?? null,
      updatedAt: usr.updatedAt ?? null,
      lastLoginAt: usr.lastLoginAt ?? null,
      lastLoginIp: usr.lastLoginIp ?? null,
      lastLoginIpLocation:
        (usr.lastLoginIpLocation as string | null | undefined) ??
        (usr.lastLoginIpLocationRaw as string | null | undefined) ??
        null,
    };
    return { user: picked };
  }

  @Patch('me/basic')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户基础资料' })
  async updateCurrentUserBasic(
    @Req() req: Request,
    @Body() dto: UpdateCurrentUserDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.updateCurrentUser(userId, dto);
    const enrichedUser = await enrichUserAvatar(
      this.attachmentsService,
      user as any,
    );
    return { user: enrichedUser };
  }

  // split: minecraft bindings + luckperms
  @Get('me/minecraft')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户的 AuthMe 与 LuckPerms 数据' })
  async getCurrentUserMinecraft(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.getSessionUser(userId, {
      allowFallback: false,
    });
    const enrichedBindings = this.mapAuthmeBindingsWithLocation(
      (user as Record<string, unknown>)?.['authmeBindings'],
    );
    const usr = user as Record<string, unknown>;
    return {
      user: {
        id: usr.id ?? null,
        updatedAt: usr.updatedAt ?? null,
        authmeBindings: enrichedBindings ?? null,
        luckperms: usr.luckperms ?? undefined,
      },
    };
  }

  @Post('me/minecraft-profiles')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '新增当前用户的惯用昵称' })
  async addCurrentUserMinecraftProfile(
    @Req() req: Request,
    @Body() dto: CreateMinecraftProfileDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    await this.usersService.addMinecraftProfile(userId, dto);
    const user = await this.reloadCurrentUser(userId);
    return { user };
  }

  @Patch('me/minecraft-profiles/:profileId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户的惯用昵称' })
  async updateCurrentUserMinecraftProfile(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateMinecraftProfileDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    await this.usersService.updateMinecraftProfile(userId, profileId, dto);
    const user = await this.reloadCurrentUser(userId);
    return { user };
  }

  @Delete('me/minecraft-profiles/:profileId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除当前用户的惯用昵称' })
  async removeCurrentUserMinecraftProfile(
    @Req() req: Request,
    @Param('profileId') profileId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    await this.usersService.removeMinecraftProfile(userId, profileId);
    const user = await this.reloadCurrentUser(userId);
    return { user };
  }

  // split: sessions only (same shape as GET /auth/sessions)
  @Get('me/sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户会话列表' })
  async getCurrentUserSessions(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    try {
      await this.authService.touchSession(
        req.sessionToken as string,
        buildRequestContext(req),
      );
    } catch {
      // ignore touch errors
    }
    const sessions = await this.authService.listUserSessions(userId);
    const currentToken = req.sessionToken ?? null;
    const enriched = await Promise.all(
      sessions.map(async (session) => ({
        session,
        location: await this.ipLocationService.lookup(session.ipAddress),
      })),
    );
    return {
      sessions: enriched.map(({ session, location }) => ({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        ipAddress: session.ipAddress,
        ipLocation: location?.display ?? null,
        userAgent: session.userAgent,
        isCurrent: session.token === currentToken,
      })),
    };
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '列出会话记录' })
  async listSessions(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    // Best-effort: update current session IP/UA from this request
    try {
      await this.authService.touchSession(
        req.sessionToken as string,
        buildRequestContext(req),
      );
    } catch {
      // ignore
    }
    const sessions = await this.authService.listUserSessions(userId);
    const currentToken = req.sessionToken ?? null;
    const enriched = await Promise.all(
      sessions.map(async (session) => ({
        session,
        location: await this.ipLocationService.lookup(session.ipAddress),
      })),
    );
    return {
      sessions: enriched.map(({ session, location }) => ({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        ipAddress: session.ipAddress,
        ipLocation: location?.display ?? null,
        userAgent: session.userAgent,
        isCurrent: session.token === currentToken,
      })),
    };
  }

  @Post('sessions/identify')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记会话设备信息' })
  async identifySession(
    @Req() req: Request,
    @Body()
    body: { deviceName?: string | null; devicePlatform?: string | null },
  ) {
    const token: string | undefined = req.sessionToken ?? undefined;
    if (!token) {
      throw new UnauthorizedException('Invalid session');
    }
    const result = await this.authService.identifySession(
      token,
      body ?? {},
      buildRequestContext(req),
    );
    return result;
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '撤销指定会话' })
  async revokeSession(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const removed = await this.authService.removeUserSession(userId, sessionId);
    const current = removed.token === req.sessionToken;
    return {
      success: true,
      current,
    };
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户资料' })
  async updateCurrentUser(
    @Req() req: Request,
    @Body() dto: UpdateCurrentUserDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.updateCurrentUser(userId, dto);
    const enrichedUser = await enrichUserAvatar(
      this.attachmentsService,
      user as any,
    );
    return { user: enrichedUser };
  }

  @Patch('me/avatar')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['avatar'],
    },
  })
  @ApiOperation({ summary: '更新当前用户头像（上传附件）' })
  async updateCurrentUserAvatar(@Req() req: Request): Promise<{ user: any }> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }

    const { file } = await parseSingleFileMultipart(req, {
      fileFieldName: 'avatar',
      maxFileSizeBytes: 8 * 1024 * 1024,
    });

    const existingUser = await this.usersService.getSessionUser(userId);
    const previousAvatarAttachmentId =
      (existingUser as any)?.avatarAttachmentId ?? null;

    const avatarFolder =
      await this.attachmentsService.resolveUserAvatarFolder(userId);

    const attachment = await this.attachmentsService.uploadAttachmentStream(
      userId,
      {
        originalName: file.filename,
        mimeType: file.mimeType,
        stream: file.stream,
      },
      {
        name: file.filename,
        folderId: avatarFolder?.id ?? null,
        description: 'User avatar',
        isPublic: true,
        tagKeys: [],
        visibilityMode: 'public',
        visibilityRoles: [],
        visibilityLabels: [],
        metadata: {},
      } as any,
    );

    const updated = (await this.usersService.updateCurrentUser(userId, {
      avatarAttachmentId: attachment.id,
    } as any)) as any;

    if (
      previousAvatarAttachmentId &&
      previousAvatarAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          previousAvatarAttachmentId,
        );
      } catch {
        // ignore avatar cleanup errors
      }
    }

    const enrichedUser = await enrichUserAvatar(
      this.attachmentsService,
      updated,
      attachment,
    );
    return { user: enrichedUser };
  }

  private attachCookies(res: Response, cookies: string[]) {
    if (!cookies || cookies.length === 0) {
      return;
    }
    cookies.forEach((cookie) => {
      res.append('Set-Cookie', cookie);
    });
  }

  private async reloadCurrentUser(userId: string) {
    const user = await this.usersService.getSessionUser(userId, {
      allowFallback: false,
    });
    const enrichedBindings = this.mapAuthmeBindingsWithLocation(
      (user as Record<string, unknown>)?.['authmeBindings'],
    );
    const withBindings = enrichedBindings
      ? { ...(user as any), authmeBindings: enrichedBindings }
      : (user as any);
    return enrichUserAvatar(this.attachmentsService, withBindings);
  }

  private mapAuthmeBindingsWithLocation(bindings: unknown) {
    if (!Array.isArray(bindings) || bindings.length === 0) {
      return null;
    }

    const normalized = bindings
      .map((entry) =>
        entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>)
          : null,
      )
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    if (normalized.length === 0) {
      return null;
    }

    return normalized.map((binding) => {
      const ipLocationRaw =
        (binding['ipLocationRaw'] as string | null | undefined) ??
        (binding['ip_location'] as string | null | undefined) ??
        null;
      const ipLocationDisplay =
        (binding['ipLocation'] as string | null | undefined) ??
        (binding['ip_location_display'] as string | null | undefined) ??
        ipLocationRaw;
      const regipLocationRaw =
        (binding['regipLocationRaw'] as string | null | undefined) ??
        (binding['regip_location'] as string | null | undefined) ??
        null;
      const regipLocationDisplay =
        (binding['regipLocation'] as string | null | undefined) ??
        (binding['regip_location_display'] as string | null | undefined) ??
        regipLocationRaw;
      return {
        ...binding,
        ip_location: ipLocationRaw,
        ip_location_display: ipLocationDisplay,
        regip_location: regipLocationRaw,
        regip_location_display: regipLocationDisplay,
      };
    });
  }

  private buildSessionResponseCacheKey(sessionToken: string) {
    return `auth:session-response:${AuthController.SESSION_RESPONSE_CACHE_KEY_VERSION}:${sessionToken}`;
  }
}
