import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { PlayerService } from './player.service';

class PlayerReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

class PermissionChangeDto {
  @IsString()
  @MaxLength(64)
  targetGroup!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

class RestartRequestDto {
  @IsUUID()
  serverId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}

@ApiTags('玩家档案接口')
@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  private resolveTargetUserId(req: Request, id?: string | null) {
    const trimmed = id?.trim();
    if (trimmed) {
      return trimmed;
    }
    if (req.user?.id) {
      return req.user.id;
    }
    throw new BadRequestException('缺少玩家 ID');
  }

  @Get('profile')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '整合获取玩家档案（可通过 id 查询）' })
  async playerProfile(
    @Req() req: Request,
    @Query('id') id?: string,
  ) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerPortalData(
      req.user?.id ?? null,
      targetId,
    );
  }

  @Get('summary')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取玩家档案概要' })
  async playerSummary(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerSummary(targetId);
  }

  @Get('login-map')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取玩家最近登录 IP 分布' })
  async playerLoginMap(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('id') id?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerLoginMap(targetId, {
      from:
        fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    });
  }

  @Get('actions')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家历史操作记录' })
  async playerActions(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
  ) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerActions(targetId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('assets')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家名下资产概览' })
  async playerAssets(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerAssets(targetId);
  }

  @Get('region')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家行政区信息' })
  async playerRegion(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerRegion(targetId);
  }

  @Get('minecraft')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家服务器账户与权限' })
  async playerMinecraft(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerMinecraftData(targetId);
  }

  @Get('stats')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家统计信息' })
  async playerStats(
    @Req() req: Request,
    @Query('id') id?: string,
  ) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.playerService.getPlayerStats(targetId);
  }

  @Get('is-logged')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '判断玩家是否在线' })
  async playerIsLogged(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    const logged = await this.playerService.getPlayerLoggedStatus(targetId);
    return { logged };
  }

  @Post('authme/reset-password')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交 AuthMe 密码重置申请' })
  async authmeReset(@Req() req: Request, @Body() body: PlayerReasonDto) {
    return this.playerService.submitAuthmeResetRequest(
      req.user!.id,
      body.reason,
    );
  }

  @Post('authme/force-login')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交强制登陆申请' })
  async authmeForceLogin(@Req() req: Request, @Body() body: PlayerReasonDto) {
    return this.playerService.submitAuthmeForceLogin(req.user!.id, body.reason);
  }

  @Post('permissions/request-change')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '自助申请权限组调整' })
  async permissionChange(
    @Req() req: Request,
    @Body() body: PermissionChangeDto,
  ) {
    return this.playerService.submitPermissionChangeRequest(req.user!.id, body);
  }

  @Post('server/restart-request')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请服务器强制重启' })
  async restartRequest(@Req() req: Request, @Body() body: RestartRequestDto) {
    return this.playerService.submitServerRestartRequest(req.user!.id, body);
  }
}
