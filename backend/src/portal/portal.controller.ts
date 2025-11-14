import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PortalService } from './portal.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/services/roles.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { PortalAttachmentSearchDto } from './dto/portal-attachment-search.dto';

@ApiTags('门户接口')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Get('home')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取门户首页内容（可选登录）' })
  async home(@Req() req: Request) {
    return this.portalService.getHomePortal(req.user?.id);
  }

  @Get('admin/overview')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_USERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取后台门户总览数据' })
  async adminOverview(@Req() req: Request) {
    return this.portalService.getAdminOverview(req.user?.id ?? null);
  }

  @Get('attachments/search')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_PORTAL_HOME)
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
