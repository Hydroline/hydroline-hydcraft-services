import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { IsEmail } from 'class-validator';
import { AuthService } from '../services/auth.service';
import { AuthRegisterDto } from '../dto/auth-register.dto';
import { AuthLoginDto } from '../dto/auth-login.dto';
import { rethrowAuthmeError } from '../helpers/authme-error.helper';
import { AuthmeService } from '../../authme/authme.service';
import { buildRequestContext } from '../helpers/request-context.helper';
import { AttachmentsService } from '../../attachments/attachments.service';
import { enrichUserAvatar } from '../helpers/user-avatar.helper';

class EmailCodeRequestDto {
  @IsEmail({}, { message: 'Email must be an email' })
  email!: string;
}

@ApiTags('认证')
@Controller('auth')
export class ApiAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authmeService: AuthmeService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: '注册（支持邮箱或 AuthMe）' })
  async register(
    @Body() dto: AuthRegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.register(
        dto,
        buildRequestContext(req),
      );
      attachCookies(res, result.cookies);
      const enrichedUser = await enrichUserAvatar(
        this.attachmentsService,
        result.user as any,
      );
      return {
        tokens: result.tokens,
        user: enrichedUser,
      };
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }

  @Post('login')
  @ApiOperation({ summary: '登录（支持邮箱或 AuthMe）' })
  async login(
    @Body() dto: AuthLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.login(
        dto,
        buildRequestContext(req),
      );
      attachCookies(res, result.cookies);
      const enrichedUser = await enrichUserAvatar(
        this.attachmentsService,
        result.user as any,
      );
      return {
        tokens: result.tokens,
        user: enrichedUser,
      };
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }

  @Post('login/code')
  @ApiOperation({ summary: '发送邮箱登录验证码' })
  async requestLoginCode(
    @Body() dto: EmailCodeRequestDto,
    @Req() req: Request,
  ) {
    return this.authService.requestEmailLoginCode(
      dto.email,
      buildRequestContext(req),
    );
  }

  @Post('register/code')
  @ApiOperation({ summary: '发送注册邮箱验证码' })
  async requestRegisterCode(
    @Body() dto: EmailCodeRequestDto,
    @Req() req: Request,
  ) {
    return this.authService.requestEmailRegisterCode(
      dto.email,
      buildRequestContext(req),
    );
  }

  @Get('features')
  @ApiOperation({ summary: '获取认证功能开关' })
  async getFeatures() {
    return this.authService.getFeatureFlags();
  }

  @Get('health/authme')
  @ApiOperation({ summary: '检测 AuthMe 连接状态' })
  async getAuthmeHealth() {
    return this.authmeService.health();
  }
}

function attachCookies(res: Response, cookies: string[]) {
  if (!cookies || cookies.length === 0) {
    return;
  }
  cookies.forEach((cookie) => {
    res.append('Set-Cookie', cookie);
  });
}
