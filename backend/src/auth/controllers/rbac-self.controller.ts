import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth.guard';
import { RolesService, DEFAULT_ROLES } from '../services/roles.service';
import { SelfAssignPermissionsDto } from '../dto/self-assign-permissions.dto';

@ApiTags('RBAC 自助')
@ApiBearerAuth()
@Controller('auth/rbac/self')
@UseGuards(AuthGuard)
export class RbacSelfController {
  constructor(private readonly rolesService: RolesService) {}

  @Post('permissions')
  @ApiOperation({ summary: '管理员自助添加权限节点' })
  async selfAssign(@Req() req: Request, @Body() dto: SelfAssignPermissionsDto) {
    const user = req.user as
      | {
          id: string;
          roles?: Array<{
            role?: { key?: string | null; name?: string | null } | null;
          }>;
        }
      | undefined;
    if (!user) {
      throw new ForbiddenException('缺少用户上下文');
    }
    const roleLinks = Array.isArray(user.roles) ? user.roles : [];
    const isAdmin = roleLinks.some(
      (link) =>
        link.role?.key === DEFAULT_ROLES.ADMIN ||
        link.role?.name === 'Administrator',
    );
    if (!isAdmin) {
      throw new ForbiddenException('仅 Administrator 可自助添加权限');
    }
    return this.rolesService.selfAssignPermissions(
      user.id,
      dto.permissionKeys,
      user.id,
    );
  }
}
