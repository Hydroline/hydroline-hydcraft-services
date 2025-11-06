import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthmeBindDto } from './dto/authme-bind.dto';
import { AuthmeUnbindDto } from './dto/authme-unbind.dto';
import { rethrowAuthmeError } from './helpers/authme-error.helper';
import { AuthmeRateLimitGuard } from '../authme/authme-rate-limit.guard';
import { buildRequestContext } from './helpers/request-context.helper';

@Controller('authme')
export class ApiAuthmeController {
  constructor(private readonly authService: AuthService) {}

  @Post('bind')
  @UseGuards(AuthGuard, AuthmeRateLimitGuard)
  async bind(@Body() dto: AuthmeBindDto, @Req() req: Request) {
    try {
      const user = await this.authService.bindAuthme(
        req.user!.id,
        dto,
        buildRequestContext(req),
      );
      return user;
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }

  @Delete('bind')
  @UseGuards(AuthGuard, AuthmeRateLimitGuard)
  async unbind(@Req() req: Request, @Body() dto: AuthmeUnbindDto) {
    try {
      const user = await this.authService.unbindAuthme(
        req.user!.id,
        dto,
        buildRequestContext(req),
      );
      return user;
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }
}
