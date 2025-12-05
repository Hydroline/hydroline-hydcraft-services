import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { RankSyncService, RankSyncJobStatus } from './rank-sync.service';
import { RankService, RankResponse } from './rank.service';
import { RankQueryDto } from './dto/rank-query.dto';
import { RankSyncRequestDto } from './dto/rank-sync.dto';

@ApiTags('排行数据')
@Controller('rank')
export class RankController {
  constructor(
    private readonly rankService: RankService,
    private readonly rankSync: RankSyncService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取服务端排行数据' })
  async list(@Query() query: RankQueryDto): Promise<RankResponse> {
    return this.rankService.list(query);
  }

  @Post('sync')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_ADMIN_DASHBOARD)
  @ApiOperation({ summary: '触发排行榜同步（仅限管理员）' })
  async requestSync(
    @Req() req: Request,
    @Body() dto: RankSyncRequestDto,
  ): Promise<RankSyncJobStatus> {
    const userId = (req.user as { id?: string } | null)?.id ?? null;
    return this.rankSync.requestSync(dto.serverId, userId);
  }

  @Get('sync/:jobId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_ADMIN_DASHBOARD)
  @ApiOperation({ summary: '查询排行榜同步任务状态' })
  async jobStatus(@Param('jobId') jobId: string): Promise<RankSyncJobStatus> {
    return this.rankSync.getJobStatus(jobId);
  }
}
