import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { DEFAULT_PERMISSIONS, RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { CreatePermissionLabelDto } from './dto/create-permission-label.dto';
import { UpdatePermissionLabelDto } from './dto/update-permission-label.dto';

@ApiTags('角色与权限')
@ApiBearerAuth()
@Controller('auth')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ROLES)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  @ApiOperation({ summary: '列出角色' })
  async listRoles() {
    return this.rolesService.listRoles();
  }

  @Post('roles')
  @ApiOperation({ summary: '创建角色' })
  async createRole(@Body() dto: CreateRoleDto, @Req() req: Request) {
    return this.rolesService.createRole(dto, req.user?.id);
  }

  @Patch('roles/:roleId')
  @ApiOperation({ summary: '更新角色' })
  async updateRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    return this.rolesService.updateRole(roleId, dto, req.user?.id);
  }

  @Patch('roles/:roleId/permissions')
  @ApiOperation({ summary: '更新角色权限' })
  async updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
    @Req() req: Request,
  ) {
    return this.rolesService.updateRolePermissions(roleId, dto, req.user?.id);
  }

  @Delete('roles/:roleId')
  @ApiOperation({ summary: '删除角色' })
  async deleteRole(@Param('roleId') roleId: string, @Req() req: Request) {
    await this.rolesService.deleteRole(roleId, req.user?.id);
    return { success: true };
  }

  @Get('permissions')
  @ApiOperation({ summary: '列出权限点' })
  async listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Get('permissions/catalog')
  @ApiOperation({ summary: '查看权限目录' })
  async listPermissionCatalog() {
    return this.rolesService.listPermissionCatalog();
  }

  @Post('permissions')
  @ApiOperation({ summary: '创建权限点' })
  async createPermission(@Body() dto: CreatePermissionDto, @Req() req: Request) {
    return this.rolesService.createPermission(dto, req.user?.id);
  }

  @Patch('permissions/:permissionId')
  @ApiOperation({ summary: '更新权限点' })
  async updatePermission(
    @Param('permissionId') permissionId: string,
    @Body() dto: UpdatePermissionDto,
    @Req() req: Request,
  ) {
    return this.rolesService.updatePermission(
      permissionId,
      dto,
      req.user?.id,
    );
  }

  @Delete('permissions/:permissionId')
  @ApiOperation({ summary: '删除权限点' })
  async deletePermission(
    @Param('permissionId') permissionId: string,
    @Req() req: Request,
  ) {
    await this.rolesService.deletePermission(permissionId, req.user?.id);
    return { success: true };
  }

  @Get('permission-labels')
  @ApiOperation({ summary: '列出权限标签' })
  async listPermissionLabels() {
    return this.rolesService.listPermissionLabels();
  }

  @Post('permission-labels')
  @ApiOperation({ summary: '创建权限标签' })
  async createPermissionLabel(
    @Body() dto: CreatePermissionLabelDto,
    @Req() req: Request,
  ) {
    return this.rolesService.createPermissionLabel(dto, req.user?.id);
  }

  @Patch('permission-labels/:labelId')
  @ApiOperation({ summary: '更新权限标签' })
  async updatePermissionLabel(
    @Param('labelId') labelId: string,
    @Body() dto: UpdatePermissionLabelDto,
    @Req() req: Request,
  ) {
    return this.rolesService.updatePermissionLabel(labelId, dto, req.user?.id);
  }

  @Delete('permission-labels/:labelId')
  @ApiOperation({ summary: '删除权限标签' })
  async deletePermissionLabel(
    @Param('labelId') labelId: string,
    @Req() req: Request,
  ) {
    return this.rolesService.deletePermissionLabel(labelId, req.user?.id);
  }
}
