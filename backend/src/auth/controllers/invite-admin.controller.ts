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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth.guard';
import { PermissionsGuard } from '../permissions.guard';
import { RequirePermissions } from '../permissions.decorator';
import { PERMISSIONS } from '../services/roles.service';
import { InviteService } from '../services/invite.service';
import { UpdateInviteFeatureDto } from '../dto/update-invite-feature.dto';

@ApiTags('邀请码管理')
@ApiBearerAuth()
@Controller('auth/admin/invites')
@UseGuards(AuthGuard, PermissionsGuard)
export class InviteAdminController {
  constructor(private readonly inviteService: InviteService) {}

  @Get()
  @ApiOperation({ summary: '分页获取邀请码列表' })
  @RequirePermissions(PERMISSIONS.AUTH_VIEW_INVITES)
  async listInvites(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.inviteService.listInvites({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      keyword,
    });
  }

  @Post()
  @ApiOperation({ summary: '生成邀请码' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_INVITES)
  async createInvite(@Req() req: Request) {
    const invite = await this.inviteService.createInvite(req.user?.id);
    return { invite };
  }

  @Delete(':inviteId')
  @ApiOperation({ summary: '删除邀请码' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_INVITES)
  async deleteInvite(@Param('inviteId') inviteId: string) {
    return this.inviteService.deleteInvite(inviteId);
  }

  @Get('feature')
  @ApiOperation({ summary: '获取邀请码注册开关' })
  @RequirePermissions(PERMISSIONS.AUTH_VIEW_INVITES)
  async getFeature() {
    const inviteRequired = await this.inviteService.getInviteRequired();
    return { inviteRequired } as const;
  }

  @Patch('feature')
  @ApiOperation({ summary: '更新邀请码注册开关' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_INVITES)
  async updateFeature(
    @Body() body: UpdateInviteFeatureDto,
    @Req() req: Request,
  ) {
    return this.inviteService.setInviteRequired(
      body.inviteRequired,
      req.user?.id,
    );
  }
}
