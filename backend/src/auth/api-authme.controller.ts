import {
  Body,
  Controller,
  Delete,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthmeBindDto } from './dto/authme-bind.dto';
import { AuthmeUnbindDto } from './dto/authme-unbind.dto';
import { SetPrimaryAuthmeBindingDto } from './dto/set-primary-authme-binding.dto';
import { rethrowAuthmeError } from './helpers/authme-error.helper';
import { AuthmeRateLimitGuard } from '../authme/authme-rate-limit.guard';
import { buildRequestContext } from './helpers/request-context.helper';

@ApiTags('AuthMe 绑定')
@ApiBearerAuth()
@Controller('authme')
export class ApiAuthmeController {
  constructor(private readonly authService: AuthService) {}

  @Post('bind')
  @UseGuards(AuthGuard, AuthmeRateLimitGuard)
  @ApiOperation({ summary: '绑定 AuthMe 账号' })
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
  @ApiOperation({ summary: '解绑 AuthMe 账号' })
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

  @Patch('bind/primary')
  @UseGuards(AuthGuard, AuthmeRateLimitGuard)
  @ApiOperation({ summary: '设置主 AuthMe 账号' })
  async setPrimary(
    @Req() req: Request,
    @Body() dto: SetPrimaryAuthmeBindingDto,
  ) {
    try {
      return await this.authService.setPrimaryAuthmeBinding(
        req.user!.id,
        dto.bindingId,
        req.user!.id,
      );
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }
}
