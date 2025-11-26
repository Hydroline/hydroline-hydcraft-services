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
import { PortalService } from './portal.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { PortalAttachmentSearchDto } from './dto/portal-attachment-search.dto';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
  IsNotEmpty,
} from 'class-validator';

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

@ApiTags('门户接口')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

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

  @Get('home')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取门户首页内容（可选登录）' })
  async home(@Req() req: Request) {
    return this.portalService.getHomePortal(req.user?.id);
  }

  @Get('header/minecraft-status')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: '获取门户 Header 显示用的 Minecraft 公共状态（无需权限）',
    description:
      '返回所有已启用服务器的最近 Ping、Beacon 时钟与 MCSM 连接状态，供前端头部时钟和悬浮卡片展示。',
  })
  async publicHeaderMinecraftStatus() {
    return this.portalService.getPublicHeaderMinecraftStatus();
  }

  @Get('player/profile')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '整合获取玩家档案（可通过 id 查询）' })
  async playerProfile(
    @Req() req: Request,
    @Query('id') id?: string,
    @Query('period') period?: string,
    @Query('actionsPage') actionsPage?: string,
  ) {
    const targetId = this.resolveTargetUserId(req, id);
    const pageNumber = actionsPage ? Number(actionsPage) : undefined;
    return this.portalService.getPlayerPortalData(
      req.user?.id ?? null,
      targetId,
      {
        period,
        actionsPage: Number.isFinite(pageNumber) ? pageNumber : undefined,
      },
    );
  }

  @Get('player/summary')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取玩家档案概要' })
  async playerSummary(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.portalService.getPlayerSummary(targetId);
  }

  @Get('player/login-map')
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
    return this.portalService.getPlayerLoginMap(targetId, {
      from:
        fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    });
  }

  @Get('player/actions')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家历史操作记录' })
  async playerActions(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
  ) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.portalService.getPlayerActions(targetId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('player/assets')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家名下资产概览' })
  async playerAssets(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.portalService.getPlayerAssets(targetId);
  }

  @Get('player/region')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家行政区信息' })
  async playerRegion(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.portalService.getPlayerRegion(targetId);
  }

  @Get('player/minecraft')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家服务器账户与权限' })
  async playerMinecraft(@Req() req: Request, @Query('id') id?: string) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.portalService.getPlayerMinecraftData(targetId);
  }

  @Get('player/stats')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '玩家统计信息' })
  async playerStats(
    @Req() req: Request,
    @Query('period') period?: string,
    @Query('id') id?: string,
  ) {
    const targetId = this.resolveTargetUserId(req, id);
    return this.portalService.getPlayerStats(targetId, period);
  }

  @Post('player/authme/reset-password')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交 AuthMe 密码重置申请' })
  async authmeReset(@Req() req: Request, @Body() body: PlayerReasonDto) {
    return this.portalService.submitAuthmeResetRequest(
      req.user!.id,
      body.reason,
    );
  }

  @Post('player/authme/force-login')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交强制登陆申请' })
  async authmeForceLogin(@Req() req: Request, @Body() body: PlayerReasonDto) {
    return this.portalService.submitAuthmeForceLogin(req.user!.id, body.reason);
  }

  @Post('player/permissions/request-change')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '自助申请权限组调整' })
  async permissionChange(
    @Req() req: Request,
    @Body() body: PermissionChangeDto,
  ) {
    return this.portalService.submitPermissionChangeRequest(req.user!.id, body);
  }

  @Post('player/server/restart-request')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请服务器强制重启' })
  async restartRequest(@Req() req: Request, @Body() body: RestartRequestDto) {
    return this.portalService.submitServerRestartRequest(req.user!.id, body);
  }

  @Get('rank/categories')
  @ApiOperation({ summary: '获取排行榜类别' })
  async rankCategories() {
    return this.portalService.getRankCategories();
  }

  @Get('rank/leaderboard')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '排行榜列表' })
  async rankLeaderboard(
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portalService.getRankLeaderboard(
      category ?? 'login-count',
      period,
      {
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
    );
  }

  @Get('rank/me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前玩家的排行榜名次' })
  async rankMe(
    @Req() req: Request,
    @Query('category') category?: string,
    @Query('period') period?: string,
  ) {
    return this.portalService.getRankContextForUser(
      category ?? 'login-count',
      period,
      req.user!.id,
    );
  }

  @Get('admin/overview')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_ADMIN_DASHBOARD)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取后台门户总览数据' })
  async adminOverview(@Req() req: Request) {
    return this.portalService.getAdminOverview(req.user?.id ?? null);
  }

  @Get('attachments/search')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_HOME_CONFIG)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索可公开引用的附件' })
  async searchAttachments(@Query() query: PortalAttachmentSearchDto) {
    return this.attachmentsService.searchAttachments(
      query.keyword,
      query.limit,
      query.publicOnly ?? true,
    );
  }
}
