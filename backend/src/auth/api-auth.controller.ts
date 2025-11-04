import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { AuthLoginDto } from './dto/auth-login.dto';
import { rethrowAuthmeError } from './helpers/authme-error.helper';
import { AuthmeService } from '../authme/authme.service';
import { buildRequestContext } from './helpers/request-context.helper';

@Controller('api/auth')
export class ApiAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authmeService: AuthmeService,
  ) {}

  @Post('register')
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
      return {
        tokens: result.tokens,
        user: result.user,
      };
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }

  @Post('login')
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
      return {
        tokens: result.tokens,
        user: result.user,
      };
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }

  @Get('features')
  async getFeatures() {
    return this.authService.getFeatureFlags();
  }

  @Get('health/authme')
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
